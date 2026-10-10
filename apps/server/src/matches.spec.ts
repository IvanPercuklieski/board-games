import { describe, expect, it } from 'vitest';
import { buildMatch, MatchError } from './matches';

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
