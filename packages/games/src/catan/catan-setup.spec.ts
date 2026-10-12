import { describe, expect, it } from 'vitest';
import { getGeometry } from './geometry';
import { roadSpots, settlementSpots } from './placement';
import { total } from './resources';
import { openTable, playSetup } from './testing';

describe('Catan start state', () => {
  it('uses the standard island, bank and deck for 3-4 players', () => {
    const { G } = openTable({ numPlayers: 4 });
    expect(G.board.size).toBe('standard');
    expect(G.board.hexes).toHaveLength(19);
    expect(G.bank).toEqual({ timber: 19, clay: 19, wool: 19, grain: 19, ore: 19 });
    expect(G.secret.devDeck).toHaveLength(25);
    expect(G.buildings).toHaveLength(54);
    expect(G.roads).toHaveLength(72);
  });

  it('uses the large island, bank and deck for 5-6 players', () => {
    const { G } = openTable({ numPlayers: 6 });
    expect(G.board.size).toBe('large');
    expect(G.board.hexes).toHaveLength(30);
    expect(G.bank.ore).toBe(24);
    expect(G.secret.devDeck).toHaveLength(34);
    expect(Object.keys(G.hands)).toEqual(['0', '1', '2', '3', '4', '5']);
  });

  it('gives every player an empty hand and a full supply of pieces', () => {
    const { G } = openTable({ numPlayers: 3 });
    for (const id of ['0', '1', '2']) {
      expect(G.hands[id]).toEqual({
        resources: { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 },
        cards: [],
        newCards: [],
      });
      expect(G.players[id]).toEqual({ roads: 15, settlements: 5, cities: 4, guards: 0 });
    }
    expect(G.bandit).toBe(G.board.hexes.findIndex((h) => h.terrain === 'desert'));
  });

  it('shuffles the deck with the seed', () => {
    const a = openTable({ numPlayers: 3, seed: 'a' }).G.secret.devDeck;
    const b = openTable({ numPlayers: 3, seed: 'b' }).G.secret.devDeck;
    expect(a).not.toEqual(b);
    expect([...a].sort()).toEqual([...b].sort());
  });
});

