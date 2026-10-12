// Test harness for the Catan rules (used by specs only; not exported from the package).
import type { Ctx, Game } from 'boardgame.io';
import { Client } from 'boardgame.io/client';
import { makeCatan, type CatanOptions } from './catan';
import { roadSpots, settlementSpots } from './placement';
import type { CatanState, Stage } from './state';

export interface TableOptions extends CatanOptions {
  numPlayers: number;
  seed?: string;
  /** Skip the setup phase and start the first main turn with player 0. */
  skipSetup?: boolean;
  /** Changes the start state (e.g. pre-built settlements, cards in hand). */
  prepare?: (G: CatanState) => void;
}

export interface Table {
  /** Full state as the server sees it (no player view applied). */
  readonly G: CatanState;
  readonly ctx: Ctx;
  /** Makes a move as the given player. */
  as(playerID: string): Record<string, (...args: unknown[]) => void>;
  /** Makes a move as the current player. */
  readonly moves: Record<string, (...args: unknown[]) => void>;
  /** The state as one player (or a spectator, null) receives it. */
  view(playerID: string | null): CatanState;
  stageOf(playerID: string): Stage | undefined;
}

export function openTable(options: TableOptions): Table {
  const { numPlayers, seed = 'catan-test', skipSetup = false, prepare, ...catanOptions } = options;
  const base = makeCatan(catanOptions);
  const game: Game<CatanState> = {
    ...base,
    seed,
    setup: (context) => {
      const G = base.setup!(context);
      prepare?.(G);
      return G;
    },
    phases: skipSetup
      ? {
          setup: { ...base.phases!['setup']!, start: false },
          main: { ...base.phases!['main']!, start: true },
        }
      : base.phases,
  };
  const client = Client({ game, numPlayers, debug: false });
  client.start();

  const raw = () => client.store.getState() as { G: CatanState; ctx: Ctx };
  const as = (playerID: string) =>
    new Proxy({} as Record<string, (...args: unknown[]) => void>, {
      get:
        (_, name: string) =>
        (...args: unknown[]) => {
          client.updatePlayerID(playerID);
          client.moves[name]!(...args);
        },
    });

  return {
    get G() {
      return raw().G;
    },
    get ctx() {
      return raw().ctx;
    },
    as,
    get moves() {
      return as(raw().ctx.currentPlayer);
    },
    view: (playerID) => game.playerView!({ G: raw().G, ctx: raw().ctx, playerID }) as CatanState,
    stageOf: (playerID) => raw().ctx.activePlayers?.[playerID] as Stage | undefined,
  };
}

/** Plays the whole setup phase, each player taking the first legal corner and side. */
export function playSetup(table: Table) {
  while (table.ctx.phase === 'setup') {
    const player = table.ctx.currentPlayer;
    const [vertex] = settlementSpots(table.G, player, false);
    table.moves['placeSettlement']!(vertex);
    const [edge] = roadSpots(table.G, player, vertex!);
    table.moves['placeRoad']!(edge);
  }
}
