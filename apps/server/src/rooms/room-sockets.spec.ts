import { randomUUID } from 'node:crypto';
import { createRoomResponseSchema, SEAT_CREDENTIALS_HEADER } from '@board-table/shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { RunningApp } from '../app';
import { newRoomId, newSecret } from '../secrets';
import { startTestApp } from '../testing/app';
import { eventually, sleep } from '../testing/players';
import { connectRoom, type RoomClient } from '../testing/room-client';

/** Short presence timings so tests run fast (production: 10 s / 30 s / 2 min). */
const GRACE = 150;
const FREE_AFTER = 600;

let running: RunningApp | undefined;
const clients: RoomClient[] = [];
afterEach(async () => {
  for (const c of clients.splice(0)) c.socket.disconnect();
  await running?.stop();
  running = undefined;
});

async function setup(
  presence = { graceMs: GRACE, startupGraceMs: 0, freeSeatAfterMs: FREE_AFTER },
) {
  const t = await startTestApp({}, { presence });
  running = t.app;
  const alice = randomUUID();
  const bob = randomUUID();
  t.repo.addProfile(alice, 'Alice');
  t.repo.addProfile(bob, 'Bob');
  const call = (path: string, init: RequestInit & { json?: unknown } = {}) => {
    const { json, headers, ...rest } = init;
    return fetch(`${t.url}${path}`, {
      ...rest,
      headers: { ...(json !== undefined && { 'content-type': 'application/json' }), ...headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  };
  const aliceToken = await t.tokenFor(alice);
  const created = createRoomResponseSchema.parse(
    await (
      await call('/api/rooms', {
        method: 'POST',
        headers: { authorization: `Bearer ${aliceToken}` },
        json: { gameId: 'tictactoe', maxSeats: 2 },
      })
    ).json(),
  );
  const roomId = created.roomId;
  const token = new URL(created.inviteUrl).hash.slice(3);
  const join = async (name: string, userId?: string) => {
    const res = await call(`/api/rooms/${roomId}/join`, {
      method: 'POST',
      headers: userId ? { authorization: `Bearer ${await t.tokenFor(userId)}` } : {},
      json: { token, name },
    });
    expect(res.status).toBe(201);
    return (await res.json()) as { seatIndex: number; credentials: string };
  };
  const room = (credentials: string, id = roomId) => {
    const client = connectRoom(t.url, { roomId: id, credentials });
    clients.push(client);
    return client;
  };
  return {
    ...t,
    alice,
    bob,
    aliceToken,
    call,
    roomId,
    host: created.seat,
    join,
    room,
  };
}

const reason = (client: RoomClient) =>
  client.connected.then(
    () => 'connected',
    (e: Error) => e.message,
  );

describe('room connection: access', () => {
  it('accepts only a seated player of that room', async () => {
    const t = await setup();
    const other = await t.call('/api/rooms', {
      method: 'POST',
      headers: { authorization: `Bearer ${t.aliceToken}` },
      json: { gameId: 'tictactoe', maxSeats: 2 },
    });
    const otherRoom = createRoomResponseSchema.parse(await other.json());

    expect(await reason(connectRoom(t.url, {}))).toBe('not_found');
    expect(await reason(connectRoom(t.url, { roomId: t.roomId, credentials: newSecret() }))).toBe(
      'not_found',
    );
    expect(
      await reason(connectRoom(t.url, { roomId: newRoomId(), credentials: t.host.credentials })),
    ).toBe('not_found');
    expect(
      await reason(
        connectRoom(t.url, { roomId: otherRoom.roomId, credentials: t.host.credentials }),
      ),
    ).toBe('not_found');
    expect(
      await reason(connectRoom(t.url, { roomId: t.roomId, credentials: t.host.credentials, x: 1 })),
    ).toBe('not_found');
    expect(await reason(t.room(t.host.credentials))).toBe('connected');
  });

  it('allows at most 3 connections per seat', async () => {
    const t = await setup();
    for (let i = 0; i < 3; i++) expect(await reason(t.room(t.host.credentials))).toBe('connected');
    expect(await reason(t.room(t.host.credentials))).toBe('limit_reached');
  });

  it('rate-limits connection attempts per IP', async () => {
    const t = await setup();
    const results: string[] = [];
    for (let i = 0; i < 31; i++) {
      const c = connectRoom(t.url, { roomId: t.roomId, credentials: newSecret() });
      clients.push(c);
      results.push(await reason(c));
    }
    expect(results.slice(0, 30).every((r) => r === 'not_found')).toBe(true);
    expect(results[30]).toBe('rate_limited');
  });

  it('ignores everything the browser sends', async () => {
    const t = await setup();
    const host = t.room(t.host.credentials);
    await host.connected;
    host.socket.emit('lobby', { roomId: t.roomId, status: 'playing' });
    host.socket.emit('closed');
    host.socket.emit('sync', t.roomId, '0', t.host.credentials);
    await sleep(100);
    expect(host.socket.connected).toBe(true);
    expect(host.latest()).toMatchObject({ status: 'waiting' });
    expect(host.lobbies.every((l) => l.status === 'waiting')).toBe(true);
  });
});

describe('room connection: live updates', () => {
  it('sends the lobby on connect and after every change', async () => {
    const t = await setup();
    const host = t.room(t.host.credentials);
    await host.waitFor((l) => l.seats.length === 1 && l.you.isHost);
    const bobSeat = await t.join('Bob');
    await host.waitFor((l) => l.seats.length === 2);
    const bob = t.room(bobSeat.credentials);
    await bob.waitFor((l) => l.you.seatIndex === 1 && !l.you.isHost);

    const start = await t.call(`/api/rooms/${t.roomId}/start`, {
      method: 'POST',
      headers: { authorization: `Bearer ${t.aliceToken}` },
    });
    expect(start.status).toBe(204);
    await bob.waitFor((l) => l.status === 'playing' && l.you.playerID === '1');
  });

  it('tells a removed player the table is gone and disconnects them', async () => {
    const t = await setup();
    const bobSeat = await t.join('Bob');
    const bob = t.room(bobSeat.credentials);
    await bob.connected;
    const res = await t.call(`/api/rooms/${t.roomId}/seats/1`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${t.aliceToken}` },
    });
    expect(res.status).toBe(204);
    await eventually(async () => expect(bob.closed && !bob.socket.connected).toBe(true));
  });

  it('tells everyone when the host closes the room', async () => {
    const t = await setup();
    const host = t.room(t.host.credentials);
    const bob = t.room((await t.join('Bob')).credentials);
    await Promise.all([host.connected, bob.connected]);
    await t.call(`/api/rooms/${t.roomId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${t.aliceToken}` },
    });
    await eventually(async () => expect(host.closed && bob.closed).toBe(true));
  });
});

describe('room connection: presence', () => {
  it('shows a guest as away after the grace period and frees the seat later', async () => {
    const t = await setup();
    const host = t.room(t.host.credentials);
    const bob = t.room((await t.join('Bob')).credentials);
    await Promise.all([host.connected, bob.connected]);
    await host.waitFor((l) => l.seats.length === 2 && !l.seats[1]!.away);

    bob.socket.disconnect();
    await host.waitFor((l) => l.seats[1]?.away === true);
    const start = await t.call(`/api/rooms/${t.roomId}/start`, {
      method: 'POST',
      headers: { authorization: `Bearer ${t.aliceToken}` },
    });
    expect(start.status).toBe(409);
    expect(await start.json()).toEqual({ error: 'players_away' });

    await host.waitFor((l) => l.seats.length === 1);
  });

  it('a reload within the grace period never shows as away', async () => {
    const t = await setup();
    const host = t.room(t.host.credentials);
    const bobSeat = await t.join('Bob');
    const first = t.room(bobSeat.credentials);
    await Promise.all([host.connected, first.connected]);
    first.socket.disconnect();
    await sleep(GRACE / 3);
    const second = t.room(bobSeat.credentials);
    await second.connected;
    await sleep(FREE_AFTER + GRACE);
    expect(host.lobbies.some((l) => l.seats.some((s) => s.away))).toBe(false);
    expect(host.latest()!.seats).toHaveLength(2);
  });

  it('hands the room to a signed-in player as soon as the host is away', async () => {
    const t = await setup();
    const host = t.room(t.host.credentials);
    const bob = t.room((await t.join('Bob', t.bob)).credentials);
    await Promise.all([host.connected, bob.connected]);
    await bob.waitFor((l) => l.seats.length === 2);

    host.socket.disconnect();
    await bob.waitFor((l) => l.you.isHost);
    expect((await t.repo.findRoom(t.roomId))!.hostUserId).toBe(t.bob);
    // the old host is a regular seat now, freed once it has been away long enough
    await bob.waitFor((l) => l.seats.length === 1);
  });

  it('deletes the room when the host is away and only guests are left', async () => {
    const t = await setup();
    const host = t.room(t.host.credentials);
    const gus = t.room((await t.join('Gus')).credentials);
    await Promise.all([host.connected, gus.connected]);
    host.socket.disconnect();
    await eventually(async () => expect(gus.closed).toBe(true));
    expect(await t.repo.findRoom(t.roomId)).toBeUndefined();
  });

  it('a seat that never connects goes away too', async () => {
    const t = await setup();
    const host = t.room(t.host.credentials);
    await host.connected;
    await t.join('Bob');
    await host.waitFor((l) => l.seats[1]?.away === true);
  });

  it('gives everyone the startup grace after a server start', async () => {
    const t = await setup({ graceMs: GRACE, startupGraceMs: 1_000, freeSeatAfterMs: 5_000 });
    const host = t.room(t.host.credentials);
    await host.connected;
    await t.join('Bob');
    await sleep(GRACE * 3);
    expect(host.latest()!.seats[1]!.away).toBe(false);
  });

  it('leaving frees the seat at once; the host leaving hands the room over', async () => {
    const t = await setup();
    const bobSeat = await t.join('Bob', t.bob);
    const bob = t.room(bobSeat.credentials);
    await bob.connected;
    const left = await t.call(`/api/rooms/${t.roomId}/leave`, {
      method: 'POST',
      headers: { [SEAT_CREDENTIALS_HEADER]: t.host.credentials },
    });
    expect(left.status).toBe(204);
    await bob.waitFor((l) => l.you.isHost && l.seats.length === 1);
  });

  it('drops every presence entry once the room is gone', async () => {
    const t = await setup();
    const host = t.room(t.host.credentials);
    await host.connected;
    await t.join('Bob');
    await t.call(`/api/rooms/${t.roomId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${t.aliceToken}` },
    });
    await eventually(async () => expect(t.app.presenceSize()).toBe(0));
  });
});
