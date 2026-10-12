// Where a player may build. Shared by the rules and the board UI (to show legal spots).
import { getGeometry } from './geometry';
import type { CatanState } from './state';

export function isIndex(value: unknown, length: number): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < length;
}

/** Free corner with no building on any neighbouring corner (the distance rule). */
function isOpenCorner(G: CatanState, vertex: number): boolean {
  const geo = getGeometry(G.board.size);
  if (!isIndex(vertex, geo.vertices.length) || G.buildings[vertex]) return false;
  return geo.vertices[vertex]!.neighbours.every((n) => !G.buildings[n]);
}

/**
 * Setup: any open corner. Later: an open corner reached by one of the player's roads.
 */
export function canPlaceSettlement(
  G: CatanState,
  playerID: string,
  vertex: number,
  { needsRoad }: { needsRoad: boolean },
): boolean {
  if (!isOpenCorner(G, vertex)) return false;
  if (!needsRoad) return true;
  return getGeometry(G.board.size).vertices[vertex]!.edges.some((e) => G.roads[e] === playerID);
}

export function canPlaceCity(G: CatanState, playerID: string, vertex: number): boolean {
  if (!isIndex(vertex, G.buildings.length)) return false;
  const b = G.buildings[vertex];
  return b?.owner === playerID && b.kind === 'settlement';
}

/**
 * A free side that continues the player's network: one end has their building, or has
 * their road and no other player's building (a rival building cuts the road there).
 * In setup the road must touch the settlement just placed (`touching`).
 */
export function canPlaceRoad(
  G: CatanState,
  playerID: string,
  edge: number,
  touching: number | null = null,
): boolean {
  const geo = getGeometry(G.board.size);
  if (!isIndex(edge, geo.edges.length) || G.roads[edge] !== null) return false;
  const ends = geo.edges[edge]!.vertices;
  if (touching !== null) return ends.includes(touching);
  return ends.some((v) => {
    const building = G.buildings[v];
    if (building) return building.owner === playerID;
    return geo.vertices[v]!.edges.some((e) => e !== edge && G.roads[e] === playerID);
  });
}

export function settlementSpots(G: CatanState, playerID: string, needsRoad: boolean): number[] {
  return G.buildings.flatMap((_, v) =>
    canPlaceSettlement(G, playerID, v, { needsRoad }) ? [v] : [],
  );
}

export function citySpots(G: CatanState, playerID: string): number[] {
  return G.buildings.flatMap((_, v) => (canPlaceCity(G, playerID, v) ? [v] : []));
}

export function roadSpots(G: CatanState, playerID: string, touching: number | null = null) {
  return G.roads.flatMap((_, e) => (canPlaceRoad(G, playerID, e, touching) ? [e] : []));
}
