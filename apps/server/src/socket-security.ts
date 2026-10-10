import { timingSafeEqual } from 'node:crypto';
import type { Server as BgioServerTypes } from 'boardgame.io';
import type { Async } from 'boardgame.io/internal';

/**
 * True only if `credentials` are the secret of a claimed seat in this match.
 * Unlike boardgame.io's default, this is enforced even when no seat has been claimed yet,
 * and unknown matches (no metadata) are always rejected.
 */
export function isSeatOwner(
  metadata: BgioServerTypes.MatchData | undefined,
  playerID: unknown,
  credentials: unknown,
): boolean {
  if (!metadata || typeof playerID !== 'string' || typeof credentials !== 'string') return false;
  const expected = metadata.players[Number(playerID)]?.credentials;
  if (typeof expected !== 'string' || expected.length === 0) return false;
  const a = Buffer.from(credentials);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface PacketSocket {
  use(fn: (packet: unknown[], next: (err?: Error) => void) => void): void;
}
interface SocketNamespace {
  on(event: 'connection', fn: (socket: PacketSocket) => void): void;
}
interface SocketServer {
  of(name: string): SocketNamespace;
}

/**
 * Drops `sync` messages unless they come from a seated player of an existing match.
 * Stock boardgame.io would otherwise create a new match for any unknown match ID
 * (filling the database) and send game state to anyone without a seat.
 */
export function guardSockets(io: SocketServer, gameNames: string[], db: Async) {
  for (const name of gameNames) {
    io.of(`/${name}`).on('connection', (socket) => {
      socket.use((packet, next) => {
        const [event, matchID, playerID, credentials] = packet;
        if (event !== 'sync') return next();
        if (typeof matchID !== 'string' || matchID.length > 64) return; // drop
        db.fetch(matchID, { metadata: true }).then(
          ({ metadata }) => {
            if (isSeatOwner(metadata, playerID, credentials)) next();
          },
          () => {}, // storage error: drop the message
        );
      });
    });
  }
}
