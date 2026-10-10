import {
  lobbyResponseSchema,
  ROOM_EVENTS,
  ROOM_NAMESPACE,
  type LobbyResponse,
} from '@board-table/shared';
import { io, type Socket } from 'socket.io-client';
import { eventually } from './players';

export interface RoomClient {
  socket: Socket;
  /** Every lobby snapshot received, oldest first (each one validated). */
  lobbies: LobbyResponse[];
  closed: boolean;
  /** Resolves once connected; rejects with the server's reason (e.g. `not_found`). */
  connected: Promise<void>;
  latest(): LobbyResponse | undefined;
  /** Waits until the latest snapshot matches. */
  waitFor(check: (lobby: LobbyResponse) => boolean, timeoutMs?: number): Promise<LobbyResponse>;
}

/** Opens the live room connection like a browser would (auth in the handshake, never the URL). */
export function connectRoom(serverUrl: string, auth: unknown): RoomClient {
  const socket = io(`${serverUrl}${ROOM_NAMESPACE}`, {
    transports: ['websocket'],
    auth: auth as Record<string, unknown>,
    reconnection: false,
    forceNew: true,
  });
  const client: RoomClient = {
    socket,
    lobbies: [],
    closed: false,
    connected: new Promise<void>((resolve, reject) => {
      socket.on('connect', () => resolve());
      socket.on('connect_error', (err) => reject(err));
    }),
    latest: () => client.lobbies.at(-1),
    waitFor: (check, timeoutMs = 5_000) =>
      eventually(async () => {
        const lobby = client.latest();
        if (!lobby || !check(lobby)) throw new Error('lobby not there yet');
        return lobby;
      }, timeoutMs),
  };
  socket.on(ROOM_EVENTS.lobby, (body: unknown) =>
    client.lobbies.push(lobbyResponseSchema.parse(body)),
  );
  socket.on(ROOM_EVENTS.closed, () => (client.closed = true));
  return client;
}
