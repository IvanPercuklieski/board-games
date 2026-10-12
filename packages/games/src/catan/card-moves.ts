import type { Ctx, LongFormMove, MoveFn } from 'boardgame.io';
import { INVALID_MOVE } from 'boardgame.io/core';
import type { DevCard } from './config';
import { logEvent } from './events';
import { updateLongestTrail } from './longest-trail';
import { canPlaceRoad, roadSpots } from './placement';
import { COSTS, hasAll, isResource, transfer } from './resources';
import { updateStrongestGuard } from './scoring';
import type { CatanState } from './state';
import { goTo } from './turn-moves';

/** Buys the top card of the deck; it can be played from the buyer's next turn. */
export const buyCard: LongFormMove<CatanState> = {
  client: false, // the deck is hidden from browsers
  move: ({ G, playerID }) => {
    const hand = G.hands[playerID]!;
    if (G.secret.devDeck.length === 0 || !hasAll(hand.resources, COSTS.card)) return INVALID_MOVE;
    transfer(hand.resources, G.bank, COSTS.card);
    const card = G.secret.devDeck.pop()!;
    hand.newCards.push(card);
    logEvent(G, { kind: 'buyCard', player: playerID, card });
    return undefined;
  },
};

/** One card per turn, and only cards bought before this turn. */
function canPlay(G: CatanState, playerID: string, card: DevCard): boolean {
  return !G.turn.cardPlayed && G.hands[playerID]!.cards.includes(card);
}

function discardPlayed(G: CatanState, playerID: string, card: DevCard) {
  const cards = G.hands[playerID]!.cards;
  cards.splice(cards.indexOf(card), 1);
  G.turn.cardPlayed = true;
}

/** Cards can be played before rolling or after; this is where the player continues. */
function currentStage(ctx: Ctx, playerID: string): 'roll' | 'actions' {
  return ctx.activePlayers?.[playerID] === 'roll' ? 'roll' : 'actions';
}

export const playGuard: MoveFn<CatanState> = ({ G, ctx, events, playerID }) => {
  if (!canPlay(G, playerID, 'guard')) return INVALID_MOVE;
  discardPlayed(G, playerID, 'guard');
  logEvent(G, { kind: 'playCard', player: playerID, card: 'guard' });
  G.players[playerID]!.guards++;
  updateStrongestGuard(G, playerID);
  G.turn.resume = currentStage(ctx, playerID);
  goTo(events, playerID, 'bandit');
  return undefined;
};

export const playRoadCrew: MoveFn<CatanState> = ({ G, ctx, events, playerID }) => {
  const supply = G.players[playerID]!.roads;
  if (!canPlay(G, playerID, 'roadCrew') || supply === 0) return INVALID_MOVE;
  if (roadSpots(G, playerID).length === 0) return INVALID_MOVE;
  discardPlayed(G, playerID, 'roadCrew');
  logEvent(G, { kind: 'playCard', player: playerID, card: 'roadCrew' });
  G.turn.freeRoads = Math.min(2, supply);
  G.turn.resume = currentStage(ctx, playerID);
  goTo(events, playerID, 'roadCrew');
  return undefined;
};

export const placeFreeRoad: MoveFn<CatanState> = ({ G, events, playerID }, edge: unknown) => {
  if (typeof edge !== 'number' || !canPlaceRoad(G, playerID, edge)) return INVALID_MOVE;
  G.roads[edge] = playerID;
  G.players[playerID]!.roads--;
  G.turn.freeRoads--;
  logEvent(G, { kind: 'build', player: playerID, piece: 'road', free: true });
  updateLongestTrail(G);
  if (G.turn.freeRoads === 0 || roadSpots(G, playerID).length === 0) {
    G.turn.freeRoads = 0;
    goTo(events, playerID, G.turn.resume);
  }
  return undefined;
};

export const playWindfall: MoveFn<CatanState> = ({ G, playerID }, a: unknown, b: unknown) => {
  if (!isResource(a) || !isResource(b) || !canPlay(G, playerID, 'windfall')) return INVALID_MOVE;
  const wanted = a === b ? { [a]: 2 } : { [a]: 1, [b]: 1 };
  if (!hasAll(G.bank, wanted)) return INVALID_MOVE;
  discardPlayed(G, playerID, 'windfall');
  transfer(G.bank, G.hands[playerID]!.resources, wanted);
  logEvent(G, { kind: 'windfall', player: playerID, resources: [a, b] });
  return undefined;
};

export const playMarket: LongFormMove<CatanState> = {
  client: false, // reads the other players' hands
  move: ({ G, playerID }, resource: unknown) => {
    if (!isResource(resource) || !canPlay(G, playerID, 'market')) return INVALID_MOVE;
    discardPlayed(G, playerID, 'market');
    const mine = G.hands[playerID]!.resources;
    const before = mine[resource];
    for (const [id, hand] of Object.entries(G.hands)) {
      if (id !== playerID) transfer(hand.resources, mine, { [resource]: hand.resources[resource] });
    }
    logEvent(G, { kind: 'market', player: playerID, resource, total: mine[resource] - before });
    return undefined;
  },
};
