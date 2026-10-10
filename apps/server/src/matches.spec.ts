import { beforeEach, describe, expect, it } from 'vitest';
import { buildMatch, MatchError, setMatchSeat } from './matches';
import { MemoryStorage } from './testing/memory-storage';

const alice = { name: 'Alice', credentialsHash: 'hash-alice' };
const bob = { name: 'Bob', credentialsHash: 'hash-bob' };

describe('buildMatch', () => {
  it('builds initial state and metadata with exactly the given players, in order', () => {
    const { initialState, metadata } = buildMatch('tictactoe', [alice, bob]);
    expect(initialState.G).toEqual({ cells: Array(9).fill(null) });
    expect(initialState.ctx.numPlayers).toBe(2);
    expect(metadata.gameName).toBe('tictactoe');
    expect(metadata.unlisted).toBe(true);
    expect(metadata.players).toEqual({
      0: { id: 0, name: 'Alice', credentials: 'hash-alice' },
      1: { id: 1, name: 'Bob', credentials: 'hash-bob' },
    });
  });

  it('rejects unknown games', () => {
    expect(() => buildMatch('nope', [alice, bob])).toThrow(MatchError);
  });

  it('rejects a player count outside the game limits', () => {
    expect(() => buildMatch('tictactoe', [alice])).toThrow(MatchError);
    expect(() => buildMatch('tictactoe', [alice, bob, { ...bob, name: 'Carol' }])).toThrow(
      MatchError,
    );
  });
});

describe('setMatchSeat', () => {
  let db: MemoryStorage;
  const matchID = 'match-1';
  beforeEach(async () => {
    db = new MemoryStorage();
    await db.createMatch(matchID, buildMatch('tictactoe', [alice, bob]));
  });

  it('frees a seat: name and credentials are removed', async () => {
    await setMatchSeat(db, matchID, 1, undefined);
    const { metadata } = await db.fetch(matchID, { metadata: true });
    expect(metadata.players[1]).toEqual({ id: 1 });
    expect(metadata.players[0]).toEqual({ id: 0, name: 'Alice', credentials: 'hash-alice' });
  });

  it('gives a seat to a new player', async () => {
    await setMatchSeat(db, matchID, 1, { name: 'Carol', credentialsHash: 'hash-carol' });
    const { metadata } = await db.fetch(matchID, { metadata: true });
    expect(metadata.players[1]).toEqual({ id: 1, name: 'Carol', credentials: 'hash-carol' });
  });

  it('refuses unknown matches and seats', async () => {
    await expect(setMatchSeat(db, 'missing', 0, undefined)).rejects.toThrow(MatchError);
    await expect(setMatchSeat(db, matchID, 5, undefined)).rejects.toThrow(MatchError);
  });
});
