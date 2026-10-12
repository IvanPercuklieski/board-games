import type { BoardSize } from './geometry';

export const RESOURCES = ['timber', 'clay', 'wool', 'grain', 'ore'] as const;
export type Resource = (typeof RESOURCES)[number];

export const TERRAINS = ['forest', 'hills', 'pasture', 'fields', 'mountains', 'desert'] as const;
export type Terrain = (typeof TERRAINS)[number];

/** What each terrain produces; the desert produces nothing. */
export const TERRAIN_RESOURCE: Record<Terrain, Resource | null> = {
  forest: 'timber',
  hills: 'clay',
  pasture: 'wool',
  fields: 'grain',
  mountains: 'ore',
  desert: null,
};

/** A harbour trades one resource at 2:1, or any resource at 3:1. */
export type HarbourKind = Resource | 'any';

export type DevCard = 'guard' | 'roadCrew' | 'windfall' | 'market' | 'landmark';

export interface BoardConfig {
  terrains: Record<Terrain, number>;
  /** Number tokens, one per producing hex. */
  tokens: readonly number[];
  /** One kind per harbour slot of the board geometry. */
  harbours: readonly HarbourKind[];
  /** Cards of each resource in the bank. */
  bankPerResource: number;
  devCards: Record<DevCard, number>;
}

export const BOARD_CONFIG: Record<BoardSize, BoardConfig> = {
  standard: {
    terrains: { forest: 4, hills: 3, pasture: 4, fields: 4, mountains: 3, desert: 1 },
    tokens: [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12],
    harbours: ['any', 'any', 'any', 'any', 'timber', 'clay', 'wool', 'grain', 'ore'],
    bankPerResource: 19,
    devCards: { guard: 14, roadCrew: 2, windfall: 2, market: 2, landmark: 5 },
  },
  large: {
    terrains: { forest: 6, hills: 5, pasture: 6, fields: 6, mountains: 5, desert: 2 },
    tokens: [
      2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12,
    ],
    harbours: ['any', 'any', 'any', 'any', 'any', 'timber', 'clay', 'wool', 'wool', 'grain', 'ore'],
    bankPerResource: 24,
    devCards: { guard: 20, roadCrew: 3, windfall: 3, market: 3, landmark: 5 },
  },
};

/** 3-4 players use the standard island, 5-6 the large one. */
export function boardSizeFor(numPlayers: number): BoardSize {
  return numPlayers >= 5 ? 'large' : 'standard';
}