describe('Catan setup phase', () => {
  it('picks a random first player and keeps seat order around the table', () => {
    const firsts = new Set<string>();
    for (const seed of ['1', '2', '3', '4', '5', '6', '7', '8']) {
      const { ctx } = openTable({ numPlayers: 3, seed });
      const start = Number(ctx.playOrder[0]);
      expect(ctx.playOrder).toEqual([0, 1, 2].map((i) => String((start + i) % 3)));
      expect(ctx.currentPlayer).toBe(ctx.playOrder[0]);
      firsts.add(ctx.currentPlayer);
    }
    expect(firsts.size).toBeGreaterThan(1);
  });

  it('goes around the table and back again (snake order)', () => {
    const table = openTable({ numPlayers: 4 });
    const order = table.ctx.playOrder;
    const seen: string[] = [];
    while (table.ctx.phase === 'setup') {
      const player = table.ctx.currentPlayer;
      seen.push(player);
      const [vertex] = settlementSpots(table.G, player, false);
      table.moves['placeSettlement']!(vertex);
      table.moves['placeRoad']!(roadSpots(table.G, player, vertex!)[0]);
    }
    expect(seen).toEqual([...order, ...[...order].reverse()]);
  });

  it('needs a settlement before the road, and one of each per turn', () => {
    const table = openTable({ numPlayers: 3 });
    const player = table.ctx.currentPlayer;
    table.moves['placeRoad']!(0);
    expect(table.G.roads.every((r) => r === null)).toBe(true);

    table.moves['placeSettlement']!(0);
    table.moves['placeSettlement']!(10);
    expect(table.G.buildings[0]).toEqual({ owner: player, kind: 'settlement' });
    expect(table.G.buildings[10]).toBeNull();
    expect(table.ctx.currentPlayer).toBe(player);
  });

  it('ends the turn after the road', () => {
    const table = openTable({ numPlayers: 3 });
    const [first, second] = table.ctx.playOrder;
    table.moves['placeSettlement']!(0);
    table.moves['placeRoad']!(roadSpots(table.G, first!, 0)[0]);
    expect(table.ctx.currentPlayer).toBe(second);
    expect(table.G.setupSettlement).toBeNull();
    expect(table.G.players[first!]).toMatchObject({ settlements: 4, roads: 14 });
  });

  it('only accepts a road touching the new settlement', () => {
    const table = openTable({ numPlayers: 3 });
    const player = table.ctx.currentPlayer;
    table.moves['placeSettlement']!(0);
    const far = getGeometry('standard').edges.find((e) => !e.vertices.includes(0))!.id;
    table.moves['placeRoad']!(far);
    expect(table.G.roads[far]).toBeNull();
    expect(table.ctx.currentPlayer).toBe(player);
  });

  it('enforces the distance rule and rejects bad corners', () => {
    const table = openTable({ numPlayers: 3 });
    table.moves['placeSettlement']!(0);
    table.moves['placeRoad']!(roadSpots(table.G, table.ctx.currentPlayer, 0)[0]);
    const neighbour = getGeometry('standard').vertices[0]!.neighbours[0]!;
    for (const bad of [0, neighbour, -1, 54, 1.5, '3', null]) {
      table.moves['placeSettlement']!(bad);
      expect(table.G.setupSettlement).toBeNull();
    }
  });

  it('pays out the second settlement only, one card per neighbouring land', () => {
    const table = openTable({ numPlayers: 3 });
    const order = table.ctx.playOrder;
    playSetup(table);
    const geo = getGeometry('standard');
    let paid = 0;
    for (const player of order) {
      const owned = table.G.buildings.flatMap((b, v) => (b?.owner === player ? [v] : []));
      expect(owned).toHaveLength(2);
      // the second settlement is the one placed later; it is the higher-numbered corner here
      // because every player takes the first legal corner
      const second = Math.max(...owned);
      const expected = geo.vertices[second]!.hexes.filter(
        (h) => table.G.board.hexes[h]!.terrain !== 'desert',
      ).length;
      expect(total(table.G.hands[player]!.resources)).toBe(expected);
      paid += expected;
    }
    expect(total(table.G.bank)).toBe(5 * 19 - paid);
  });

  it('starts the main phase with the first player, before rolling', () => {
    const table = openTable({ numPlayers: 3 });
    const first = table.ctx.playOrder[0]!;
    playSetup(table);
    expect(table.ctx.phase).toBe('main');
    expect(table.ctx.currentPlayer).toBe(first);
    expect(table.stageOf(first)).toBe('roll');
  });
});

describe('Catan player view', () => {
  const prepare = (G: import('./state').CatanState) => {
    G.hands['0']!.resources.ore = 3;
    G.hands['1']!.resources.wool = 2;
    G.hands['1']!.cards.push('guard');
    G.hands['1']!.newCards.push('landmark');
  };

  it('shows a player their own hand and only counts of the others', () => {
    const view = openTable({ numPlayers: 3, prepare }).view('0');
    expect(view.hands['0']!.resources.ore).toBe(3);
    expect(view.hands['1']).toEqual({
      resources: { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 },
      cards: [],
      newCards: [],
    });
    expect(view.counts!.handSizes['1']).toEqual({ resources: 2, cards: 2 });
    expect(view.counts!.handSizes['0']).toEqual({ resources: 3, cards: 0 });
  });

  it('never shows the deck, only its size', () => {
    const view = openTable({ numPlayers: 3 }).view('1');
    expect(view.secret.devDeck).toEqual([]);
    expect(view.counts!.deckSize).toBe(25);
    expect(JSON.stringify(view)).not.toContain('landmark');
  });

  it('shows a spectator no hands at all', () => {
    const view = openTable({ numPlayers: 3, prepare }).view(null);
    expect(Object.values(view.hands).every((h) => total(h.resources) === 0)).toBe(true);
    expect(JSON.stringify(view)).not.toContain('guard"');
  });
});
