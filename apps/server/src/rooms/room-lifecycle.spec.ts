import { randomUUID } from 'node:crypto';
import type { Server, State } from 'boardgame.io';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildMatch } from '../matches';
import { newRoomId } from '../secrets';
import { MemoryRoomsRepository } from '../testing/memory-rooms-repository';
import { MemoryStorage } from '../testing/memory-storage';
import { RoomLifecycle } from './room-lifecycle';
import { SeatEvents } from './seat-events';

const HOUR = 3_600_000;

let storage: MemoryStorage;
let repo: MemoryRoomsRepository;
let host: string;
let now: number;
let logged: unknown[];
let seatEvents: SeatEvents;
let lifecycle: RoomLifecycle;

beforeEach(() => {
  storage = new MemoryStorage();
  repo = new MemoryRoomsRepository(storage);
  host = randomUUID();
  repo.addProfile(host, 'Alice');
  now = Date.now();
  logged = [];
  seatEvents = new SeatEvents();
  lifecycle = new RoomLifecycle({
    repo,
    seatEvents,
    now: () => now,
    log: (...args) => logged.push(args),
  });
});

afterEach(() => {
  lifecycle.stop();
  vi.useRealTimers();
});

/** A waiting room with the host and one guest seated. */
async function waitingRoom() {
  const id = newRoomId();
  await repo.createRoom(
    { id, gameId: 'tictactoe', hostUserId: host, maxSeats: 2, inviteTokenHash: 'h' },
    { name: 'Alice', userId: host, credentialsHash: 'a' },
    10,
  );
  await repo.takeFreeSeat(id, { name: 'Bob', credentialsHash: 'b' });
  return id;
}

/** A started room (host + one guest) whose match lives in `storage`. */
async function startedRoom() {
  const id = await waitingRoom();
  await repo.startRoom(id, (seats) => buildMatch('tictactoe', seats));
  return id;
}

async function current(id: string) {
  const { state, metadata } = await storage.fetch(id, { state: true, metadata: true });
  return { state: state as State, metadata: metadata as Server.MatchData };
}

describe('observed storage (what boardgame.io writes through)', () => {
  it('records activity on every move', async () => {
    const id = await startedRoom();
    repo.setLastActivity(id, new Date(0));
    const observed = lifecycle.wrap(storage);
    const { state } = await current(id);
    await observed.setState(id, { ...state, _stateID: 1 });
    expect((await repo.findRoom(id))!.lastActivityAt.getTime()).toBeGreaterThan(0);
    expect((await storage.fetch(id, { state: true })).state._stateID).toBe(1);
  });

  it('deletes the match and reopens the room as soon as the game is over', async () => {
    const id = await startedRoom();
    const ended = vi.fn();
    const changed = vi.fn();
    seatEvents.onMatchEnded(ended);
    seatEvents.onRoomChanged(changed);
    const observed = lifecycle.wrap(storage);
    const { metadata } = await current(id);
    await observed.setMetadata(id, { ...metadata, gameover: { winner: '0' } });
    expect(await repo.findRoom(id)).toMatchObject({ status: 'waiting' });
    expect(await repo.listSeats(id)).toHaveLength(2);
    expect((await storage.fetch(id, { state: true })).state).toBeUndefined();
    expect(ended).toHaveBeenCalledWith(id); // its players' sockets are disconnected
    expect(changed).toHaveBeenCalledWith(id); // room connections see it waiting again
  });

  it('keeps the room for metadata writes without a game over', async () => {
    const id = await startedRoom();
    const observed = lifecycle.wrap(storage);
    const { metadata } = await current(id);
    await observed.setMetadata(id, { ...metadata, updatedAt: 123 });
    expect(await repo.findRoom(id)).toBeDefined();
  });

  it('never lets cleanup errors break the game write; they are logged', async () => {
    const id = await startedRoom();
    vi.spyOn(repo, 'touch').mockRejectedValue(new Error('db down'));
    const observed = lifecycle.wrap(storage);
    const { state } = await current(id);
    await expect(observed.setState(id, { ...state, _stateID: 1 })).resolves.toBeUndefined();
    expect((await storage.fetch(id, { state: true })).state._stateID).toBe(1);
    expect(logged).toHaveLength(1);
  });

  it('passes every other storage call straight through', async () => {
    const observed = lifecycle.wrap(storage);
    const id = newRoomId();
    await observed.createMatch(
      id,
      buildMatch('tictactoe', [
        { name: 'A', credentialsHash: 'a' },
        { name: 'B', credentialsHash: 'b' },
      ]),
    );
    expect(await observed.listMatches()).toEqual([id]);
    expect(await observed.setPlayerSeat(id, 1, undefined)).toBe(true);
    expect((await observed.fetch(id, { metadata: true })).metadata.players[1]).toEqual({ id: 1 });
    await observed.wipe(id);
    expect(await storage.listMatches()).toEqual([]);
  });
});

describe('stale room sweep', () => {
  it('deletes games in progress without activity for 48 hours and keeps the others', async () => {
    const stale = await startedRoom();
    const fresh = await startedRoom();
    repo.setLastActivity(stale, new Date(now - 48 * HOUR - 1));
    repo.setLastActivity(fresh, new Date(now - 47 * HOUR));

    expect(await lifecycle.sweepStale()).toBe(1);
    expect(await repo.findRoom(stale)).toBeUndefined();
    expect((await storage.fetch(stale, { state: true })).state).toBeUndefined();
    expect(await repo.findRoom(fresh)).toBeDefined();
  });

  it('deletes waiting rooms after 1 hour without activity', async () => {
    const stale = await waitingRoom();
    const fresh = await waitingRoom();
    repo.setLastActivity(stale, new Date(now - HOUR - 1));
    repo.setLastActivity(fresh, new Date(now - HOUR + 60_000));
    const closed = vi.fn();
    seatEvents.onRoomClosed(closed);

    expect(await lifecycle.sweepStale()).toBe(1);
    expect(closed).toHaveBeenCalledWith(stale);
    expect(closed).toHaveBeenCalledTimes(1);
    expect(await repo.findRoom(stale)).toBeUndefined();
    expect(await repo.findRoom(fresh)).toBeDefined();
  });

  it('runs every 15 minutes once started and stops cleanly', async () => {
    vi.useFakeTimers();
    const stale = await startedRoom();
    repo.setLastActivity(stale, new Date(now - 49 * HOUR));
    lifecycle.start();
    await vi.advanceTimersByTimeAsync(15 * 60_000);
    expect(await repo.findRoom(stale)).toBeUndefined();
    lifecycle.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('logs sweep errors instead of crashing', async () => {
    vi.spyOn(repo, 'listStaleRoomIds').mockRejectedValue(new Error('db down'));
    await expect(lifecycle.sweepStale()).resolves.toBe(0);
    expect(logged).toHaveLength(1);
  });
});
