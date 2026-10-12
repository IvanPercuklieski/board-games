import { describe, expect, it } from 'vitest';
import type { Terrain } from './config';
import { getGeometry } from './geometry';
import { noResources, total } from './resources';
import type { CatanState } from './state';
import { openTable, scriptedDice } from './testing';
import { banditVictims } from './turn-moves';

const geo = getGeometry('standard');
const MIDDLE = 9; // the middle hex of the standard island
const [A, B, C] = geo.hexes[MIDDLE]!.vertices.filter((_, i) => i % 2 === 0); // three apart corners

/** Makes `hex` the only hex with `token`, of the given terrain, and not the bandit's. */
function setHex(G: CatanState, hex: number, terrain: Terrain, token: number) {
  for (const tile of G.board.hexes) if (tile.token === token) tile.token = 4;
  G.board.hexes[hex] = { terrain, token };
  if (G.bandit === hex) G.bandit = G.board.hexes.findIndex((_, i) => i !== hex);
}

function table(dice: [number, number][], prepare: (G: CatanState) => void = () => {}) {
  return openTable({ numPlayers: 3, skipSetup: true, dice: scriptedDice(...dice), prepare });
}

describe('Catan rolling', () => {
  it('rolls once, records the dice and moves on to building and trading', () => {
    const t = table([[2, 3]]);
    t.moves['rollDice']!();
    expect(t.G.lastRoll).toEqual([2, 3]);
    expect(t.G.turn.rolled).toBe(true);
    expect(t.stageOf('0')).toBe('actions');
    t.moves['rollDice']!();
    expect(t.G.lastRoll).toEqual([2, 3]);
  });

  it('lets only the current player roll', () => {
    const t = table([[2, 3]]);
    t.as('1')['rollDice']!();
    expect(t.G.turn.rolled).toBe(false);
  });

  it('pays one card per settlement and two per city on hexes with the rolled number', () => {
    const t = table([[2, 3]], (G) => {
      setHex(G, MIDDLE, 'mountains', 5);
      G.buildings[A!] = { owner: '0', kind: 'settlement' };
      G.buildings[B!] = { owner: '1', kind: 'city' };
    });
    t.moves['rollDice']!();
    expect(t.G.hands['0']!.resources.ore).toBe(1);
    expect(t.G.hands['1']!.resources.ore).toBe(2);
    expect(t.G.hands['2']!.resources.ore).toBe(0);
    expect(t.G.bank.ore).toBe(16);
  });

  it('pays nothing from the hex the bandit is on', () => {
    const t = table([[2, 3]], (G) => {
      setHex(G, MIDDLE, 'mountains', 5);
      G.bandit = MIDDLE;
      G.buildings[A!] = { owner: '0', kind: 'settlement' };
    });
    t.moves['rollDice']!();
    expect(t.G.hands['0']!.resources.ore).toBe(0);
  });

  it('pays nobody a resource the bank cannot cover for everyone', () => {
    const t = table([[2, 3]], (G) => {
      setHex(G, MIDDLE, 'mountains', 5);
      G.bank.ore = 2;
      G.buildings[A!] = { owner: '0', kind: 'settlement' };
      G.buildings[B!] = { owner: '1', kind: 'city' };
    });
    t.moves['rollDice']!();
    expect(t.G.hands['0']!.resources.ore).toBe(0);
    expect(t.G.hands['1']!.resources.ore).toBe(0);
    expect(t.G.bank.ore).toBe(2);
  });

  it('gives a single player whatever is left when only they are owed', () => {
    const t = table([[2, 3]], (G) => {
      setHex(G, MIDDLE, 'mountains', 5);
      G.bank.ore = 1;
      G.buildings[B!] = { owner: '1', kind: 'city' };
    });
    t.moves['rollDice']!();
    expect(t.G.hands['1']!.resources.ore).toBe(1);
    expect(t.G.bank.ore).toBe(0);
  });

  it('ends the turn after rolling and passes to the next player, who must roll', () => {
    const t = table([[2, 3]]);
    t.moves['endTurn']!();
    expect(t.ctx.currentPlayer).toBe('0');
    t.moves['rollDice']!();
    t.moves['endTurn']!();
    expect(t.ctx.currentPlayer).toBe('1');
    expect(t.stageOf('1')).toBe('roll');
    expect(t.G.turn.rolled).toBe(false);
  });
});

