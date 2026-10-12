import type { MoveFn } from 'boardgame.io';
import { INVALID_MOVE } from 'boardgame.io/core';
import { RESOURCES, type Resource } from './config';
import { getGeometry } from './geometry';
import { isResource, transfer } from './resources';
import type { CatanState } from './state';

/** How many of each resource the player gives the bank for one card: 4, 3 or 2 with harbours. */
export function bankRatios(G: CatanState, playerID: string): Record<Resource, number> {
  const geo = getGeometry(G.board.size);
  const ratios = Object.fromEntries(RESOURCES.map((r) => [r, 4])) as Record<Resource, number>;
  G.board.harbours.forEach((kind, slot) => {
    const corners = geo.edges[geo.harbourSlots[slot]!]!.vertices;
    if (!corners.some((v) => G.buildings[v]?.owner === playerID)) return;
    for (const r of RESOURCES) {
      if (kind === 'any' || kind === r) ratios[r] = Math.min(ratios[r], kind === 'any' ? 3 : 2);
    }
  });
  return ratios;
}

/** Trades `give` at the player's ratio for one `get` from the bank. */
export const bankTrade: MoveFn<CatanState> = ({ G, playerID }, give: unknown, get: unknown) => {
  if (!isResource(give) || !isResource(get) || give === get) return INVALID_MOVE;
  const hand = G.hands[playerID]!.resources;
  const ratio = bankRatios(G, playerID)[give];
  if (hand[give] < ratio || G.bank[get] < 1) return INVALID_MOVE;
  transfer(hand, G.bank, { [give]: ratio });
  transfer(G.bank, hand, { [get]: 1 });
  return undefined;
};
