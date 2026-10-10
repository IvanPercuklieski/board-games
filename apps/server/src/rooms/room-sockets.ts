import { ROOM_EVENTS, ROOM_NAMESPACE, roomSocketAuthSchema } from '@board-table/shared';
import type { RateLimiter } from '../http/rate-limiter';
import { hashSecret } from '../secrets';
import type { RoomPresence } from './presence';
import type { RoomsRepository } from './rooms-repository';
import type { RoomsService } from './rooms-service';
import type { SeatEvents } from './seat-events';

/** At most this many live room connections per seat (tabs/devices). */
export const MAX_SOCKETS_PER_SEAT = 3;
/** Connection attempts per IP and minute (each one costs a DB read). */
export const ROOM_CONNECTS_PER_MINUTE = 30;

/**
 * What this module needs from socket.io (kept narrow, like socket-security.ts). The server is
 * socket.io 3 (bundled by boardgame.io's koa-socket-2): no `socket.data` or `fetchSockets`, so
 * the seat and the room's sockets are kept here.
 */
export interface RoomSocket {
  id: string;
  handshake: {
    auth: unknown;
    address: string;
    headers: Record<string, string | string[] | undefined>;
  };
  use(fn: (packet: unknown[], next: (err?: Error) => void) => void): void;
  on(event: 'disconnect', fn: () => void): void;
  emit(event: string, ...args: unknown[]): void;
  disconnect(close?: boolean): void;
}
interface RoomNamespace {
  use(fn: (socket: RoomSocket, next: (err?: Error) => void) => void): void;
  on(event: 'connection', fn: (socket: RoomSocket) => void): void;
}
interface SocketServer {
  of(name: string): RoomNamespace;
}

interface Connection {
  socket: RoomSocket;
  roomId: string;
  /** The seat's credentials hash (the raw secret is never kept). */
  seatKey: string;
  /** Its seat is gone; the disconnect must not start presence timers. */
  evicted: boolean;
}

/**
 * The live room connection (`/_room`): every seated browser keeps one open while it is in the
 * waiting room or at the table. It is how presence is known, and how the room state reaches
 * the browser (a full `lobby` snapshot after every change, `closed` when the room or seat is
 * gone). It only sends: every packet from the browser is dropped. The seat key comes in the
 * handshake `auth` payload, never in the URL. Returns a stop function (shutdown).
 */
