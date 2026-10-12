import { describe, expect, it } from 'vitest';
import { getGeometry } from './geometry';
import { noResources } from './resources';
import type { CatanState } from './state';
import { openTable, scriptedDice } from './testing';

const geo = getGeometry('large');
const QUIET: [number, number] = [1, 1];

/** Six players, nothing produces; player 2 has a settlement and road and can afford a road. */
function table(prepare: (G: CatanState) => void = () => {}) {
  const start = geo.edges[geo.coast[2]!]!;
  return openTable({
    numPlayers: 6,
    skipSetup: true,
    dice: scriptedDice(...Array<[number, number]>(4).fill(QUIET)),
    prepare: (G) => {
      for (const tile of G.board.hexes) tile.token = null;
      G.buildings[start.vertices[0]] = { owner: '2', kind: 'settlement' };
      G.roads[start.id] = '2';
      G.hands['2']!.resources = { ...noResources(), timber: 1, clay: 1 };
      prepare(G);
    },
  });
}

describe('Special build phase (5-6 players)', () => {
  it('gives every other player, in turn order, a chance to build after a turn', () => {
    const t = table();
    t.moves['rollDice']!();
    t.moves['endTurn']!();
    expect(t.ctx.currentPlayer).toBe('0');
    expect(t.G.turn.specialBuilders).toEqual(['1', '2', '3', '4', '5']);
    expect(t.stageOf('1')).toBe('specialBuild');
    expect(t.stageOf('0')).toBeUndefined();

    t.as('1')['finishSpecialBuild']!();
    expect(t.stageOf('2')).toBe('specialBuild');
    t.as('2')['buildRoad']!(geo.coast[3]);
    expect(t.G.roads[geo.coast[3]!]).toBe('2');
    t.as('2')['finishSpecialBuild']!();
    for (const id of ['3', '4', '5']) t.as(id)['finishSpecialBuild']!();

    expect(t.ctx.currentPlayer).toBe('1');
    expect(t.stageOf('1')).toBe('roll');
  });

  it('allows building and buying only, and only for the player whose chance it is', () => {
    const t = table((G) => {
      G.hands['1']!.cards.push('windfall');
      G.hands['1']!.resources = { ...noResources(), wool: 4 };
    });
    t.moves['rollDice']!();
    t.moves['endTurn']!();
    t.as('1')['playWindfall']!('ore', 'ore');
    t.as('1')['bankTrade']!('wool', 'ore');
    t.as('1')['offerTrade']!({ wool: 1 }, { ore: 1 });
    t.as('2')['buildRoad']!(geo.coast[3]);
    t.as('2')['finishSpecialBuild']!();
    expect(t.G.hands['1']!.resources).toEqual({ ...noResources(), wool: 4 });
    expect(t.G.roads[geo.coast[3]!]).toBeNull();
    expect(t.G.turn.specialBuilders[0]).toBe('1');
  });

  it('lets a special builder buy a card for later', () => {
    const t = table((G) => {
      G.hands['1']!.resources = { ...noResources(), wool: 1, grain: 1, ore: 1 };
      G.secret.devDeck = ['guard'];
    });
    t.moves['rollDice']!();
    t.moves['endTurn']!();
    t.as('1')['buyCard']!();
    expect(t.G.hands['1']!.newCards).toEqual(['guard']);
  });

  it('a player who reached ten points in a special build wins when their turn starts', () => {
    const t = table((G) => {
      for (const v of [20, 24, 28, 40]) G.buildings[v] = { owner: '1', kind: 'city' };
      G.buildings[60] = { owner: '1', kind: 'settlement' };
      G.hands['1']!.resources = { ...noResources(), wool: 1, grain: 1, ore: 1 };
      G.secret.devDeck = ['landmark'];
    });
    t.moves['rollDice']!();
    t.moves['endTurn']!();
    t.as('1')['buyCard']!();
    expect(t.ctx.gameover).toBeUndefined();
    for (const id of ['1', '2', '3', '4', '5']) t.as(id)['finishSpecialBuild']!();
    expect(t.ctx.gameover).toEqual({ winner: '1' });
  });

  it('is not used with 3-4 players', () => {
    const t = openTable({ numPlayers: 4, skipSetup: true, dice: scriptedDice(QUIET) });
    t.moves['rollDice']!();
    t.moves['endTurn']!();
    expect(t.ctx.currentPlayer).toBe('1');
    expect(t.stageOf('1')).toBe('roll');
  });
});
