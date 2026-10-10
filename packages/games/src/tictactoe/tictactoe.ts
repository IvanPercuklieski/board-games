import type { Game } from 'boardgame.io';
import { INVALID_MOVE } from 'boardgame.io/core';

/** Each cell holds the playerID ('0' or '1') that marked it, or null. */
export interface TicTacToeState {
  cells: (string | null)[];
}

const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
] as const;

/** The three cells of a completed line, or null. Used by the rules and by the board UI. */
export function findWinningLine(
  cells: TicTacToeState['cells'],
): readonly [number, number, number] | null {
  return (
    LINES.find(([a, b, c]) => cells[a] != null && cells[a] === cells[b] && cells[a] === cells[c]) ??
    null
  );
}

export const TicTacToe: Game<TicTacToeState> = {
  name: 'tictactoe',
  minPlayers: 2,
  maxPlayers: 2,

  setup: () => ({ cells: Array(9).fill(null) }),

  turn: { minMoves: 1, maxMoves: 1 },

  moves: {
    clickCell: ({ G, playerID }, id: number) => {
      if (!Number.isInteger(id) || id < 0 || id >= G.cells.length) return INVALID_MOVE;
      if (G.cells[id] !== null) return INVALID_MOVE;
      G.cells[id] = playerID;
      return undefined;
    },
  },

  endIf: ({ G }) => {
    const line = findWinningLine(G.cells);
    if (line) return { winner: G.cells[line[0]]! };
    if (G.cells.every((c) => c !== null)) return { draw: true };
    return undefined;
  },
};
