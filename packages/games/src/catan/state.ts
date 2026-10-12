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
  /**
   * Other terms suggested by playerID, from that player's side: what they would give the
   * current player and what they want in return. A player has an answer or a counter, not both.
   */
  counters: Record<string, { give: ResourceCounts; want: ResourceCounts }>;
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

export type BuildPiece = 'road' | 'settlement' | 'city';

/** Something that happened, as shown in the game log (without its id). */
export type GameEventData =
  | { kind: 'roll'; player: string; dice: [number, number] }
  /** Cards from the bank: a roll, or the second setup settlement. */
  | { kind: 'gain'; gains: Record<string, Partial<ResourceCounts>> }
  | { kind: 'discard'; player: string; cards: Partial<ResourceCounts> }
  | { kind: 'bandit'; player: string; hex: number }
  /** `resource` is visible to the thief and the victim only (null for everyone else). */
  | { kind: 'steal'; thief: string; victim: string; resource: Resource | null }
  /** `free`: setup placements and Road Crew roads. */
  | { kind: 'build'; player: string; piece: BuildPiece; free: boolean }
  /** `card` is visible to the buyer only (null for everyone else). */
  | { kind: 'buyCard'; player: string; card: DevCard | null }
  | { kind: 'playCard'; player: string; card: 'guard' | 'roadCrew' }
  | { kind: 'windfall'; player: string; resources: [Resource, Resource] }
  | { kind: 'market'; player: string; resource: Resource; total: number }
  | { kind: 'bankTrade'; player: string; give: Resource; count: number; get: Resource }
  | {
      kind: 'trade';
      from: string;
      to: string;
      give: Partial<ResourceCounts>;
      want: Partial<ResourceCounts>;
    }
  /** An award changed hands (`player` null: nobody holds it now). */
  | { kind: 'award'; award: 'longestTrail' | 'strongestGuard'; player: string | null };

export type GameEvent = GameEventData & { id: number };

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
  /** The most recent events, oldest first (bounded, see `MAX_EVENTS`). */
  events: GameEvent[];
  /** Hidden from every player by `playerView`. */
  secret: { devDeck: DevCard[] };
  /** Only in a player's view: what hidden information looks like from outside. */
  counts?: {
    handSizes: Record<string, { resources: number; cards: number }>;
    deckSize: number;
  };
}
