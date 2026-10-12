export { gameCatalog, getCatalogEntry, type Complexity, type GameCatalogEntry } from './catalog';
export { gameRegistry, getGameDefinition, type GameDefinition } from './registry';
export { findWinningLine, TicTacToe, type TicTacToeState } from './tictactoe/tictactoe';

// Catan: the rules plus the helpers the board UI needs to show legal spots and scores.
export { Catan, makeCatan, type CatanOptions } from './catan/catan';
export {
  RESOURCES,
  TERRAIN_RESOURCE,
  type DevCard,
  type HarbourKind,
  type Resource,
  type Terrain,
} from './catan/config';
export {
  getGeometry,
  type BoardGeometry,
  type BoardSize,
  type EdgeGeo,
  type HexGeo,
  type VertexGeo,
} from './catan/geometry';
export { citySpots, roadSpots, settlementSpots } from './catan/placement';
export { COSTS, hasAll, total as totalResources } from './catan/resources';
export { POINTS_TO_WIN, publicPoints, victoryPoints } from './catan/scoring';
export type {
  Building,
  CatanState,
  Hand,
  ResourceCounts,
  Stage as CatanStage,
  TradeOffer,
} from './catan/state';
export { bankRatios } from './catan/trade';
export { trailLength } from './catan/longest-trail';
export { banditVictims } from './catan/turn-moves';
