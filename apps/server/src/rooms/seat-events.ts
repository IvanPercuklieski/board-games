type RevokedListener = (matchID: string, playerID: string) => void;

/**
 * In-process notification that a seat's credentials stopped being valid (seat freed or
 * reissued). The socket guard listens and disconnects sockets still bound to that seat,
 * so a removed player stops receiving the game (matters for hidden-information games).
 */
export class SeatEvents {
  private readonly listeners = new Set<RevokedListener>();

  /** Returns an unsubscribe function. */
  onRevoked(listener: RevokedListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  revoked(matchID: string, playerID: string) {
    for (const listener of this.listeners) listener(matchID, playerID);
  }
}
