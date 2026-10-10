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
 * Filters socket messages before boardgame.io sees them:
 * - `sync` only from a seated player of an existing match. Stock boardgame.io would otherwise
 *   create a new match for any unknown match ID (filling the database) and send game state to
 *   anyone without a seat.
 * - `update` / `chat` only for the match and seat this socket has synced into. Stock
 *   boardgame.io creates an in-memory queue per match ID it sees in `update` and reads the
 *   database for every message, so unchecked messages would grow memory and DB load.
 * Everything else is dropped. Rejected messages are dropped silently.
 */
export function guardSockets(io: SocketServer, gameNames: string[], db: Async) {
  for (const name of gameNames) {
    io.of(`/${name}`).on('connection', (socket) => {
      // The seat this socket proved it owns; lives and dies with the socket.
      let seat: { matchID: string; playerID: string } | undefined;

      socket.use((packet, next) => {
        const [event] = packet;
        switch (event) {
          case 'sync': {
            const [, matchID, playerID, credentials] = packet;
            seat = undefined;
            if (typeof matchID !== 'string' || matchID.length > MAX_MATCH_ID_LENGTH) return;
            db.fetch(matchID, { metadata: true }).then(
              ({ metadata }) => {
                if (!isSeatOwner(metadata, playerID, credentials)) return;
                seat = { matchID, playerID: playerID as string };
                next();
              },
              () => {}, // storage error: drop the message
            );
            return;
          }
          case 'update': {
            const [, action, , matchID, playerID] = packet;
            const actingAs = (action as { payload?: { playerID?: unknown } } | undefined)?.payload
              ?.playerID;
            if (
              seat &&
              matchID === seat.matchID &&
              playerID === seat.playerID &&
              actingAs === seat.playerID
            ) {
              next();
            }
            return;
          }
          case 'chat': {
            const [, matchID, message] = packet;
            const sender = (message as { sender?: unknown } | undefined)?.sender;
            if (seat && matchID === seat.matchID && sender === seat.playerID) next();
            return;
          }
          default:
            return;
        }
      });
    });
  }
}

const MAX_MATCH_ID_LENGTH = 64;
