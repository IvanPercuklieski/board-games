type RevokedListener = (matchID: string, playerID: string) => void;
type RoomListener = (roomId: string) => void;

/**
 * In-process notifications between the room rules and the sockets:
 * - a seat's credentials stopped being valid (seat freed or reissued), so the game socket guard
 *   disconnects that seat and a removed player stops receiving the game (matters for
 *   hidden-information games);
 * - a match ended and was deleted, so its players' game sockets are closed and boardgame.io drops
 *   its per-match connection state before the room's next game reuses the match ID;
 * - a room changed (seats, game, status, host, presence) or was closed, so the room connections
 *   get a fresh snapshot or are told the table is gone.
 */
export class SeatEvents {
  private readonly revokedListeners = new Set<RevokedListener>();
  private readonly matchEndedListeners = new Set<RoomListener>();
  private readonly roomChangedListeners = new Set<RoomListener>();
  private readonly roomClosedListeners = new Set<RoomListener>();

  /** Returns an unsubscribe function (same for every `on...`). */
  onRevoked(listener: RevokedListener): () => void {
    return subscribe(this.revokedListeners, listener);
  }

  onMatchEnded(listener: RoomListener): () => void {
    return subscribe(this.matchEndedListeners, listener);
  }

  onRoomChanged(listener: RoomListener): () => void {
    return subscribe(this.roomChangedListeners, listener);
  }

  onRoomClosed(listener: RoomListener): () => void {
    return subscribe(this.roomClosedListeners, listener);
  }

  revoked(matchID: string, playerID: string) {
    for (const listener of this.revokedListeners) listener(matchID, playerID);
  }

  matchEnded(matchID: string) {
    for (const listener of this.matchEndedListeners) listener(matchID);
  }

  roomChanged(roomId: string) {
    for (const listener of this.roomChangedListeners) listener(roomId);
  }

  roomClosed(roomId: string) {
    for (const listener of this.roomClosedListeners) listener(roomId);
  }
}

function subscribe<L>(listeners: Set<L>, listener: L): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
