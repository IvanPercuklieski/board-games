type RevokedListener = (matchID: string, playerID: string) => void;
type MatchEndedListener = (matchID: string) => void;

/**
 * In-process notifications for the socket guard, which disconnects the affected sockets:
 * - a seat's credentials stopped being valid (seat freed or reissued), so a removed player
 *   stops receiving the game (matters for hidden-information games);
 * - a match ended and was deleted, so its players' sockets are closed and boardgame.io drops
 *   its per-match connection state before the room's next game reuses the match ID.
 */
export class SeatEvents {
  private readonly revokedListeners = new Set<RevokedListener>();
  private readonly matchEndedListeners = new Set<MatchEndedListener>();

  /** Returns an unsubscribe function. */
  onRevoked(listener: RevokedListener): () => void {
    this.revokedListeners.add(listener);
    return () => this.revokedListeners.delete(listener);
  }

  /** Returns an unsubscribe function. */
  onMatchEnded(listener: MatchEndedListener): () => void {
    this.matchEndedListeners.add(listener);
    return () => this.matchEndedListeners.delete(listener);
  }

  revoked(matchID: string, playerID: string) {
    for (const listener of this.revokedListeners) listener(matchID, playerID);
  }

  matchEnded(matchID: string) {
    for (const listener of this.matchEndedListeners) listener(matchID);
  }
}
