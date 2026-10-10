import { InjectionToken, signal } from '@angular/core';
import {
  lobbyResponseSchema,
  ROOM_EVENTS,
  ROOM_NAMESPACE,
  type LobbyResponse,
  type RoomSocketAuth,
} from '@board-table/shared';
import { io } from 'socket.io-client';

/** The parts of a socket.io client socket the connection uses (tests pass a fake). */
export interface RoomSocketLike {
  /** False once socket.io stopped reconnecting on its own (e.g. refused by the server). */
  readonly active: boolean;
  on(event: string, fn: (...args: never[]) => void): unknown;
  off(): unknown;
  connect(): unknown;
  disconnect(): unknown;
}

/**
 * This browser's live connection to its room (server namespace `/_room`). While it is open the
 * seat counts as present; the server pushes a full lobby snapshot after every change and
 * `closed` when the room or this seat is gone. Nothing is sent from here.
 *
 * socket.io reconnects by itself after network problems. When the server turned the
 * connection away (rate limit, too many tabs) or dropped it while restarting, socket.io stops,
 * so this tries again after `retryMs`. The owner calls stop() (DestroyRef).
 */
export class RoomConnection {
  readonly lobby = signal<LobbyResponse | undefined>(undefined);
  readonly connected = signal(false);
  /** The table is gone for this seat (room closed, seat freed or reissued). Final. */
  readonly closed = signal(false);

  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly retryMs: number;

  constructor(
    private readonly socket: RoomSocketLike,
    { retryMs = 5_000 }: { retryMs?: number } = {},
  ) {
    this.retryMs = retryMs;
    socket.on('connect', () => this.connected.set(true));
    socket.on('disconnect', (reason: string) => {
      this.connected.set(false);
      if (reason === 'io server disconnect' && !this.closed()) this.retryLater(); // restart
    });
    socket.on('connect_error', (error: Error) => {
      this.connected.set(false);
      if (error.message === 'not_found') this.close();
      else if (!socket.active) this.retryLater();
      // otherwise socket.io is still retrying on its own
    });
    socket.on(ROOM_EVENTS.lobby, (body: unknown) => {
      const parsed = lobbyResponseSchema.safeParse(body);
      if (parsed.success) this.lobby.set(parsed.data);
      // a snapshot we can't read is skipped; the next change brings a fresh one
    });
    socket.on(ROOM_EVENTS.closed, () => this.close());
  }

  stop() {
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.socket.off();
    this.socket.disconnect();
  }

  private close() {
    this.closed.set(true);
    this.stop();
  }

  private retryLater() {
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      this.socket.connect();
    }, this.retryMs);
  }
}

export type RoomConnectionFactory = (auth: RoomSocketAuth) => RoomConnection;

/** Real connections go to our server on the same origin; the seat key is in the handshake. */
export const ROOM_CONNECTION_FACTORY = new InjectionToken<RoomConnectionFactory>(
  'ROOM_CONNECTION_FACTORY',
  {
    providedIn: 'root',
    factory: () => (auth) =>
      new RoomConnection(io(ROOM_NAMESPACE, { auth, transports: ['websocket'] })),
  },
);
