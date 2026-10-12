import type { LongFormMove, MoveFn } from 'boardgame.io';
import { INVALID_MOVE } from 'boardgame.io/core';
import { RESOURCES, type Resource } from './config';
import { logEvent, nonZero } from './events';
import { getGeometry } from './geometry';
import { hasAll, isResource, parseCounts, total, transfer } from './resources';
import type { CatanState, ResourceCounts } from './state';
import { goTo } from './turn-moves';

type Events = Parameters<MoveFn<CatanState>>[0]['events'];

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
  logEvent(G, { kind: 'bankTrade', player: playerID, give, count: ratio, get });
  return undefined;
};

/**
 * The current player offers `give` for `want` to everyone else. Both sides need at least one
 * card and no resource on both sides. Everyone else answers in stage `tradeResponse`.
 */
export const offerTrade: MoveFn<CatanState> = (
  { G, ctx, events, playerID },
  giveInput: unknown,
  wantInput: unknown,
) => {
  const terms = parseTerms(G, playerID, giveInput, wantInput);
  if (!terms) return INVALID_MOVE;
  G.turn.trade = { ...terms, responses: {}, counters: {} };
  events.setActivePlayers({
    value: Object.fromEntries(
      ctx.playOrder.map((id) => [id, id === playerID ? 'trading' : 'tradeResponse']),
    ),
  });
  return undefined;
};

/** Accept (only with the wanted cards in hand) or decline; answers can change until confirmed. */
export const respondTrade: MoveFn<CatanState> = ({ G, playerID }, accept: unknown) => {
  const trade = G.turn.trade;
  if (!trade || typeof accept !== 'boolean') return INVALID_MOVE;
  if (accept && !hasAll(G.hands[playerID]!.resources, trade.want)) return INVALID_MOVE;
  trade.responses[playerID] = accept;
  delete trade.counters[playerID];
  return undefined;
};

/** Suggests other terms instead of answering: what this player gives and wants in return. */
export const counterTrade: MoveFn<CatanState> = (
  { G, playerID },
  giveInput: unknown,
  wantInput: unknown,
) => {
  const trade = G.turn.trade;
  const terms = parseTerms(G, playerID, giveInput, wantInput);
  if (!trade || !terms) return INVALID_MOVE;
  trade.counters[playerID] = terms;
  delete trade.responses[playerID];
  return undefined;
};

/** Swaps the cards with a player who accepted. */
export const confirmTrade: LongFormMove<CatanState> = {
  client: false, // reads the partner's hand
  move: ({ G, events, playerID }, partner: unknown) => {
    const trade = G.turn.trade;
    if (!trade || typeof partner !== 'string' || trade.responses[partner] !== true) {
      return INVALID_MOVE;
    }
    return swap(G, events, playerID, partner, trade.give, trade.want);
  },
};

/** Trades with a player on the terms they suggested. */
export const acceptCounter: LongFormMove<CatanState> = {
  client: false, // reads the partner's hand
  move: ({ G, events, playerID }, partner: unknown) => {
    const counters = G.turn.trade?.counters;
    if (!counters || typeof partner !== 'string' || !Object.hasOwn(counters, partner)) {
      return INVALID_MOVE;
    }
    const counter = counters[partner]!;
    return swap(G, events, playerID, partner, counter.want, counter.give);
  },
};

/**
 * Current player gives `give` to `partner` for `want`, if both still hold the cards; ends
 * the offer and returns to building.
 */
function swap(
  G: CatanState,
  events: Events,
  playerID: string,
  partner: string,
  give: ResourceCounts,
  want: ResourceCounts,
) {
  const mine = G.hands[playerID]!.resources;
  const theirs = G.hands[partner]!.resources;
  if (!hasAll(mine, give) || !hasAll(theirs, want)) return INVALID_MOVE;
  transfer(mine, theirs, give);
  transfer(theirs, mine, want);
  logEvent(G, {
    kind: 'trade',
    from: playerID,
    to: partner,
    give: nonZero(give),
    want: nonZero(want),
  });
  G.turn.trade = null;
  goTo(events, playerID, 'actions');
  return undefined;
}

/** Untrusted trade terms: both sides non-empty, no resource on both, the giver holds `give`. */
function parseTerms(G: CatanState, playerID: string, giveInput: unknown, wantInput: unknown) {
  const give = parseCounts(giveInput);
  const want = parseCounts(wantInput);
  if (!give || !want || total(give) === 0 || total(want) === 0) return null;
  if (RESOURCES.some((r) => give[r] > 0 && want[r] > 0)) return null;
  if (!hasAll(G.hands[playerID]!.resources, give)) return null;
  return { give, want };
}

export const cancelTrade: MoveFn<CatanState> = ({ G, events, playerID }) => {
  G.turn.trade = null;
  goTo(events, playerID, 'actions');
  return undefined;
};
