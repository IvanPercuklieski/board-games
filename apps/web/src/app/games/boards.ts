import { InjectionToken, type InputSignal, type Type } from '@angular/core';
import type { Game } from 'boardgame.io';
import { SocketIO } from 'boardgame.io/multiplayer';
import { GameSession, type GameSessionOptions } from '../game-client/game-session';

/**
 * Every game board is a standalone component with one required input: the player's session.
 * It renders `session.G()` / `session.ctx()` and calls `session.move(...)`.
 */
export interface GameBoard<G = unknown> {
  readonly session: InputSignal<GameSession<G>>;
}

export type BoardLoader = () => Promise<Type<unknown>>;

/** Board components by game id, loaded only when that game is played. */
const BOARDS: Record<string, BoardLoader> = {
  tictactoe: () =>
    import('./tictactoe/tictactoe-board.component').then((m) => m.TicTacToeBoardComponent),
  catan: () => import('./catan/catan-board.component').then((m) => m.CatanBoardComponent),
};

export const GAME_BOARDS = new InjectionToken<Record<string, BoardLoader>>('GAME_BOARDS', {
  providedIn: 'root',
  factory: () => BOARDS,
});

export type SessionFactory = (
  options: Omit<GameSessionOptions<unknown>, 'multiplayer' | 'game'> & { game: Game },
) => GameSession<unknown>;

/** Real sessions talk to our server over socket.io on the same origin. */
export const GAME_SESSION_FACTORY = new InjectionToken<SessionFactory>('GAME_SESSION_FACTORY', {
  providedIn: 'root',
  factory: () => (options) =>
    new GameSession({ ...options, multiplayer: SocketIO({ server: window.location.origin }) }),
});
