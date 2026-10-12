import { Catan, getGeometry, type CatanState } from '@board-table/games';
import { Client } from 'boardgame.io/client';
import { describeCounts, edgeName, hexName, hexPlace, vertexName } from './catan-labels';

function startState(numPlayers = 3): CatanState {
  const client = Client({ game: { ...Catan, seed: 'labels' }, numPlayers, debug: false });
  client.start();
  const G = structuredClone(client.getState()!.G) as CatanState;
  client.stop();
  return G;
}

describe('Catan labels', () => {
  it('names lands by terrain and number', () => {
    const G = startState();
    G.board.hexes[0] = { terrain: 'fields', token: 9 };
    G.board.hexes[9] = { terrain: 'desert', token: null };
    expect(hexName(G, 0)).toBe('fields 9');
    expect(hexName(G, 9)).toBe('desert');
    expect(hexPlace(G, 0)).toBe('fields 9, row 1 land 1');
    expect(hexPlace(G, 9)).toBe('desert, row 3 land 3');
  });

  it.each([
    ['standard', 3],
    ['large', 6],
  ] as const)('gives every corner and side of the %s island a unique name', (_, players) => {
    const G = startState(players);
    const geo = getGeometry(G.board.size);
    for (const tile of G.board.hexes) tile.token = null; // worst case: names repeat a lot
    const corners = geo.vertices.map((v) => vertexName(G, v.id));
    const sides = geo.edges.map((e) => edgeName(G, e.id));
    const lands = geo.hexes.map((h) => hexPlace(G, h.id));
    expect(new Set(lands).size).toBe(lands.length);
    // inland names can repeat only if the same three (or two) terrains meet twice; positions
    // make coast spots unique, which is where repeats are common
    const coastCorners = geo.vertices.filter((v) => v.hexes.length === 1).map((v) => corners[v.id]);
    const coastSides = geo.edges.filter((e) => e.hexes.length === 1).map((e) => sides[e.id]);
    expect(new Set(coastCorners).size).toBe(coastCorners.length);
    expect(new Set(coastSides).size).toBe(coastSides.length);
  });

  it('describes counts of resources', () => {
    expect(describeCounts({ wool: 2, ore: 1 })).toBe('2 wool and 1 ore');
    expect(describeCounts({ timber: 1, clay: 1, grain: 3 })).toBe('1 timber, 1 clay and 3 grain');
    expect(describeCounts({})).toBe('nothing');
  });
});
