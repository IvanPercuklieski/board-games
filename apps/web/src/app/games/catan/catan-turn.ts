import type { CatanStage, CatanState } from '@board-table/games';
import type { Ctx } from 'boardgame.io';

/** What this player can do right now (or who the table is waiting for). */
export type Situation =
  | { kind: 'setupSettlement'; second: boolean }
  | { kind: 'setupRoad' }
  | { kind: 'roll' }
  | { kind: 'discard'; count: number }
  | { kind: 'bandit' }
  | { kind: 'actions' }
  | { kind: 'roadCrew'; left: number }
  | { kind: 'trading' }
  | { kind: 'tradeResponse' }
  | { kind: 'specialBuild' }
  | { kind: 'waiting'; text: string }
  | { kind: 'over' };

/**
 * Reads the player's situation from the game state. `active` is the session's "may act now"
 * (connected and in `ctx.activePlayers`); `nameOf` gives a player's display name.
 */
export function situation(
  G: CatanState,
  ctx: Ctx,
  me: string,
  active: boolean,
  nameOf: (playerID: string) => string,
): Situation {
  if (ctx.gameover !== undefined) return { kind: 'over' };

  if (ctx.phase === 'setup') {
    if (active) {
      if (G.setupSettlement !== null) return { kind: 'setupRoad' };
      const owned = G.buildings.filter((b) => b?.owner === me).length;
      return { kind: 'setupSettlement', second: owned === 1 };
    }
    const what = G.setupSettlement === null ? 'a settlement' : 'a road';
    return { kind: 'waiting', text: `${nameOf(ctx.currentPlayer)} is placing ${what}` };
  }

  const stage = active ? (ctx.activePlayers?.[me] as CatanStage | undefined) : undefined;
  switch (stage) {
    case 'roll':
    case 'bandit':
    case 'actions':
    case 'trading':
    case 'tradeResponse':
    case 'specialBuild':
      return { kind: stage };
    case 'discard':
      return { kind: 'discard', count: G.turn.discards[me] ?? 0 };
    case 'roadCrew':
      return { kind: 'roadCrew', left: G.turn.freeRoads };
    default:
      return { kind: 'waiting', text: waitingFor(G, ctx, nameOf) };
  }
}

function waitingFor(G: CatanState, ctx: Ctx, nameOf: (playerID: string) => string): string {
  const current = nameOf(ctx.currentPlayer);
  const discarding = Object.keys(G.turn.discards).map(nameOf);
  if (discarding.length > 0) return `Waiting for ${joinNames(discarding)} to give back cards`;
  const stages = Object.entries(ctx.activePlayers ?? {});
  const builder = stages.find(([, s]) => s === 'specialBuild')?.[0];
  if (builder !== undefined) return `${nameOf(builder)} is building between turns`;
  switch (ctx.activePlayers?.[ctx.currentPlayer]) {
    case 'roll':
      return `Waiting for ${current} to roll`;
    case 'bandit':
      return `${current} is moving the Bandit`;
    case 'roadCrew':
      return `${current} is placing free roads`;
    case 'trading':
      return `${current} is waiting for answers to a trade`;
    default:
      return `${current} is building and trading`;
  }
}

export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}
