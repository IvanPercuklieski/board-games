import type { Server } from 'boardgame.io';
import type { Async } from 'boardgame.io/internal';

/** A seated player as boardgame.io should know them. Only the credential hash is stored. */
export interface MatchSeat {
  name: string;
  credentialsHash: string;
}

/**
 * boardgame.io storage plus seat management.
 *
 * Player identity (name + credentials hash) in match metadata is owned by our code and only
 * changed through `setPlayerSeat`. boardgame.io's own `setMetadata` writes (connection status,
 * updatedAt, gameover) are read-modify-write copies that could be stale, so implementations
 * keep the stored identity and take everything else from boardgame.io.
 */
export interface GameStorage extends Async {
  /** Gives a seat to a player, or frees it (`undefined`). False if match or seat is unknown. */
  setPlayerSeat(matchID: string, playerID: number, seat: MatchSeat | undefined): Promise<boolean>;
}

type Players = Server.MatchData['players'];

/** Applies boardgame.io's player fields on top of the stored identity (name + credentials). */
export function keepStoredIdentity(incoming: Players, stored: Players): Players {
  const merged: Players = {};
  for (const [key, player] of Object.entries(incoming)) {
    const id = Number(key);
    const { name: _name, credentials: _credentials, ...rest } = player;
    const identity = stored[id];
    merged[id] = {
      ...rest,
      ...(identity?.name !== undefined && { name: identity.name }),
      ...(identity?.credentials !== undefined && { credentials: identity.credentials }),
    };
  }
  return merged;
}

/** The player entry for a seat: identity fields set, or removed when the seat is freed. */
export function playerForSeat(
  current: Players[number],
  seat: MatchSeat | undefined,
): Players[number] {
  const { name: _name, credentials: _credentials, ...rest } = current;
  return seat ? { ...rest, name: seat.name, credentials: seat.credentialsHash } : rest;
}
