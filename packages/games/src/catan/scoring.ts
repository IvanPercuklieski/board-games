import type { CatanState } from './state';

export const POINTS_TO_WIN = 10;
const MIN_GUARDS = 3;

/** Points everyone can see: settlements 1, cities 2, each award 2. */
export function publicPoints(G: CatanState, playerID: string): number {
  const buildings = G.buildings.reduce(
    (sum, b) => sum + (b?.owner === playerID ? (b.kind === 'city' ? 2 : 1) : 0),
    0,
  );
  const awards = Object.values(G.awards).filter((holder) => holder === playerID).length;
  return buildings + 2 * awards;
}

/** All points, including the player's hidden Landmark cards. */
export function victoryPoints(G: CatanState, playerID: string): number {
  const hand = G.hands[playerID]!;
  const landmarks = [...hand.cards, ...hand.newCards].filter((c) => c === 'landmark').length;
  return publicPoints(G, playerID) + landmarks;
}

/** Strongest Guard: at least three Guards, and more than the current holder. */
export function updateStrongestGuard(G: CatanState, playerID: string) {
  const guards = G.players[playerID]!.guards;
  const holder = G.awards.strongestGuard;
  if (guards < MIN_GUARDS || holder === playerID) return;
  if (holder === null || guards > G.players[holder]!.guards) G.awards.strongestGuard = playerID;
}
