import { beforeEach, describe, expect, it } from 'vitest';
import { claimSeat, createMatch, MatchError } from './matches';
import { MemoryStorage } from './testing/memory-storage';

describe('createMatch', () => {
  let db: MemoryStorage;
  beforeEach(() => {
    db = new MemoryStorage();
  });

  it('stores a new match with initial state and empty seats', async () => {
    const matchID = await createMatch(db, 'tictactoe');
    const { state, metadata } = await db.fetch(matchID, { state: true, metadata: true });
    expect(state.G).toEqual({ cells: Array(9).fill(null) });
    expect(metadata.gameName).toBe('tictactoe');
    expect(Object.keys(metadata.players)).toEqual(['0', '1']);
    expect(metadata.players[0]!.name).toBeUndefined();
  });

  it('creates unguessable, unique match ids', async () => {
    const a = await createMatch(db, 'tictactoe');
    const b = await createMatch(db, 'tictactoe');
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(16);
  });

  it('rejects unknown games', async () => {
    await expect(createMatch(db, 'nope')).rejects.toThrow(MatchError);
  });

  it('rejects a player count outside the game limits', async () => {
    await expect(createMatch(db, 'tictactoe', { numPlayers: 3 })).rejects.toThrow(MatchError);
    await expect(createMatch(db, 'tictactoe', { numPlayers: 1 })).rejects.toThrow(MatchError);
  });
});

describe('claimSeat', () => {
  let db: MemoryStorage;
  let matchID: string;
  beforeEach(async () => {
    db = new MemoryStorage();
    matchID = await createMatch(db, 'tictactoe');
  });

  it('gives the first free seat a name and secret credentials', async () => {
    const seat = await claimSeat(db, matchID, '  Alice  ');
    expect(seat.playerID).toBe('0');
    expect(seat.credentials.length).toBeGreaterThanOrEqual(32);
    const { metadata } = await db.fetch(matchID, { metadata: true });
    expect(metadata.players[0]).toMatchObject({ name: 'Alice', credentials: seat.credentials });
  });

  it('fills seats in order and never reuses a taken seat', async () => {
    const a = await claimSeat(db, matchID, 'Alice');
    const b = await claimSeat(db, matchID, 'Bob');
    expect([a.playerID, b.playerID]).toEqual(['0', '1']);
    expect(a.credentials).not.toBe(b.credentials);
  });

  it('gives simultaneous claims different seats', async () => {
    const results = await Promise.allSettled(
      ['A', 'B', 'C', 'D'].map((name) => claimSeat(db, matchID, name)),
    );
    const seats = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value.playerID] : []));
    expect(seats.sort()).toEqual(['0', '1']);
    const { metadata } = await db.fetch(matchID, { metadata: true });
    expect([metadata.players[0]!.name, metadata.players[1]!.name]).toEqual(['A', 'B']);
  });

  it('refuses when all seats are taken', async () => {
    await claimSeat(db, matchID, 'Alice');
    await claimSeat(db, matchID, 'Bob');
    await expect(claimSeat(db, matchID, 'Mallory')).rejects.toThrow(/full/i);
  });

  it.each(['', '   ', 'x'.repeat(25)])('rejects invalid player name %j', async (name) => {
    await expect(claimSeat(db, matchID, name)).rejects.toThrow(MatchError);
  });

  it('refuses unknown matches', async () => {
    await expect(claimSeat(db, 'missing', 'Alice')).rejects.toThrow(/not found/i);
  });
});
