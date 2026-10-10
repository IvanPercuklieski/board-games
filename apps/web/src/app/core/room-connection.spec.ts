import { ROOM_EVENTS, type LobbyResponse } from '@board-table/shared';
import { RoomConnection, type RoomSocketLike } from './room-connection';

const roomId = 'AbCdEfGhIjKlMnOpQrSt_-';
const lobby: LobbyResponse = {
  roomId,
  gameId: 'tictactoe',
  status: 'waiting',
  maxSeats: 2,
  seats: [{ seatIndex: 0, name: 'Ivan', isHost: true, away: false }],
  you: { seatIndex: 0, isHost: true },
};

/** A socket.io client socket stand-in: tests fire the server's events by hand. */
class FakeSocket implements RoomSocketLike {
  active = true;
  readonly listeners = new Map<string, Array<(...args: never[]) => void>>();
  readonly connect = vi.fn();
  readonly disconnect = vi.fn(() => {
    this.active = false;
  });
  readonly off = vi.fn(() => this.listeners.clear());
  on(event: string, fn: (...args: never[]) => void) {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), fn]);
    return this;
  }
  fire(event: string, ...args: unknown[]) {
    // the real socket passes whatever the server sent
    for (const fn of this.listeners.get(event) ?? []) (fn as (...a: unknown[]) => void)(...args);
  }
}

describe('RoomConnection', () => {
  let socket: FakeSocket;
  let connection: RoomConnection;

  beforeEach(() => {
    vi.useFakeTimers();
    socket = new FakeSocket();
    connection = new RoomConnection(socket, { retryMs: 5_000 });
  });
  afterEach(() => {
    connection.stop();
    vi.useRealTimers();
  });

  it('tracks the connection and the latest lobby snapshot', () => {
    expect(connection.connected()).toBe(false);
    socket.fire('connect');
    expect(connection.connected()).toBe(true);
    socket.fire(ROOM_EVENTS.lobby, lobby);
    expect(connection.lobby()).toEqual(lobby);
    socket.fire('disconnect', 'transport close');
    expect(connection.connected()).toBe(false);
    expect(connection.lobby()).toEqual(lobby); // kept while reconnecting
  });

  it('ignores snapshots that do not match the contract', () => {
    socket.fire(ROOM_EVENTS.lobby, { ...lobby, status: 'finished' });
    expect(connection.lobby()).toBeUndefined();
  });

  it('is closed when the server says the table is gone, and stops', () => {
    socket.fire(ROOM_EVENTS.closed);
    expect(connection.closed()).toBe(true);
    expect(socket.disconnect).toHaveBeenCalled();
  });

  it('is closed when the server refuses the seat (not_found)', () => {
    socket.active = false;
    socket.fire('connect_error', new Error('not_found'));
    expect(connection.closed()).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(socket.connect).not.toHaveBeenCalled();
  });

  it('tries again later when the server turned it away for another reason', () => {
    socket.active = false; // socket.io gives up after a middleware error
    socket.fire('connect_error', new Error('rate_limited'));
    expect(connection.closed()).toBe(false);
    vi.advanceTimersByTime(4_999);
    expect(socket.connect).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(socket.connect).toHaveBeenCalledTimes(1);
  });

  it('leaves retrying to socket.io while it is still trying (network errors)', () => {
    socket.fire('connect_error', new Error('websocket error'));
    vi.advanceTimersByTime(60_000);
    expect(socket.connect).not.toHaveBeenCalled();
  });

  it('reconnects after the server dropped it without closing the table (restart)', () => {
    socket.fire('connect');
    socket.fire('disconnect', 'io server disconnect');
    vi.advanceTimersByTime(5_000);
    expect(socket.connect).toHaveBeenCalledTimes(1);
  });

  it('stop disconnects, removes listeners and cancels a pending retry', () => {
    socket.active = false;
    socket.fire('connect_error', new Error('rate_limited'));
    connection.stop();
    vi.advanceTimersByTime(60_000);
    expect(socket.connect).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalled();
    expect(socket.off).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
