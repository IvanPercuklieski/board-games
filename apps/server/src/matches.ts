import { randomBytes } from 'node:crypto';
import { getGameDefinition } from '@board-table/games';
import { createMatch as createBgioMatch, type Async } from 'boardgame.io/internal';

export class MatchError extends Error {}

const MAX_PLAYER_NAME_LENGTH = 24;

/** Creates a match for a registered game and returns its (unguessable) matchID. */
export async function createMatch(
  db: Async,
  gameId: string,
  opts: { numPlayers?: number } = {},
): Promise<string> {
  const def = getGameDefinition(gameId);
  if (!def) throw new MatchError(`Unknown game: ${gameId}`);
  const numPlayers = opts.numPlayers ?? def.minPlayers;
  if (!Number.isInteger(numPlayers) || numPlayers < def.minPlayers || numPlayers > def.maxPlayers) {
    throw new MatchError(`${def.displayName} needs ${def.minPlayers}-${def.maxPlayers} players`);
  }

  const match = createBgioMatch({
    game: def.game,
    numPlayers,
    setupData: undefined,
    unlisted: true,
  });
  if ('setupDataError' in match) throw new MatchError(match.setupDataError);

  const matchID = randomBytes(16).toString('base64url');
  await db.createMatch(matchID, match);
  return matchID;
}

/**
 * Seats a player in the first free seat and returns their secret credentials.
 * A taken seat is never handed out again. Claims for the same match are serialized
 * so simultaneous joins can't get the same seat (single server instance).
 */
export function claimSeat(
  db: Async,
  matchID: string,
  playerName: string,
): Promise<{ playerID: string; credentials: string }> {
  const name = playerName.trim();
  if (name.length < 1 || name.length > MAX_PLAYER_NAME_LENGTH) {
    return Promise.reject(
      new MatchError(`Player name must be 1-${MAX_PLAYER_NAME_LENGTH} characters`),
    );
  }

  return withMatchLock(matchID, async () => {
    const { metadata } = await db.fetch(matchID, { metadata: true });
    if (!metadata) throw new MatchError('Match not found');

    const free = Object.values(metadata.players).find((p) => p.name === undefined);
    if (!free) throw new MatchError('Match is full');

    const credentials = randomBytes(32).toString('base64url');
    metadata.players[free.id] = { ...free, name, credentials };
    metadata.updatedAt = Date.now();
    await db.setMetadata(matchID, metadata);
    return { playerID: String(free.id), credentials };
  });
}

const locks = new Map<string, Promise<unknown>>();

function withMatchLock<T>(matchID: string, task: () => Promise<T>): Promise<T> {
  const previous = locks.get(matchID) ?? Promise.resolve();
  const run = previous.then(task, task);
  const settled = run.catch(() => {});
  locks.set(matchID, settled);
  void settled.then(() => {
    if (locks.get(matchID) === settled) locks.delete(matchID);
  });
  return run;
}
