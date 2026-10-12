import { describe, expect, it } from 'vitest';
import { getGeometry } from './geometry';
import { trailLength } from './longest-trail';
import { noResources } from './resources';
import type { CatanState } from './state';
import { openTable, scriptedDice, type Table } from './testing';

const geo = getGeometry('standard');

/** Corners and sides along the coast: `edges[i]` joins `vertices[i]` and `vertices[i + 1]`. */
function coastPath(from: number, length: number) {
  const edges = Array.from({ length }, (_, i) => geo.coast[(from + i) % geo.coast.length]!);
  const shared = (a: number, b: number) =>
    geo.edges[a]!.vertices.find((v) => geo.edges[b]!.vertices.includes(v))!;
  const inner = edges.slice(1).map((e, i) => shared(edges[i]!, e));
  const first = geo.edges[edges[0]!]!.vertices.find((v) => v !== inner[0])!;
  const last = geo.edges[edges[length - 1]!]!.vertices.find((v) => v !== inner[length - 2])!;
  return { edges, vertices: [first, ...inner, last] };
}

// starts at coast side 2, so the first corner is not on a harbour (slot 0 is coast side 0)
const PATH = coastPath(2, 12);

/** No hex produces, so rolls change nothing; player 0 starts with a settlement and a road. */
function table(prepare: (G: CatanState) => void = () => {}): Table {
  const t = openTable({
    numPlayers: 3,
    skipSetup: true,
    dice: scriptedDice([1, 1], [1, 1], [1, 1]),
    prepare: (G) => {
      for (const tile of G.board.hexes) tile.token = null;
      G.buildings[PATH.vertices[0]!] = { owner: '0', kind: 'settlement' };
      G.roads[PATH.edges[0]!] = '0';
      prepare(G);
    },
  });
  t.moves['rollDice']!();
  return t;
}

const rich = (G: CatanState) => {
  G.hands['0']!.resources = { timber: 10, clay: 10, wool: 10, grain: 10, ore: 10 };
};

describe('Catan roads', () => {
  it('builds a road that continues the network, paying timber and clay', () => {
    const t = table(rich);
    t.moves['buildRoad']!(PATH.edges[1]);
    expect(t.G.roads[PATH.edges[1]!]).toBe('0');
    expect(t.G.hands['0']!.resources).toMatchObject({ timber: 9, clay: 9 });
    expect(t.G.bank).toMatchObject({ timber: 20, clay: 20 });
    expect(t.G.players['0']!.roads).toBe(14);
  });

  it('rejects unconnected, taken or bad sides', () => {
    const t = table((G) => {
      rich(G);
      G.roads[PATH.edges[5]!] = '1';
    });
    for (const bad of [PATH.edges[3], PATH.edges[0], PATH.edges[5], -1, 72, 'x']) {
      t.moves['buildRoad']!(bad);
    }
    expect(t.G.players['0']!.roads).toBe(15);
    expect(t.G.hands['0']!.resources.timber).toBe(10);
  });

  it('cannot build through a rival settlement', () => {
    const t = table((G) => {
      rich(G);
      G.roads[PATH.edges[1]!] = '0';
      G.buildings[PATH.vertices[2]!] = { owner: '1', kind: 'settlement' };
    });
    t.moves['buildRoad']!(PATH.edges[2]);
    expect(t.G.roads[PATH.edges[2]!]).toBeNull();
  });

  it('needs the resources and a road piece left', () => {
    const t = table();
    t.moves['buildRoad']!(PATH.edges[1]);
    expect(t.G.roads[PATH.edges[1]!]).toBeNull();

    const empty = table((G) => {
      rich(G);
      G.players['0']!.roads = 0;
    });
    empty.moves['buildRoad']!(PATH.edges[1]);
    expect(empty.G.roads[PATH.edges[1]!]).toBeNull();
  });

  it('cannot build before rolling', () => {
    const t = openTable({ numPlayers: 3, skipSetup: true, prepare: rich });
    t.moves['buildRoad']!(0);
    expect(t.G.roads.every((r) => r === null)).toBe(true);
  });
});

describe('Catan settlements and cities', () => {
  it('builds a settlement at the end of a road, two sides from other buildings', () => {
    const t = table((G) => {
      rich(G);
      G.roads[PATH.edges[1]!] = '0';
    });
    t.moves['buildSettlement']!(PATH.vertices[1]); // next to the first settlement
    expect(t.G.buildings[PATH.vertices[1]!]).toBeNull();
    t.moves['buildSettlement']!(PATH.vertices[2]);
    expect(t.G.buildings[PATH.vertices[2]!]).toEqual({ owner: '0', kind: 'settlement' });
    expect(t.G.hands['0']!.resources).toEqual({
      timber: 9,
      clay: 9,
      wool: 9,
      grain: 9,
      ore: 10,
    });
    expect(t.G.players['0']!.settlements).toBe(4);
  });

  it('needs one of the player’s roads to reach the corner', () => {
    const t = table(rich);
    t.moves['buildSettlement']!(PATH.vertices[4]);
    expect(t.G.buildings[PATH.vertices[4]!]).toBeNull();
  });

  it('upgrades the player’s own settlement to a city', () => {
    const t = table((G) => {
      rich(G);
      G.buildings[PATH.vertices[6]!] = { owner: '1', kind: 'settlement' };
    });
    t.moves['buildCity']!(PATH.vertices[6]);
    expect(t.G.buildings[PATH.vertices[6]!]!.owner).toBe('1');
    t.moves['buildCity']!(PATH.vertices[0]);
    expect(t.G.buildings[PATH.vertices[0]!]).toEqual({ owner: '0', kind: 'city' });
    expect(t.G.hands['0']!.resources).toMatchObject({ grain: 8, ore: 7 });
    expect(t.G.players['0']).toMatchObject({ cities: 3, settlements: 6 });
    t.moves['buildCity']!(PATH.vertices[0]);
    expect(t.G.players['0']!.cities).toBe(3);
  });

  it('needs the resources for a city', () => {
    const t = table((G) => {
      G.hands['0']!.resources = { ...noResources(), grain: 2, ore: 2 };
    });
    t.moves['buildCity']!(PATH.vertices[0]);
    expect(t.G.buildings[PATH.vertices[0]!]!.kind).toBe('settlement');
  });
});

