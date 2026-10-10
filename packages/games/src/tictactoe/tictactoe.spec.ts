import { describe, expect, it } from 'vitest';
import { Client } from 'boardgame.io/client';
import { TicTacToe } from './tictactoe';

function startGame() {
  const client = Client({ game: TicTacToe, numPlayers: 2, debug: false });
  client.start();
  return client;
}

/** Plays cells in order, alternating players starting with player 0. */
function play(...cells: number[]) {
  const client = startGame();
  for (const cell of cells) client.moves['clickCell']!(cell);
  return client.getState()!;
}

describe('TicTacToe', () => {
  it('starts with an empty 3x3 board and player 0 to move', () => {
    const state = startGame().getState()!;
    expect(state.G.cells).toEqual(Array(9).fill(null));
    expect(state.ctx.currentPlayer).toBe('0');
    expect(state.ctx.gameover).toBeUndefined();
  });

  it('marks the clicked cell with the current player and passes the turn', () => {
    const state = play(4);
    expect(state.G.cells[4]).toBe('0');
    expect(state.ctx.currentPlayer).toBe('1');
  });

  it('alternates players', () => {
    const state = play(0, 1, 2);
    expect(state.G.cells.slice(0, 3)).toEqual(['0', '1', '0']);
    expect(state.ctx.currentPlayer).toBe('1');
  });

  it('rejects a move on an occupied cell and keeps the same player to move', () => {
    const state = play(4, 4);
    expect(state.G.cells[4]).toBe('0');
    expect(state.G.cells.filter((c) => c !== null)).toHaveLength(1);
    expect(state.ctx.currentPlayer).toBe('1');
  });

  it.each([-1, 9, 1.5, Number.NaN])('rejects an out-of-range cell %s', (cell) => {
    const state = play(cell);
    expect(state.G.cells).toEqual(Array(9).fill(null));
    expect(state.ctx.currentPlayer).toBe('0');
  });

  it.each([
    ['row', [0, 3, 1, 4, 2]],
    ['column', [0, 1, 3, 2, 6]],
    ['diagonal', [0, 1, 4, 2, 8]],
    ['anti-diagonal', [2, 0, 4, 1, 6]],
  ])('ends with a winner on a %s', (_line, cells) => {
    expect(play(...cells).ctx.gameover).toEqual({ winner: '0' });
  });

  it('lets player 1 win', () => {
    expect(play(0, 3, 1, 4, 8, 5).ctx.gameover).toEqual({ winner: '1' });
  });

  it('ends in a draw when the board is full with no winner', () => {
    // 0 | 1 | 0
    // 0 | 1 | 1
    // 1 | 0 | 0
    const state = play(0, 1, 2, 4, 3, 5, 7, 6, 8);
    expect(state.ctx.gameover).toEqual({ draw: true });
  });

  it('accepts no moves after the game is over', () => {
    const client = startGame();
    for (const cell of [0, 3, 1, 4, 2]) client.moves['clickCell']!(cell);
    client.moves['clickCell']!(8);
    expect(client.getState()!.G.cells[8]).toBeNull();
  });
});

describe('findWinningLine', () => {
  it('returns the three cells of a completed line', async () => {
    const { findWinningLine } = await import('./tictactoe');
    const cells = ['0', '0', '0', null, '1', '1', null, null, null];
    expect(findWinningLine(cells)).toEqual([0, 1, 2]);
    expect(findWinningLine([null, '1', null, null, '1', null, null, '1', null])).toEqual([1, 4, 7]);
  });

  it('returns null without a line', async () => {
    const { findWinningLine } = await import('./tictactoe');
    expect(findWinningLine(Array(9).fill(null))).toBeNull();
    expect(findWinningLine(['0', '1', '0', '0', '1', '1', '1', '0', '0'])).toBeNull();
  });
});
