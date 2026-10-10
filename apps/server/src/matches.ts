import { getGameDefinition } from '@board-table/games';
import type { StorageAPI } from 'boardgame.io';
import { createMatch as createBgioMatch, type Async } from 'boardgame.io/internal';

export class MatchError extends Error {}

/** A seated player as boardgame.io should know them. Only the credential hash is stored. */
export interface MatchSeat {
  name: string;
  credentialsHash: string;
}

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

/** Gives a seat of a running match to a new player, or frees it (`undefined`). */
export async function setMatchSeat(
  db: Async,
  matchID: string,
  playerID: number,
  seat: MatchSeat | undefined,
): Promise<void> {
  const { metadata } = await db.fetch(matchID, { metadata: true });
  if (!metadata) throw new MatchError('Match not found');
  if (!metadata.players[playerID]) throw new MatchError('Seat not found');

  metadata.players[playerID] = seat
    ? { id: playerID, name: seat.name, credentials: seat.credentialsHash }
    : { id: playerID };
  metadata.updatedAt = Date.now();
  await db.setMetadata(matchID, metadata);
}
