import type { MoveFn } from 'boardgame.io';
import { INVALID_MOVE } from 'boardgame.io/core';
import { TERRAIN_RESOURCE } from './config';
import { logEvent, nonZero } from './events';
import { getGeometry } from './geometry';
import { canPlaceRoad, canPlaceSettlement } from './placement';
import { noResources } from './resources';
import type { CatanState } from './state';

/** Setup: a settlement on any open corner; the second one pays one card per neighbouring land. */
export const placeSettlement: MoveFn<CatanState> = ({ G, playerID }, vertex: unknown) => {
  if (G.setupSettlement !== null) return INVALID_MOVE;
  if (
    typeof vertex !== 'number' ||
    !canPlaceSettlement(G, playerID, vertex, { needsRoad: false })
  ) {
    return INVALID_MOVE;
  }
  G.buildings[vertex] = { owner: playerID, kind: 'settlement' };
  G.players[playerID]!.settlements--;
  G.setupSettlement = vertex;
  logEvent(G, { kind: 'build', player: playerID, piece: 'settlement', free: true });

  const owned = G.buildings.filter((b) => b?.owner === playerID).length;
  if (owned === 2) {
    const hand = G.hands[playerID]!.resources;
    const got = noResources();
    for (const hex of getGeometry(G.board.size).vertices[vertex]!.hexes) {
      const resource = TERRAIN_RESOURCE[G.board.hexes[hex]!.terrain];
      if (resource && G.bank[resource] > 0) {
        G.bank[resource]--;
        hand[resource]++;
        got[resource]++;
      }
    }
    const gains = nonZero(got);
    if (Object.keys(gains).length > 0) logEvent(G, { kind: 'gain', gains: { [playerID]: gains } });
  }
  return undefined;
};

/** Setup: a road touching the settlement just placed; ends the turn. */
export const placeRoad: MoveFn<CatanState> = ({ G, playerID, events }, edge: unknown) => {
  const touching = G.setupSettlement;
  if (touching === null) return INVALID_MOVE;
  if (typeof edge !== 'number' || !canPlaceRoad(G, playerID, edge, touching)) return INVALID_MOVE;
  G.roads[edge] = playerID;
  G.players[playerID]!.roads--;
  G.setupSettlement = null;
  logEvent(G, { kind: 'build', player: playerID, piece: 'road', free: true });
  events.endTurn();
  return undefined;
};
