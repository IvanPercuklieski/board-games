import { getGameDefinition } from '@board-table/games';
import type { StorageAPI } from 'boardgame.io';
import { createMatch as createBgioMatch } from 'boardgame.io/internal';
import type { MatchSeat } from './storage/game-storage';

export class MatchError extends Error {}

/**
 * Builds a boardgame.io match for exactly these players: player i gets playerID `i`.
 * Pure: the caller persists it (together with the room, in one transaction).
 */
export function buildMatch(gameId: string, players: MatchSeat[]): StorageAPI.CreateMatchOpts {
  const def = getGameDefinition(gameId);
  if (!def) throw new MatchError(`Unknown game: ${gameId}`);
  const numPlayers = players.length;
  if (numPlayers < def.minPlayers || numPlayers > def.maxPlayers) {
    throw new MatchError(`${def.displayName} needs ${def.minPlayers}-${def.maxPlayers} players`);
  }

  const match = createBgioMatch({
    game: def.game,
    numPlayers,
    setupData: undefined,
    unlisted: true,
  });
  if ('setupDataError' in match) throw new MatchError(match.setupDataError);

  players.forEach((player, id) => {
    match.metadata.players[id] = { id, name: player.name, credentials: player.credentialsHash };
  });
  return match;
}
