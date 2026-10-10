import type { Game, StorageAPI } from 'boardgame.io';
import { getFilterPlayerView } from 'boardgame.io/internal';
import { SocketIO } from 'boardgame.io/server';

/** The parts of boardgame.io 0.50's SocketIO transport this workaround relies on. */
interface TransportInternals {
  addClient(client: RegisteredClient, game: Game): void;
  /** One action at a time per match; moves are applied and stored inside it. */
  getMatchQueue(matchID: string): { add(task: () => Promise<void>): Promise<void> };
}
interface RegisteredClient {
  socket: { emit(event: string, ...args: unknown[]): void };
  matchID: string;
  playerID: string | null | undefined;
}

/**
 * boardgame.io's SocketIO transport, with a fix for a race in 0.50.
 *
 * A `sync` reads the match outside the per-match queue that applies moves, answers with that
 * state, and only then registers the socket for broadcasts. A move made by someone else
 * meanwhile is missed: either it was broadcast before this socket was registered, or it was
 * broadcast but not yet stored (boardgame.io broadcasts first), so the sync read the old
 * state. Either way that player never sees the move and the game stalls for them.
 * Fix: right after registering, queue a task on the match queue (so every earlier move is
 * stored by then) that sends the current state once more as an `update`. Clients ignore
 * updates older than what they have, so this is always safe.
 */
export function createSocketTransport(db: StorageAPI.Async, maxHttpBufferSize: number): SocketIO {
  const transport = new SocketIO({
    // only the options we set; boardgame.io types require the full socket.io options object.
    // connectTimeout: a connection that never joins a namespace is dropped after 10 s.
    socketOpts: { maxHttpBufferSize, connectTimeout: 10_000 } as never,
  });
  // addClient/getMatchQueue are private in boardgame.io's types; the transport calls addClient
  // via `this`, so an own property wraps it. The queue is created while the socket is
  // registered, and boardgame.io deletes it when the match's last socket leaves.
  // Covered by app.spec ("joining while the other player moves" / "... a move is being saved").
  const internals = transport as unknown as TransportInternals;
  const addClient = internals.addClient.bind(transport);
  internals.addClient = (client, game) => {
    addClient(client, game);
    void internals.getMatchQueue(client.matchID).add(() => resendState(db, client, game));
  };
  return transport;
}

async function resendState(db: StorageAPI.Async, client: RegisteredClient, game: Game) {
  let state;
  try {
    ({ state } = await db.fetch(client.matchID, { state: true }));
  } catch {
    return; // storage error: the next move's broadcast brings this player up to date
  }
  if (!state) return;
  const data = getFilterPlayerView(game)(client.playerID ?? null, {
    type: 'update',
    args: [client.matchID, { ...state, deltalog: [] }], // no new log entries
  });
  client.socket.emit(data.type, ...data.args);
}