describe('Catan seven and the bandit', () => {
  const rich = (G: CatanState) => {
    G.hands['1']!.resources = { ...noResources(), timber: 5, ore: 4 }; // 9 cards -> discard 4
    G.hands['2']!.resources = { ...noResources(), wool: 7 }; // 7 cards -> keeps them
    G.hands['0']!.resources = { ...noResources(), grain: 8 }; // 8 -> discard 4
  };

  it('asks everyone with more than seven cards to discard half, rounded down', () => {
    const t = table([[3, 4]], rich);
    t.moves['rollDice']!();
    expect(t.G.turn.discards).toEqual({ '0': 4, '1': 4 });
    expect(t.stageOf('0')).toBe('discard');
    expect(t.stageOf('1')).toBe('discard');
    expect(t.stageOf('2')).toBeUndefined();
  });

  it('rejects a discard of the wrong size or of cards not in hand', () => {
    const t = table([[3, 4]], rich);
    t.moves['rollDice']!();
    t.as('1')['discard']!({ timber: 3 });
    t.as('1')['discard']!({ timber: 5 });
    t.as('1')['discard']!({ wool: 4 });
    t.as('1')['discard']!('four');
    expect(total(t.G.hands['1']!.resources)).toBe(9);
    t.as('2')['discard']!({ wool: 3 });
    expect(total(t.G.hands['2']!.resources)).toBe(7);
  });

  it('moves on to the bandit once everyone has discarded', () => {
    const t = table([[3, 4]], rich);
    t.moves['rollDice']!();
    t.as('1')['discard']!({ timber: 2, ore: 2 });
    expect(t.G.hands['1']!.resources).toMatchObject({ timber: 3, ore: 2 });
    expect(t.G.bank).toMatchObject({ timber: 21, ore: 21 });
    expect(t.stageOf('1')).toBeUndefined();
    expect(t.stageOf('0')).toBe('discard');
    t.as('0')['discard']!({ grain: 4 });
    expect(t.stageOf('0')).toBe('bandit');
    expect(t.G.turn.discards).toEqual({});
  });

  it('goes straight to the bandit when nobody has to discard', () => {
    const t = table([[3, 4]]);
    t.moves['rollDice']!();
    expect(t.stageOf('0')).toBe('bandit');
  });

  it('moves the bandit and steals one random card from a chosen neighbour', () => {
    const t = table([[3, 4]], (G) => {
      G.buildings[A!] = { owner: '1', kind: 'settlement' };
      G.buildings[B!] = { owner: '2', kind: 'settlement' };
      G.hands['1']!.resources.clay = 2;
      G.hands['2']!.resources.ore = 1;
      G.bandit = 0;
    });
    t.moves['rollDice']!();
    t.moves['moveBandit']!(MIDDLE); // victim needed
    expect(t.G.bandit).toBe(0);
    t.moves['moveBandit']!(MIDDLE, '0'); // can't rob yourself
    t.moves['moveBandit']!(MIDDLE, '1');
    expect(t.G.bandit).toBe(MIDDLE);
    expect(t.G.hands['0']!.resources.clay).toBe(1);
    expect(t.G.hands['1']!.resources.clay).toBe(1);
    expect(t.stageOf('0')).toBe('actions');
  });

  it('needs no victim when no neighbour has cards', () => {
    const t = table([[3, 4]], (G) => {
      G.buildings[A!] = { owner: '1', kind: 'settlement' };
      G.buildings[C!] = { owner: '0', kind: 'settlement' };
      G.bandit = 0;
    });
    t.moves['rollDice']!();
    t.moves['moveBandit']!(MIDDLE, '1');
    expect(t.G.bandit).toBe(0);
    t.moves['moveBandit']!(MIDDLE);
    expect(t.G.bandit).toBe(MIDDLE);
    expect(t.stageOf('0')).toBe('actions');
  });

  it('finds victims from hand sizes, so a player view (hidden hands) can use it too', () => {
    const t = table([], (G) => {
      G.buildings[A!] = { owner: '1', kind: 'settlement' };
      G.buildings[B!] = { owner: '2', kind: 'settlement' };
      G.hands['1']!.resources.ore = 1;
    });
    expect(banditVictims(t.G, MIDDLE, '0')).toEqual(['1']);
    const view = t.view('0');
    expect(banditVictims(view, MIDDLE, '0')).toEqual([]); // other hands look empty
    expect(banditVictims(view, MIDDLE, '0', (id) => view.counts!.handSizes[id]!.resources)).toEqual(
      ['1'],
    );
  });

  it('must move the bandit to another hex on the board', () => {
    const t = table([[3, 4]], (G) => {
      G.bandit = 0;
    });
    t.moves['rollDice']!();
    for (const bad of [0, -1, 19, 2.5, 'x']) t.moves['moveBandit']!(bad);
    expect(t.G.bandit).toBe(0);
    expect(t.stageOf('0')).toBe('bandit');
  });
});
