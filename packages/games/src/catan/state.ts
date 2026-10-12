import type { DevCard, HarbourKind, Resource, Terrain } from './config';
import type { BoardSize } from './geometry';

export type ResourceCounts = Record<Resource, number>;

export interface Hand {
  resources: ResourceCounts;
  /** Development cards that can be played (bought before this turn). */
  cards: DevCard[];
  /** Development cards bought this turn; playable from the owner's next turn. */
  newCards: DevCard[];
}

export interface PlayerBoard {
  /** Pieces still in the player's supply. */
  roads: number;
  settlements: number;
  cities: number;
  /** Guard cards played (public). */
  guards: number;
}

export interface Building {
  owner: string;
  kind: 'settlement' | 'city';
}

export interface Board {
  size: BoardSize;
  /** Indexed by hex id. */
  hexes: { terrain: Terrain; token: number | null }[];
  /** Indexed like the geometry's `harbourSlots`. */
  harbours: HarbourKind[];
}

/** Stages of the main phase (boardgame.io stages, one per active player). */
export type Stage =
  | 'roll'
  | 'discard'
  | 'bandit'
  | 'actions'
  | 'roadCrew'
  | 'trading'
  | 'tradeResponse'
  | 'specialBuild';

export interface TradeOffer {
  /** What the current player gives. */
  give: ResourceCounts;
  /** What the current player wants in return. */
  want: ResourceCounts;
  /** Answers by playerID: true = accepts, false = declines. */
  responses: Record<string, boolean>;
}

export interface TurnState {
  rolled: boolean;
  /** A development card was played this turn. */
  cardPlayed: boolean;
  /** Players who still have to discard after a 7, with how many cards. */
  discards: Record<string, number>;
  /** Stage the current player returns to after moving the bandit or placing free roads. */
  resume: 'roll' | 'actions';
  /** Free roads left from a Road Crew card. */
  freeRoads: number;
  trade: TradeOffer | null;
  /** 5-6 players: who still gets a special build after this turn, in order. */
  specialBuilders: string[];
}

export interface CatanState {
  board: Board;
  bandit: number;
  /** Indexed by vertex id. */
  buildings: (Building | null)[];
  /** Owner by edge id. */
  roads: (string | null)[];
  hands: Record<string, Hand>;
  players: Record<string, PlayerBoard>;
  bank: ResourceCounts;
  awards: { longestTrail: string | null; strongestGuard: string | null };
  /** Setup phase: the settlement placed this turn, waiting for its road. */
  setupSettlement: number | null;
  lastRoll: [number, number] | null;
  turn: TurnState;
  /** Hidden from every player by `playerView`. */
  secret: { devDeck: DevCard[] };
  /** Only in a player's view: what hidden information looks like from outside. */
  counts?: {
    handSizes: Record<string, { resources: number; cards: number }>;
    deckSize: number;
  };
}
