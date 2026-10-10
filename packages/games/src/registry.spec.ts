import { describe, expect, it } from 'vitest';
import { gameRegistry, getGameDefinition } from './registry';
import { TicTacToe } from './tictactoe/tictactoe';

describe('game registry', () => {
  it('registers tic-tac-toe with its player limits', () => {
    expect(getGameDefinition('tictactoe')).toEqual({
      id: 'tictactoe',
      displayName: 'Tic-tac-toe',
      minPlayers: 2,
      maxPlayers: 2,
      game: TicTacToe,
    });
  });

  it('uses the boardgame.io game name as the registry id', () => {
    for (const def of gameRegistry) expect(def.game.name).toBe(def.id);
  });

  it('has unique ids', () => {
    const ids = gameRegistry.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns undefined for an unknown game', () => {
    expect(getGameDefinition('nope')).toBeUndefined();
  });
});
