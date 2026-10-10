import type { Game } from 'boardgame.io';
import { TicTacToe } from './tictactoe/tictactoe';

export interface GameDefinition {
  /** Registry key; must equal `game.name` (boardgame.io uses it in match URLs and storage). */
  id: string;
  displayName: string;
  minPlayers: number;
  maxPlayers: number;
  game: Game<any>; // registry holds games with different state types
}

export const gameRegistry: readonly GameDefinition[] = [
  { id: 'tictactoe', displayName: 'Tic-tac-toe', minPlayers: 2, maxPlayers: 2, game: TicTacToe },
];

export function getGameDefinition(id: string): GameDefinition | undefined {
  return gameRegistry.find((def) => def.id === id);
}
