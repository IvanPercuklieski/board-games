import { randomUUID } from 'node:crypto';
import {
  apiErrorSchema,
  createRoomResponseSchema,
  joinResponseSchema,
  listRoomsResponseSchema,
  lobbyResponseSchema,
  previewResponseSchema,
  SEAT_CREDENTIALS_HEADER,
  type ApiErrorCode,
  type CreateRoomResponse,
} from '@board-table/shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { RunningApp } from '../app';
import { newRoomId, newSecret } from '../secrets';
import { startTestApp } from '../testing/app';
import type { MemoryRoomsRepository } from '../testing/memory-rooms-repository';
import { connectPlayer, playMove, waitForState } from '../testing/players';

let running: RunningApp | undefined;
afterEach(async () => {
  await running?.stop();
  running = undefined;
});

interface Ctx {
  url: string;
  repo: MemoryRoomsRepository;
  tokenFor: (userId: string) => Promise<string>;
}

async function setup(overrides: Parameters<typeof startTestApp>[0] = {}) {
  const t = await startTestApp(overrides);
  running = t.app;
  const alice = randomUUID();
  t.repo.addProfile(alice, 'Alice');
  return { ...t, alice, aliceToken: await t.tokenFor(alice) };
}

function api(url: string, path: string, init: RequestInit & { json?: unknown } = {}) {
  const { json, headers, ...rest } = init;
  return fetch(`${url}${path}`, {
    ...rest,
    headers: {
      ...(json !== undefined && { 'content-type': 'application/json' }),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const seatHeader = (credentials: string) => ({ [SEAT_CREDENTIALS_HEADER]: credentials });

async function expectError(res: Response, status: number, code: ApiErrorCode) {
  expect(res.status).toBe(status);
  expect(apiErrorSchema.parse(await res.json())).toEqual({ error: code });
}

async function createRoom(c: Ctx, token: string, maxSeats = 2) {
  const res = await api(c.url, '/api/rooms', {
    method: 'POST',
    headers: bearer(token),
    json: { gameId: 'tictactoe', maxSeats },
  });
  expect(res.status).toBe(201);
  const body = createRoomResponseSchema.parse(await res.json());
  return { ...body, token: new URL(body.inviteUrl).hash.slice(3) };
}

async function join(c: Ctx, room: CreateRoomResponse & { token: string }, name: string) {
  const res = await api(c.url, `/api/rooms/${room.roomId}/join`, {
    method: 'POST',
    json: { token: room.token, name },
  });
  expect(res.status).toBe(201);
  return joinResponseSchema.parse(await res.json());
}

describe('public config', () => {
  it('serves the Supabase URL and anon key for the web app, uncached', async () => {
    const { url } = await setup();
    const res = await api(url, '/api/config');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({
      supabaseUrl: 'https://abc.supabase.co',
      supabaseAnonKey: 'test-anon-key',
    });
  });
});

describe('host authentication', () => {
  it.each([
    ['no Authorization header', {}],
    ['a malformed header', { authorization: 'Token abc' }],
    ['a forged token', { authorization: 'Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.' }],
  ])('rejects %s', async (_case, headers) => {
    const { url } = await setup();
    await expectError(
      await api(url, '/api/rooms', {
        method: 'POST',
        headers,
        json: { gameId: 'tictactoe', maxSeats: 2 },
      }),
      401,
      'unauthorized',
    );
    await expectError(await api(url, '/api/rooms', { headers }), 401, 'unauthorized');
  });

  it('refuses logged-in users without a profile', async () => {
    const { url, tokenFor } = await setup();
    const token = await tokenFor(randomUUID());
    await expectError(
      await api(url, '/api/rooms', {
        method: 'POST',
        headers: bearer(token),
        json: { gameId: 'tictactoe', maxSeats: 2 },
      }),
      403,
      'forbidden',
    );
  });
});

describe('request validation', () => {
  it.each([
    ['unknown fields', { gameId: 'tictactoe', maxSeats: 2, hostUserId: 'x' }],
    ['a bad seat count', { gameId: 'tictactoe', maxSeats: 99 }],
    ['a missing game', { maxSeats: 2 }],
  ])('rejects bodies with %s', async (_case, json) => {
    const { url, aliceToken } = await setup();
    await expectError(
      await api(url, '/api/rooms', { method: 'POST', headers: bearer(aliceToken), json }),
      400,
      'validation_error',
    );
  });

  it('rejects non-JSON and malformed JSON bodies', async () => {
    const { url, aliceToken } = await setup();
    await expectError(
      await api(url, '/api/rooms', {
        method: 'POST',
        headers: { ...bearer(aliceToken), 'content-type': 'text/plain' },
        body: 'gameId=tictactoe',
      }),
      400,
      'validation_error',
    );
    await expectError(
      await api(url, '/api/rooms', {
        method: 'POST',
        headers: { ...bearer(aliceToken), 'content-type': 'application/json' },
        body: '{"gameId":',
      }),
      400,
      'validation_error',
    );
  });

  it('rejects bodies over 10 kB', async () => {
    const { url, aliceToken } = await setup();
    await expectError(
      await api(url, '/api/rooms', {
        method: 'POST',
        headers: bearer(aliceToken),
        json: { gameId: 'tictactoe', maxSeats: 2, padding: 'x'.repeat(11_000) },
      }),
      413,
      'validation_error',
    );
  });

  it('answers not_found for malformed room ids and unknown API paths', async () => {
    const { url } = await setup();
    await expectError(
      await api(url, '/api/rooms/../../etc/join', {
        method: 'POST',
        json: { token: newSecret(), name: 'x' },
      }),
      404,
      'not_found',
    );
    await expectError(await api(url, '/api/nope'), 404, 'not_found');
    await expectError(await api(url, '/api/rooms', { method: 'PUT' }), 404, 'not_found');
  });
});

describe('rooms flow', () => {
  it('host creates, guest previews and joins, host starts, both play over websockets', async () => {
    const c = await setup();
    const room = await createRoom(c, c.aliceToken);

    const preview = await api(c.url, `/api/rooms/${room.roomId}/preview`, {
      method: 'POST',
      json: { token: room.token },
    });
    expect(previewResponseSchema.parse(await preview.json())).toMatchObject({
      hostName: 'Alice',
      freeSeats: 1,
    });

    const bobSeat = await join(c, room, 'Bob');
    const lobby = await api(c.url, `/api/rooms/${room.roomId}/lobby`, {
      headers: seatHeader(bobSeat.credentials),
    });
    expect(lobbyResponseSchema.parse(await lobby.json())).toMatchObject({
      status: 'waiting',
      you: { seatIndex: 1 },
    });

    const list = await api(c.url, '/api/rooms', { headers: bearer(c.aliceToken) });
    expect(listRoomsResponseSchema.parse(await list.json()).rooms[0]!.seats).toHaveLength(2);

    const start = await api(c.url, `/api/rooms/${room.roomId}/start`, {
      method: 'POST',
      headers: bearer(c.aliceToken),
    });
    expect(start.status).toBe(204);

    const bobLobby = lobbyResponseSchema.parse(
      await (
        await api(c.url, `/api/rooms/${room.roomId}/lobby`, {
          headers: seatHeader(bobSeat.credentials),
        })
      ).json(),
    );
    expect(bobLobby.you).toEqual({ seatIndex: 1, playerID: '1' });

    const alice = connectPlayer(c.url, room.roomId, {
      playerID: '0',
      credentials: room.seat.credentials,
    });
    const bob = connectPlayer(c.url, room.roomId, {
      playerID: '1',
      credentials: bobSeat.credentials,
    });
    try {
      for (const [p, cell] of [
        [alice, 0],
        [bob, 3],
        [alice, 1],
        [bob, 4],
        [alice, 2],
      ] as const) {
        await playMove(p, cell);
      }
      expect((await waitForState(bob, (s) => s.ctx.gameover !== undefined)).ctx.gameover).toEqual({
        winner: '0',
      });
    } finally {
      alice.stop();
      bob.stop();
    }
  });

  it('regenerates the invite link, frees a seat and closes the room', async () => {
    const c = await setup();
    const room = await createRoom(c, c.aliceToken);
    await join(c, room, 'Bob');

    const invite = await api(c.url, `/api/rooms/${room.roomId}/invite`, {
      method: 'POST',
      headers: bearer(c.aliceToken),
    });
    expect(invite.status).toBe(200);
    const { inviteUrl } = (await invite.json()) as { inviteUrl: string };
    await expectError(
      await api(c.url, `/api/rooms/${room.roomId}/join`, {
        method: 'POST',
        json: { token: room.token, name: 'Mallory' },
      }),
      404,
      'not_found',
    );

    const free = await api(c.url, `/api/rooms/${room.roomId}/seats/1`, {
      method: 'DELETE',
      headers: bearer(c.aliceToken),
    });
    expect(free.status).toBe(204);
    await join(c, { ...room, token: new URL(inviteUrl).hash.slice(3) }, 'Carol');

    await expectError(
      await api(c.url, `/api/rooms/${room.roomId}/seats/abc`, {
        method: 'DELETE',
        headers: bearer(c.aliceToken),
      }),
      400,
      'validation_error',
    );

    const close = await api(c.url, `/api/rooms/${room.roomId}`, {
      method: 'DELETE',
      headers: bearer(c.aliceToken),
    });
    expect(close.status).toBe(204);
    expect(await c.repo.findRoom(room.roomId)).toBeUndefined();
  });

  it('maps rule failures to HTTP statuses', async () => {
    const c = await setup();
    const room = await createRoom(c, c.aliceToken);
    await join(c, room, 'Bob');
    await expectError(
      await api(c.url, `/api/rooms/${room.roomId}/join`, {
        method: 'POST',
        json: { token: room.token, name: 'Carol' },
      }),
      409,
      'room_full',
    );
    await createRoom(c, c.aliceToken);
    await createRoom(c, c.aliceToken);
    await expectError(
      await api(c.url, '/api/rooms', {
        method: 'POST',
        headers: bearer(c.aliceToken),
        json: { gameId: 'tictactoe', maxSeats: 2 },
      }),
      409,
      'limit_reached',
    );
  });

  it("answers not_found for other hosts' rooms", async () => {
    const c = await setup();
    const room = await createRoom(c, c.aliceToken);
    const bob = randomUUID();
    c.repo.addProfile(bob, 'Bob');
    const bobToken = await c.tokenFor(bob);
    await expectError(
      await api(c.url, `/api/rooms/${room.roomId}/start`, {
        method: 'POST',
        headers: bearer(bobToken),
      }),
      404,
      'not_found',
    );
    await expectError(
      await api(c.url, `/api/rooms/${room.roomId}`, {
        method: 'DELETE',
        headers: bearer(bobToken),
      }),
      404,
      'not_found',
    );
  });

  it('requires valid seat credentials for the lobby', async () => {
    const c = await setup();
    const room = await createRoom(c, c.aliceToken);
    const lobby = `/api/rooms/${room.roomId}/lobby`;
    await expectError(await api(c.url, lobby), 401, 'unauthorized');
    await expectError(
      await api(c.url, lobby, { headers: seatHeader('short') }),
      401,
      'unauthorized',
    );
    await expectError(
      await api(c.url, lobby, { headers: seatHeader(newSecret()) }),
      404,
      'not_found',
    );
    await expectError(
      await api(c.url, `/api/rooms/${newRoomId()}/lobby`, {
        headers: seatHeader(room.seat.credentials),
      }),
      404,
      'not_found',
    );
  });
});

describe('rate limiting', () => {
  it('limits join/preview to 10 per minute per IP', async () => {
    const c = await setup();
    const room = await createRoom(c, c.aliceToken);
    const attempt = () =>
      api(c.url, `/api/rooms/${room.roomId}/preview`, {
        method: 'POST',
        json: { token: newSecret() },
      });
    for (let i = 0; i < 10; i++) expect((await attempt()).status).toBe(404);
    const limited = await attempt();
    await expectError(limited, 429, 'rate_limited');
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('limits room creation to 10 per hour per user', async () => {
    const c = await setup();
    for (let i = 0; i < 10; i++) {
      const room = await createRoom(c, c.aliceToken);
      await api(c.url, `/api/rooms/${room.roomId}`, {
        method: 'DELETE',
        headers: bearer(c.aliceToken),
      });
    }
    await expectError(
      await api(c.url, '/api/rooms', {
        method: 'POST',
        headers: bearer(c.aliceToken),
        json: { gameId: 'tictactoe', maxSeats: 2 },
      }),
      429,
      'rate_limited',
    );
  });

  it('limits all API calls to 60 per minute per IP', async () => {
    const { url } = await setup();
    for (let i = 0; i < 60; i++) expect((await api(url, '/api/config')).status).toBe(200);
    await expectError(await api(url, '/api/config'), 429, 'rate_limited');
  });

  it('behind a proxy, uses the IP added by the proxy (spoofed entries are ignored)', async () => {
    const { url } = await setup({ trustProxy: true });
    const from = (forwardedFor: string) =>
      api(url, '/api/config', { headers: { 'x-forwarded-for': forwardedFor } });
    for (let i = 0; i < 60; i++) {
      // the attacker varies the spoofable first entry; the proxy-added last entry stays the same
      expect((await from(`10.0.0.${i}, 203.0.113.7`)).status).toBe(200);
    }
    await expectError(await from('10.9.9.9, 203.0.113.7'), 429, 'rate_limited');
    expect((await from('198.51.100.1')).status).toBe(200);
  });
});
