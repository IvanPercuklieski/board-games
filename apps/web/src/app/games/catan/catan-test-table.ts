// Test helper (specs and stories only): real GameSessions on a local boardgame.io master.
import { makeCatan, type CatanOptions, type CatanState } from '@board-table/games';
import type { Game } from 'boardgame.io';
import { Local } from 'boardgame.io/multiplayer';
import { GameSession } from '../../game-client/game-session';

export const NAMES = ['Ivan', 'Mara', 'Ben', 'Cy', 'Dee', 'Eli'];

let tables = 0;

export interface CatanTableOptions extends CatanOptions {
  numPlayers?: number;
  seed?: string;
  /** Skip the setup phase: player 0 starts the first main turn. */
  skipSetup?: boolean;
  prepare?: (G: CatanState) => void;
}

/** Dice that return the given rolls in order. */
export function dice(...rolls: [number, number][]): NonNullable<CatanOptions['dice']> {
  const queue = [...rolls];
  return () => queue.shift() ?? [1, 1];
}

/** One session per seat at a fresh local table; the caller stops them (see `stopAll`). */
export function catanTable({
  numPlayers = 3,
  seed = 'board-test',
  skipSetup = false,
  prepare,
  ...options
}: CatanTableOptions = {}): GameSession<CatanState>[] {
  const base = makeCatan(options);
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
  const multiplayer = Local();
  const matchID = `catan-${tables++}`;
  return Array.from({ length: numPlayers }, (_, i) => {
    const session = new GameSession<CatanState>({
      game,
      matchID,
      playerID: String(i),
      credentials: 'x',
      multiplayer,
      playerNames: NAMES,
      numPlayers,
    });
    session.start();
    return session;
  });
}
