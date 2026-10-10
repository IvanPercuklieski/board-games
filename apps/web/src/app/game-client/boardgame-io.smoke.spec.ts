import { Client } from 'boardgame.io/client';
import type { Game } from 'boardgame.io';

interface G {
  count: number;
}

const Counter: Game<G> = {
  name: 'counter',
  setup: () => ({ count: 0 }),
  moves: {
    increment: ({ G }) => {
      G.count++;
    },
  },
  turn: { minMoves: 1, maxMoves: 1 },
  endIf: ({ G }) => (G.count >= 3 ? { done: true } : undefined),
};

describe('boardgame.io client in Angular/Vitest', () => {
  it('runs a local game to completion', () => {
    const client = Client({ game: Counter, numPlayers: 2, debug: false });
    client.start();
    client.moves['increment']!();
    client.moves['increment']!();
    client.moves['increment']!();
    const state = client.getState()!;
    expect(state.G.count).toBe(3);
    expect(state.ctx.gameover).toEqual({ done: true });
    client.stop();
  });
});