describe('Longest Trail', () => {
  const roads = (G: CatanState, owner: string, from: number, to: number) => {
    for (let i = from; i < to; i++) G.roads[PATH.edges[i]!] = owner;
  };

  it('measures the longest simple path, cut by rival buildings', () => {
    const G = structuredClone(table((G) => roads(G, '0', 0, 6)).G);
    expect(trailLength(G, '0')).toBe(6);
    G.buildings[PATH.vertices[3]!] = { owner: '1', kind: 'settlement' };
    expect(trailLength(G, '0')).toBe(3);
    G.buildings[PATH.vertices[3]!] = { owner: '0', kind: 'settlement' };
    expect(trailLength(G, '0')).toBe(6);
  });

  it('goes to the first player with a trail of five', () => {
    const t = table((G) => {
      rich(G);
      roads(G, '0', 0, 4);
    });
    expect(t.G.awards.longestTrail).toBeNull();
    t.moves['buildRoad']!(PATH.edges[4]);
    expect(t.G.awards.longestTrail).toBe('0');
  });

  /** Player 0 holds the award with a trail of five; player 1 has `rival` roads further on. */
  function contest(rival: number, prepare: (G: CatanState) => void = () => {}) {
    const t = table((G) => {
      roads(G, '0', 0, 5);
      roads(G, '1', 6, 6 + rival);
      G.awards.longestTrail = '0';
      G.hands['1']!.resources = { timber: 2, clay: 2, wool: 1, grain: 1, ore: 0 };
      prepare(G);
    });
    t.moves['endTurn']!();
    t.as('1')['rollDice']!();
    return t;
  }

  it('stays with the holder when a rival only ties', () => {
    const t = contest(4);
    t.as('1')['buildRoad']!(PATH.edges[10]);
    expect(trailLength(t.G, '1')).toBe(5);
    expect(t.G.awards.longestTrail).toBe('0');
  });

  it('moves to a rival with a longer trail', () => {
    const t = contest(5);
    t.as('1')['buildRoad']!(PATH.edges[11]);
    expect(t.G.awards.longestTrail).toBe('1');
  });

  it('is lost when a rival settlement cuts the trail below five', () => {
    // a corner in the middle of player 0's trail with a side leading inland
    const cut = [2, 3]
      .map((i) => PATH.vertices[i]!)
      .find((v) => geo.vertices[v]!.edges.length === 3)!;
    const inland = geo.vertices[cut]!.edges.find((e) => !PATH.edges.includes(e))!;
    const t = contest(0, (G) => {
      G.roads[inland] = '1';
    });
    t.as('1')['buildSettlement']!(cut);
    expect(t.G.buildings[cut]).toEqual({ owner: '1', kind: 'settlement' });
    expect(trailLength(t.G, '0')).toBeLessThan(5);
    expect(t.G.awards.longestTrail).toBeNull();
  });
});

describe('Catan bank trades', () => {
  it('trades four of a kind for one by default', () => {
    const t = table((G) => {
      G.hands['0']!.resources = { ...noResources(), wool: 4 };
    });
    t.moves['bankTrade']!('wool', 'ore');
    expect(t.G.hands['0']!.resources).toMatchObject({ wool: 0, ore: 1 });
    expect(t.G.bank).toMatchObject({ wool: 23, ore: 18 });
  });

  it('trades 3:1 at a general harbour and 2:1 at a matching one', () => {
    const [anySlot, woolSlot] = [0, 3];
    const t = table((G) => {
      G.board.harbours[anySlot] = 'any';
      G.board.harbours[woolSlot] = 'wool';
      G.buildings[geo.edges[geo.harbourSlots[anySlot]!]!.vertices[0]] = {
        owner: '0',
        kind: 'settlement',
      };
      G.buildings[geo.edges[geo.harbourSlots[woolSlot]!]!.vertices[1]] = {
        owner: '0',
        kind: 'city',
      };
      G.hands['0']!.resources = { ...noResources(), wool: 2, grain: 3 };
    });
    t.moves['bankTrade']!('grain', 'ore');
    t.moves['bankTrade']!('wool', 'clay');
    expect(t.G.hands['0']!.resources).toEqual({ ...noResources(), ore: 1, clay: 1 });
  });

  it('rejects trades the player or bank cannot cover, and nonsense', () => {
    const t = table((G) => {
      G.hands['0']!.resources = { ...noResources(), wool: 8 };
      G.bank.ore = 0;
    });
    t.moves['bankTrade']!('wool', 'ore');
    t.moves['bankTrade']!('wool', 'wool');
    t.moves['bankTrade']!('gold', 'clay');
    t.moves['bankTrade']!('grain', 'clay');
    expect(t.G.hands['0']!.resources).toEqual({ ...noResources(), wool: 8 });
  });
});