export function serveRoomSockets({
  io,
  service,
  repo,
  presence,
  seatEvents,
  limiter,
  trustProxy,
  log = console.error,
}: {
  io: SocketServer;
  service: RoomsService;
  repo: RoomsRepository;
  presence: RoomPresence;
  seatEvents: SeatEvents;
  limiter: RateLimiter;
  trustProxy: boolean;
  log?: (...args: unknown[]) => void;
}): () => void {
  const nsp = io.of(ROOM_NAMESPACE);
  // Seats proven in the handshake, until the socket connects (or fails).
  const verified = new WeakMap<RoomSocket, { roomId: string; seatKey: string }>();
  // Live connections per room; entries are removed on disconnect.
  const byRoom = new Map<string, Set<Connection>>();
  let stopped = false;

  nsp.use((socket, next) => {
    void authorize(socket).then(
      (error) => next(error === undefined ? undefined : new Error(error)),
      (e: unknown) => {
        log('Room connection check failed:', e instanceof Error ? e.message : e);
        next(new Error('internal_error'));
      },
    );
  });

  /** Returns an error code, or undefined when the socket may connect. */
  async function authorize(socket: RoomSocket): Promise<string | undefined> {
    const ip = clientIp(socket, trustProxy);
    if (!limiter.consume(`room-socket:${ip}`, ROOM_CONNECTS_PER_MINUTE, 60_000).allowed) {
      return 'rate_limited';
    }
    const auth = roomSocketAuthSchema.safeParse(socket.handshake.auth);
    if (!auth.success) return 'not_found';
    const { roomId, credentials } = auth.data;
    const seatKey = hashSecret(credentials);
    if (!(await repo.findSeatByCredentialsHash(roomId, seatKey))) return 'not_found';
    if (presence.socketCount(roomId, seatKey) >= MAX_SOCKETS_PER_SEAT) return 'limit_reached';
    verified.set(socket, { roomId, seatKey });
    return undefined;
  }

  nsp.on('connection', (socket) => {
    const seat = verified.get(socket);
    if (!seat || stopped) return socket.disconnect(true); // can't happen: the check runs first
    const connection: Connection = { socket, ...seat, evicted: false };
    socket.use(() => {}); // the browser sends nothing on this connection: drop every packet
    const sockets = byRoom.get(seat.roomId) ?? new Set();
    byRoom.set(seat.roomId, sockets.add(connection));
    presence.connected(seat.roomId, seat.seatKey, socket.id);
    socket.on('disconnect', () => {
      sockets.delete(connection);
      if (sockets.size === 0 && byRoom.get(seat.roomId) === sockets) byRoom.delete(seat.roomId);
      if (!connection.evicted) presence.disconnected(seat.roomId, seat.seatKey, socket.id);
    });
    changed(seat.roomId); // this socket's first snapshot goes through the same ordered queue
  });

  // --- snapshots, one room at a time and in order ------------------------------------
  const dirty = new Set<string>();
  let flushing = false;

  function changed(roomId: string) {
    if (stopped) return;
    dirty.add(roomId);
    if (flushing) return;
    flushing = true;
    queueMicrotask(() => void flush());
  }

  async function flush() {
    for (let roomId = first(dirty); roomId !== undefined && !stopped; roomId = first(dirty)) {
      dirty.delete(roomId);
      try {
        await refresh(roomId);
      } catch (e) {
        log('Room update failed:', e instanceof Error ? e.message : e); // next change retries
      }
    }
    flushing = false;
  }

  /** Sends each socket its own snapshot; sockets whose seat is gone are told and closed. */
  async function refresh(roomId: string) {
    const keys = new Set((await repo.listSeats(roomId)).map((s) => s.credentialsHash));
    for (const key of keys) presence.track(roomId, key); // seats that haven't connected yet
    for (const connection of [...(byRoom.get(roomId) ?? [])]) {
      const lobby = await service.lobbyFor(roomId, connection.seatKey);
      if (lobby) connection.socket.emit(ROOM_EVENTS.lobby, lobby);
      else evict(connection);
    }
    for (const key of presence.seatKeys(roomId)) {
      if (!keys.has(key)) presence.forgetSeat(roomId, key);
    }
  }

  function evict(connection: Connection) {
    connection.evicted = true;
    connection.socket.emit(ROOM_EVENTS.closed);
    connection.socket.disconnect(true);
  }

  function closeRoom(roomId: string) {
    dirty.delete(roomId);
    presence.forgetRoom(roomId);
    for (const connection of [...(byRoom.get(roomId) ?? [])]) evict(connection);
  }

  /** After a game: free seats that expired meanwhile, and replace a host who is away. */
  async function afterGame(roomId: string) {
    for (const key of presence.expiredSeats(roomId)) await service.seatExpired(roomId, key);
    for (const key of presence.seatKeys(roomId)) {
      if (presence.isAway(roomId, key)) await service.seatAway(roomId, key);
    }
  }

  const unsubscribe = [
    seatEvents.onRoomChanged(changed),
    seatEvents.onRoomClosed(closeRoom),
    seatEvents.onMatchEnded((roomId) => {
      afterGame(roomId).catch((e: unknown) =>
        log('Presence after game failed:', e instanceof Error ? e.message : e),
      );
    }),
  ];

  return () => {
    stopped = true;
    dirty.clear();
    for (const stop of unsubscribe) stop();
    for (const sockets of byRoom.values()) {
      for (const connection of [...sockets]) {
        connection.evicted = true; // shutting down: not "away"
        connection.socket.disconnect(true);
      }
    }
    byRoom.clear();
  };
}

const first = (set: Set<string>) => set.values().next().value;

/** Same rule as HTTP: behind Render's proxy the client is the last X-Forwarded-For entry. */
function clientIp(socket: RoomSocket, trustProxy: boolean): string {
  const header = socket.handshake.headers['x-forwarded-for'];
  const forwarded = Array.isArray(header) ? header.join(',') : header;
  const last = forwarded?.split(',').at(-1)?.trim();
  return trustProxy && last ? last : socket.handshake.address;
}
