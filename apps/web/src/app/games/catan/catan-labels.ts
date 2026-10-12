// All Catan wording shown to players. Our own text: never copy third-party rules or card text.
import {
  getGeometry,
  type CatanState,
  type DevCard,
  type HarbourKind,
  type Resource,
  type Terrain,
} from '@board-table/games';

export const RESOURCE_NAME: Record<Resource, string> = {
  timber: 'Timber',
  clay: 'Clay',
  wool: 'Wool',
  grain: 'Grain',
  ore: 'Ore',
};

export const TERRAIN_NAME: Record<Terrain, string> = {
  forest: 'forest',
  hills: 'hills',
  pasture: 'pasture',
  fields: 'fields',
  mountains: 'mountains',
  desert: 'desert',
};

export const CARD: Record<DevCard, { name: string; text: string }> = {
  guard: { name: 'Guard', text: 'Move the Bandit and take a card from a neighbour.' },
  roadCrew: { name: 'Road Crew', text: 'Build two roads for free.' },
  windfall: { name: 'Windfall', text: 'Take any two resources from the bank.' },
  market: {
    name: 'Corner the Market',
    text: 'Name a resource. Everyone hands you all of theirs.',
  },
  landmark: { name: 'Landmark', text: 'One victory point, kept hidden until it counts.' },
};

export function harbourName(kind: HarbourKind): string {
  return kind === 'any' ? '3:1 harbour' : `2:1 ${RESOURCE_NAME[kind].toLowerCase()} harbour`;
}

/** "fields 9", "desert". */
export function hexName(G: CatanState, hex: number): string {
  const { terrain, token } = G.board.hexes[hex]!;
  return token === null ? TERRAIN_NAME[terrain] : `${TERRAIN_NAME[terrain]} ${token}`;
}

function list(items: string[]): string {
  return items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/** "corner of fields 9, hills 6 and forest 4", "coast corner of fields 9". */
export function vertexName(G: CatanState, vertex: number): string {
  const hexes = getGeometry(G.board.size).vertices[vertex]!.hexes.map((h) => hexName(G, h));
  return hexes.length === 3 ? `corner of ${list(hexes)}` : `coast corner of ${list(hexes)}`;
}

/** "side between fields 9 and hills 6", "coast side of fields 9". */
export function edgeName(G: CatanState, edge: number): string {
  const hexes = getGeometry(G.board.size).edges[edge]!.hexes.map((h) => hexName(G, h));
  return hexes.length === 2 ? `side between ${list(hexes)}` : `coast side of ${hexes[0]}`;
}

/** "2 wool and 1 ore", or "nothing". */
export function describeCounts(counts: Partial<Record<Resource, number>>): string {
  const parts = (Object.keys(RESOURCE_NAME) as Resource[])
    .filter((r) => (counts[r] ?? 0) > 0)
    .map((r) => `${counts[r]} ${RESOURCE_NAME[r].toLowerCase()}`);
  return parts.length ? list(parts) : 'nothing';
}
