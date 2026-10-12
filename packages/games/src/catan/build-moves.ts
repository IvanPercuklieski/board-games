// Building with resources (main turn and the 5-6 player special build).
// Every move acts for `playerID`, who may not be the current player during a special build.
import type { MoveFn } from 'boardgame.io';
import { INVALID_MOVE } from 'boardgame.io/core';
import { updateLongestTrail } from './longest-trail';
import { canPlaceCity, canPlaceRoad, canPlaceSettlement } from './placement';
import { COSTS, hasAll, transfer } from './resources';
import type { CatanState } from './state';

function canPay(G: CatanState, playerID: string, cost: keyof typeof COSTS) {
  return hasAll(G.hands[playerID]!.resources, COSTS[cost]);
}

function pay(G: CatanState, playerID: string, cost: keyof typeof COSTS) {
  transfer(G.hands[playerID]!.resources, G.bank, COSTS[cost]);
}

export const buildRoad: MoveFn<CatanState> = ({ G, playerID }, edge: unknown) => {
  if (typeof edge !== 'number' || !canPlaceRoad(G, playerID, edge)) return INVALID_MOVE;
  if (G.players[playerID]!.roads === 0 || !canPay(G, playerID, 'road')) return INVALID_MOVE;
  pay(G, playerID, 'road');
  G.roads[edge] = playerID;
  G.players[playerID]!.roads--;
  updateLongestTrail(G);
  return undefined;
};

export const buildSettlement: MoveFn<CatanState> = ({ G, playerID }, vertex: unknown) => {
  if (typeof vertex !== 'number' || !canPlaceSettlement(G, playerID, vertex, { needsRoad: true })) {
    return INVALID_MOVE;
  }
  if (G.players[playerID]!.settlements === 0 || !canPay(G, playerID, 'settlement')) {
    return INVALID_MOVE;
  }
  pay(G, playerID, 'settlement');
  G.buildings[vertex] = { owner: playerID, kind: 'settlement' };
  G.players[playerID]!.settlements--;
  updateLongestTrail(G); // a new settlement can cut a rival's trail
  return undefined;
};

export const buildCity: MoveFn<CatanState> = ({ G, playerID }, vertex: unknown) => {
  if (typeof vertex !== 'number' || !canPlaceCity(G, playerID, vertex)) return INVALID_MOVE;
  if (G.players[playerID]!.cities === 0 || !canPay(G, playerID, 'city')) return INVALID_MOVE;
  pay(G, playerID, 'city');
  G.buildings[vertex] = { owner: playerID, kind: 'city' };
  G.players[playerID]!.cities--;
  G.players[playerID]!.settlements++;
  return undefined;
};
