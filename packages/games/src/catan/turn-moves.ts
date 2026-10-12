import type { Ctx, LongFormMove, MoveFn } from 'boardgame.io';
import { INVALID_MOVE } from 'boardgame.io/core';
import { RESOURCES, TERRAIN_RESOURCE } from './config';
import { getGeometry } from './geometry';
import { isIndex } from './placement';
import { hasAll, noResources, parseCounts, total, transfer } from './resources';
import type { CatanState, ResourceCounts, Stage } from './state';

type Events = Parameters<MoveFn<CatanState>>[0]['events'];
type Random = Parameters<MoveFn<CatanState>>[0]['random'];

/** Two dice, each 1-6. */
export type DiceRoller = (random: Random) => [number, number];

export const rollTwoDice: DiceRoller = (random) => [random.D6(), random.D6()];

/** Puts exactly one player into a stage (everyone else waits). */
export function goTo(events: Events, playerID: string, stage: Stage) {
  events.setActivePlayers({ value: { [playerID]: stage } });
}

/** Cards each player gets for a roll, by owner. */
function production(G: CatanState, sum: number): Record<string, ResourceCounts> {
  const owed: Record<string, ResourceCounts> = {};
  for (const hex of getGeometry(G.board.size).hexes) {
    const tile = G.board.hexes[hex.id]!;
    const resource = TERRAIN_RESOURCE[tile.terrain];
    if (tile.token !== sum || hex.id === G.bandit || !resource) continue;
    for (const v of hex.vertices) {
      const building = G.buildings[v];
      if (!building) continue;
      (owed[building.owner] ??= noResources())[resource] += building.kind === 'city' ? 2 : 1;
    }
  }
  return owed;
}

/**
 * Pays out a roll. A resource the bank can't pay in full goes to nobody, unless only one
 * player is owed it (they get what is left).
 */
function produce(G: CatanState, sum: number) {
  const owed = production(G, sum);
  for (const r of RESOURCES) {
    const owners = Object.keys(owed).filter((id) => owed[id]![r] > 0);
    const needed = owners.reduce((n, id) => n + owed[id]![r], 0);
    if (needed > G.bank[r] && owners.length > 1) continue;
    for (const id of owners) {
      const n = Math.min(owed[id]![r], G.bank[r]);
      transfer(G.bank, G.hands[id]!.resources, { [r]: n });
    }
  }
}

/** Players with more than seven cards discard half (rounded down), then the bandit moves. */
function startSeven(G: CatanState, ctx: Ctx, events: Events) {
  G.turn.resume = 'actions';
  G.turn.discards = Object.fromEntries(
    Object.entries(G.hands)
      .map(([id, hand]) => [id, total(hand.resources)] as const)
      .filter(([, n]) => n > 7)
      .map(([id, n]) => [id, Math.floor(n / 2)]),
  );
  askForDiscards(G, ctx, events);
}

function askForDiscards(G: CatanState, ctx: Ctx, events: Events) {
  const waiting = Object.keys(G.turn.discards);
  if (waiting.length === 0) goTo(events, ctx.currentPlayer, 'bandit');
  else events.setActivePlayers({ value: Object.fromEntries(waiting.map((id) => [id, 'discard'])) });
}

export function makeRollDice(roll: DiceRoller): LongFormMove<CatanState> {
  return {
    client: false, // random
    move: ({ G, ctx, events, random, playerID }) => {
      const dice = roll(random);
      if (!dice.every((d) => Number.isInteger(d) && d >= 1 && d <= 6)) {
        throw new Error(`Bad dice: ${dice.join(',')}`);
      }
      G.turn.rolled = true;
      G.lastRoll = dice;
      const sum = dice[0] + dice[1];
      if (sum === 7) {
        startSeven(G, ctx, events);
      } else {
        produce(G, sum);
        goTo(events, playerID, 'actions');
      }
      return undefined;
    },
  };
}

export const discard: MoveFn<CatanState> = ({ G, ctx, events, playerID }, cards: unknown) => {
  const owed = G.turn.discards[playerID];
  const counts = parseCounts(cards);
  const hand = G.hands[playerID]!.resources;
  if (owed === undefined || !counts || total(counts) !== owed || !hasAll(hand, counts)) {
    return INVALID_MOVE;
  }
  transfer(hand, G.bank, counts);
  delete G.turn.discards[playerID];
  askForDiscards(G, ctx, events);
  return undefined;
};

/** Players other than `thief` with a building on `hex` and at least one card. */
export function banditVictims(G: CatanState, hex: number, thief: string): string[] {
  const owners = getGeometry(G.board.size)
    .hexes[hex]!.vertices.map((v) => G.buildings[v]?.owner)
    .filter((id): id is string => id !== undefined && id !== thief);
  return [...new Set(owners)].filter((id) => total(G.hands[id]!.resources) > 0).sort();
}

/** Moves the bandit to another hex and steals one random card from a chosen neighbour. */
export const moveBandit: LongFormMove<CatanState> = {
  client: false, // random, and reads the victim's hand
  move: ({ G, events, random, playerID }, hex: unknown, victim?: unknown) => {
    if (!isIndex(hex, G.board.hexes.length) || hex === G.bandit) return INVALID_MOVE;
    const victims = banditVictims(G, hex, playerID);
    if (victims.length > 0 ? !victims.includes(victim as string) : victim != null) {
      return INVALID_MOVE;
    }
    G.bandit = hex;
    if (typeof victim === 'string') {
      const theirs = G.hands[victim]!.resources;
      const pool = RESOURCES.flatMap((r) => Array<typeof r>(theirs[r]).fill(r));
      const stolen = pool[random.Die(pool.length) - 1]!;
      transfer(theirs, G.hands[playerID]!.resources, { [stolen]: 1 });
    }
    goTo(events, playerID, G.turn.resume);
    return undefined;
  },
};

/**
 * Ends the turn. On the large island (5-6 players) every other player first gets a special
 * build, one at a time in turn order.
 */
export const endTurn: MoveFn<CatanState> = ({ G, ctx, events, playerID }) => {
  if (G.board.size !== 'large') {
    events.endTurn();
    return undefined;
  }
  const at = ctx.playOrder.indexOf(playerID);
  G.turn.specialBuilders = Array.from(
    { length: ctx.numPlayers - 1 },
    (_, i) => ctx.playOrder[(at + 1 + i) % ctx.numPlayers]!,
  );
  goTo(events, G.turn.specialBuilders[0]!, 'specialBuild');
  return undefined;
};

/** Ends this player's special build; the next player builds, or the next turn starts. */
export const finishSpecialBuild: MoveFn<CatanState> = ({ G, events, playerID }) => {
  if (G.turn.specialBuilders[0] !== playerID) return INVALID_MOVE;
  G.turn.specialBuilders.shift();
  const next = G.turn.specialBuilders[0];
  if (next === undefined) events.endTurn();
  else goTo(events, next, 'specialBuild');
  return undefined;
};
