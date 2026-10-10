import { buildMatch } from '../matches';
import type { GameStorage } from '../storage/game-storage';
import { hashSecret, newRoomId, newSecret } from '../secrets';

export interface TestSeat {
  playerID: string;
  credentials: string;
}

/**
 * Stores a started match for tests. `null` entries are free seats (no name, no credentials).
 * Returns the raw secrets the way a browser would hold them.
 */
export async function createSeatedMatch(
  db: GameStorage,
  names: (string | null)[],
  gameId = 'tictactoe',
): Promise<{ matchID: string; seats: Record<number, TestSeat> }> {
  const matchID = newRoomId();
  const secrets = names.map(() => newSecret());
  const players = names.map((name, i) => ({
    name: name ?? 'placeholder',
    credentialsHash: hashSecret(secrets[i]!),
  }));
  await db.createMatch(matchID, buildMatch(gameId, players));

  const seats: Record<number, TestSeat> = {};
  for (const [i, name] of names.entries()) {
    if (name === null) await db.setPlayerSeat(matchID, i, undefined);
    else seats[i] = { playerID: String(i), credentials: secrets[i]! };
  }
  return { matchID, seats };
}
