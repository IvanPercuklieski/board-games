import { getGameDefinition } from '@board-table/games';
import { Client } from 'boardgame.io/client';
import { SocketIO } from 'boardgame.io/multiplayer';
import { io } from 'socket.io-client';

export type PlayerClient = ReturnType<typeof connectPlayer>;
type ClientState = NonNullable<ReturnType<PlayerClient['getState']>>;

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
  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error('Timed out waiting for client state'));
    }, timeoutMs);
    unsubscribe = client.subscribe((state) => {
      if (state && predicate(state)) {
        clearTimeout(timer);
        queueMicrotask(() => unsubscribe());
        resolve(state);
      }
    });
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
