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

function findWinner(cells: TicTacToeState['cells']): string | null {
  for (const [a, b, c] of LINES) {
    if (cells[a] !== null && cells[a] === cells[b] && cells[a] === cells[c]) return cells[a]!;
  }
  return null;
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
    const winner = findWinner(G.cells);
    if (winner !== null) return { winner };
    if (G.cells.every((c) => c !== null)) return { draw: true };
    return undefined;
  },
};
