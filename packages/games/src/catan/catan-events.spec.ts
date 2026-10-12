import { describe, expect, it } from 'vitest';
import { getGeometry } from './geometry';
import { logEvent, MAX_EVENTS } from './events';
import { noResources } from './resources';
import type { CatanState, GameEvent } from './state';
import { openTable, playSetup, scriptedDice } from './testing';

const geo = getGeometry('standard');
const MIDDLE = 9;
const [A, B] = geo.hexes[MIDDLE]!.vertices.filter((_, i) => i % 2 === 0);
const START = geo.edges[geo.coast[2]!]!;

const kinds = (events: GameEvent[]) => events.map((e) => e.kind);
const last = (G: CatanState) => G.events.at(-1)!;

/** Middle hex is the only 5 (ore); player 0 has a settlement and road on the coast. */
function table(dice: [number, number][], prepare: (G: CatanState) => void = () => {}) {
  return openTable({
    numPlayers: 3,
    skipSetup: true,
    dice: scriptedDice(...dice),
    prepare: (G) => {
      for (const tile of G.board.hexes) tile.token = null;
      G.board.hexes[MIDDLE] = { terrain: 'mountains', token: 5 };
      if (G.bandit === MIDDLE) G.bandit = 0;
      G.buildings[START.vertices[0]] = { owner: '0', kind: 'settlement' };
      G.roads[START.id] = '0';
      prepare(G);
    },
  });
}

describe('Catan event log', () => {
  it('starts empty and logs setup placements and the second settlement’s cards', () => {
    const t = openTable({ numPlayers: 3 });
    expect(t.G.events).toEqual([]);
    playSetup(t);
    const builds = t.G.events.filter((e) => e.kind === 'build');
    expect(builds).toHaveLength(12);
    expect(builds[0]).toMatchObject({ piece: 'settlement', free: true });
    expect(t.G.events.filter((e) => e.kind === 'gain').length).toBeGreaterThan(0);
    const ids = t.G.events.map((e) => e.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });

  it('logs the roll and what each player got', () => {
    const t = table([[2, 3]], (G) => {
      G.buildings[A!] = { owner: '1', kind: 'city' };
    });
    t.moves['rollDice']!();
    expect(kinds(t.G.events)).toEqual(['roll', 'gain']);
    expect(t.G.events[0]).toMatchObject({ player: '0', dice: [2, 3] });
    expect(last(t.G)).toMatchObject({ kind: 'gain', gains: { '1': { ore: 2 } } });
  });

  it('logs no gains when nobody gets anything', () => {
    const t = table([[1, 1]]);
    t.moves['rollDice']!();
    expect(kinds(t.G.events)).toEqual(['roll']);
  });

  it('logs discards, the bandit and the steal', () => {
    const t = table([[3, 4]], (G) => {
      G.hands['1']!.resources = { ...noResources(), wool: 8 };
      G.buildings[B!] = { owner: '1', kind: 'settlement' };
    });
    t.moves['rollDice']!();
    t.as('1')['discard']!({ wool: 4 });
    t.moves['moveBandit']!(MIDDLE, '1');
    expect(kinds(t.G.events)).toEqual(['roll', 'discard', 'bandit', 'steal']);
    expect(t.G.events[1]).toMatchObject({ player: '1', cards: { wool: 4 } });
    expect(t.G.events[2]).toMatchObject({ player: '0', hex: MIDDLE });
    expect(last(t.G)).toMatchObject({ thief: '0', victim: '1', resource: 'wool' });
  });

  it('logs builds, bought cards, played cards and trades', () => {
    const t = table([[1, 1]], (G) => {
      G.hands['0']!.resources = { timber: 9, clay: 9, wool: 9, grain: 9, ore: 9 };
      G.hands['0']!.cards = ['windfall'];
      G.hands['1']!.resources = { ...noResources(), ore: 1 };
      G.secret.devDeck = ['guard'];
    });
    t.moves['rollDice']!();
    t.moves['buildRoad']!(geo.coast[3]);
    t.moves['buyCard']!();
    t.moves['playWindfall']!('clay', 'ore');
    t.moves['bankTrade']!('wool', 'grain');
    t.moves['offerTrade']!({ timber: 1 }, { ore: 1 });
    t.as('1')['respondTrade']!(true);
    t.moves['confirmTrade']!('1');
    expect(t.G.events.slice(1)).toMatchObject([
      { kind: 'build', player: '0', piece: 'road', free: false },
      { kind: 'buyCard', player: '0', card: 'guard' },
      { kind: 'windfall', player: '0', resources: ['clay', 'ore'] },
      { kind: 'bankTrade', player: '0', give: 'wool', count: 4, get: 'grain' },
      { kind: 'trade', from: '0', to: '1', give: { timber: 1 }, want: { ore: 1 } },
    ]);
  });

  it('logs Corner the Market with how many cards it collected', () => {
    const t = table([[1, 1]], (G) => {
      G.hands['0']!.cards = ['market'];
      G.hands['1']!.resources = { ...noResources(), grain: 2 };
      G.hands['2']!.resources = { ...noResources(), grain: 1 };
    });
    t.moves['rollDice']!();
    t.moves['playMarket']!('grain');
    expect(last(t.G)).toMatchObject({ kind: 'market', player: '0', resource: 'grain', total: 3 });
  });

  it('logs a Guard and award changes', () => {
    const t = table([], (G) => {
      G.hands['0']!.cards = ['guard'];
      G.players['0']!.guards = 2;
    });
    t.moves['playGuard']!();
    expect(kinds(t.G.events)).toEqual(['playCard', 'award']);
    expect(last(t.G)).toMatchObject({ award: 'strongestGuard', player: '0' });
  });

  it('keeps only the most recent events', () => {
    const G = { events: [] } as unknown as CatanState;
    for (let i = 0; i < MAX_EVENTS + 5; i++)
      logEvent(G, { kind: 'roll', player: '0', dice: [1, 1] });
    expect(G.events).toHaveLength(MAX_EVENTS);
    expect(G.events[0]!.id).toBe(5);
    expect(G.events.at(-1)!.id).toBe(MAX_EVENTS + 4);
  });
});

describe('Catan event log in a player’s view', () => {
  function afterSteal() {
    const t = table([[3, 4]], (G) => {
      G.hands['1']!.resources = { ...noResources(), ore: 1 };
      G.hands['0']!.resources = { timber: 0, clay: 0, wool: 1, grain: 1, ore: 1 };
      G.buildings[B!] = { owner: '1', kind: 'settlement' };
      G.secret.devDeck = ['landmark'];
    });
    t.moves['rollDice']!();
    t.moves['moveBandit']!(MIDDLE, '1');
    t.moves['buyCard']!();
    return t;
  }

  it('shows the stolen resource only to the thief and the victim', () => {
    const t = afterSteal();
    const steal = (id: string | null) => t.view(id).events.find((e) => e.kind === 'steal');
    expect(steal('0')).toMatchObject({ resource: 'ore' });
    expect(steal('1')).toMatchObject({ resource: 'ore' });
    expect(steal('2')).toMatchObject({ thief: '0', victim: '1', resource: null });
    expect(steal(null)).toMatchObject({ resource: null });
  });

  it('shows a bought card only to the buyer', () => {
    const t = afterSteal();
    const buy = (id: string) => t.view(id).events.find((e) => e.kind === 'buyCard');
    expect(buy('0')).toMatchObject({ player: '0', card: 'landmark' });
    expect(buy('1')).toMatchObject({ player: '0', card: null });
    expect(JSON.stringify(t.view('2'))).not.toContain('landmark');
  });
});
