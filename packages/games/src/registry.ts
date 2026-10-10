import type { Game } from 'boardgame.io';
import { getCatalogEntry, type GameCatalogEntry } from './catalog';
import { TicTacToe } from './tictactoe/tictactoe';

export interface GameDefinition extends Pick<
  GameCatalogEntry,
  'id' | 'displayName' | 'minPlayers' | 'maxPlayers'
> {
  game: Game<any>; // registry holds games with different state types
}

/** Pairs a catalog entry (names, player counts) with its rules; the id is the game name. */
function define(game: Game<any>): GameDefinition {
  const entry = getCatalogEntry(game.name ?? '');
  if (!entry) throw new Error(`Game "${game.name}" has no catalog entry`);
  const { id, displayName, minPlayers, maxPlayers } = entry;
  return { id, displayName, minPlayers, maxPlayers, game };
}

export const gameRegistry: readonly GameDefinition[] = [define(TicTacToe)];

export function getGameDefinition(id: string): GameDefinition | undefined {
  return gameRegistry.find((def) => def.id === id);
}
