import { getGameDefinition } from '@board-table/games';
import { Client } from 'boardgame.io/client';
import { SocketIO } from 'boardgame.io/multiplayer';
import { io } from 'socket.io-client';

export type PlayerClient = ReturnType<typeof connectPlayer>;
type ClientState = NonNullable<ReturnType<PlayerClient['getState']>>;

type Listener = (state: ClientState) => void;
const listeners = new WeakMap<object, Set<Listener>>();

/** Connects a boardgame.io client to the server as a seated player (like a browser would). */
export function connectPlayer(
  serverUrl: string,
  matchID: string,
  seat: { playerID: string; credentials: string },
  gameId = 'tictactoe',
) {
  const client = Client({
    game: getGameDefinition(gameId)!.game,
    multiplayer: SocketIO({ server: serverUrl }),
    matchID,
    playerID: seat.playerID,
    credentials: seat.credentials,
    debug: false,
  });
  // Subscribe exactly once. boardgame.io 0.50's client numbers subscribers by the current count,
  // so subscribing again after an unsubscribe can reuse an id and silently drop a listener.
  const set = new Set<Listener>();
  listeners.set(client, set);
  client.subscribe((state) => {
    if (state) for (const listener of [...set]) listener(state);
  });
  client.start();
  return client;
}

/** Waits until it's this player's turn (server-confirmed), makes the move, and waits for the result. */
export async function playMove(client: PlayerClient, cell: number) {
  const me = client.playerID!;
  await waitForState(client, (s) => s.ctx.currentPlayer === me && s.ctx.gameover === undefined);
  client.moves['clickCell']!(cell);
  await waitForState(
    client,
    (s) => s.G.cells[cell] === me && (s.ctx.currentPlayer !== me || s.ctx.gameover !== undefined),
  );
}

/** A raw socket.io connection to a game namespace, to send messages like an attacker would. */
export function rawSocket(serverUrl: string, gameName = 'tictactoe') {
  const received: string[] = [];
  const socket = io(`${serverUrl}/${gameName}`, { transports: ['websocket'] });
  socket.onAny((event: string) => received.push(event));
  const connected = new Promise<void>((resolve, reject) => {
    socket.on('connect', () => resolve());
    socket.on('connect_error', reject);
  });
  return { socket, received, connected };
}

export function makeMoveAction(
  move: string,
  args: unknown[],
  playerID: string,
  credentials?: string,
) {
  return { type: 'MAKE_MOVE', payload: { type: move, args, playerID, credentials } };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Resolves with the client state once `predicate` holds, or rejects after `timeoutMs`. */
export function waitForState(
  client: PlayerClient,
  predicate: (state: ClientState) => boolean,
  timeoutMs = 10_000,
): Promise<ClientState> {
  const set = listeners.get(client)!;
  return new Promise((resolve, reject) => {
    const current = client.getState();
    if (current && predicate(current)) return resolve(current);
    const listener: Listener = (state) => {
      if (!predicate(state)) return;
      set.delete(listener);
      clearTimeout(timer);
      resolve(state);
    };
    const timer = setTimeout(() => {
      set.delete(listener);
      reject(new Error('Timed out waiting for client state'));
    }, timeoutMs);
    set.add(listener);
  });
}

/** Retries `check` until it stops throwing, or rethrows its last error after `timeoutMs`. */
export async function eventually<T>(check: () => Promise<T>, timeoutMs = 5_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      return await check();
    } catch (e) {
      if (Date.now() > deadline) throw e;
      await sleep(100);
    }
  }
}
