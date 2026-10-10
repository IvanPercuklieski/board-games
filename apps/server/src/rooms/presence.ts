export interface PresenceChange {
  roomId: string;
  /** The seat's credentials hash: stable while the seat exists, even when seats are renumbered. */
  seatKey: string;
  /**
   * `away`: no connection for the grace period. `back`: an away seat connected again.
   * `expired`: no connection for the free-seat period (the owner decides what to do).
   */
  kind: 'away' | 'back' | 'expired';
}

interface SeatPresence {
  sockets: Set<string>;
  away: boolean;
  /** When the seat last lost its connection (or was first tracked); set while it has none. */
  disconnectedAt?: number;
  awayTimer?: ReturnType<typeof setTimeout>;
  expireTimer?: ReturnType<typeof setTimeout>;
}

/**
 * Who is at the table, from live room connections (in memory: one server instance, no DB
 * writes). A seat is present while it has a socket. When its last socket goes (or a seat is
 * tracked before it ever connects), timers start: after the grace period the seat is away,
 * after the free-seat period it has expired. Right after the server starts, the grace period
 * is stretched to the startup grace so everyone can reconnect first.
 *
 * Entries live only while the seat or room does: the owner calls forgetSeat / forgetRoom when
 * they are gone, and stop() on shutdown.
 */
export class RoomPresence {
  private readonly rooms = new Map<string, Map<string, SeatPresence>>();
  private readonly startedAt = Date.now();
  private readonly graceMs: number;
  private readonly startupGraceMs: number;
  private readonly freeSeatAfterMs: number;
  private readonly onChange: (change: PresenceChange) => void;

  constructor(options: {
    graceMs: number;
    startupGraceMs: number;
    freeSeatAfterMs: number;
    onChange: (change: PresenceChange) => void;
  }) {
    this.graceMs = options.graceMs;
    this.startupGraceMs = options.startupGraceMs;
    this.freeSeatAfterMs = options.freeSeatAfterMs;
    this.onChange = options.onChange;
  }

  connected(roomId: string, seatKey: string, socketId: string): void {
    const seat = this.seat(roomId, seatKey, true);
    seat.sockets.add(socketId);
    seat.disconnectedAt = undefined;
    this.clearTimers(seat);
    if (seat.away) {
      seat.away = false;
      this.onChange({ roomId, seatKey, kind: 'back' });
    }
  }

  disconnected(roomId: string, seatKey: string, socketId: string): void {
    const seat = this.seat(roomId, seatKey, false);
    if (!seat?.sockets.delete(socketId) || seat.sockets.size > 0) return;
    this.startTimers(roomId, seatKey, seat);
  }

  /** A seat that exists but may not have connected yet (just joined, or after a restart). */
  track(roomId: string, seatKey: string): void {
    if (this.seat(roomId, seatKey, false)) return;
    this.startTimers(roomId, seatKey, this.seat(roomId, seatKey, true));
  }

  isAway(roomId: string, seatKey: string): boolean {
    return this.seat(roomId, seatKey, false)?.away ?? false;
  }

  /** Seats without a connection for at least the free-seat period. */
  expiredSeats(roomId: string): string[] {
    const cutoff = Date.now() - this.freeSeatAfterMs;
    return [...(this.rooms.get(roomId) ?? [])]
      .filter(([, seat]) => seat.disconnectedAt !== undefined && seat.disconnectedAt <= cutoff)
      .map(([seatKey]) => seatKey);
  }

  socketCount(roomId: string, seatKey: string): number {
    return this.seat(roomId, seatKey, false)?.sockets.size ?? 0;
  }

  forgetSeat(roomId: string, seatKey: string): void {
    const seats = this.rooms.get(roomId);
    const seat = seats?.get(seatKey);
    if (!seats || !seat) return;
    this.clearTimers(seat);
    seats.delete(seatKey);
    if (seats.size === 0) this.rooms.delete(roomId);
  }

  forgetRoom(roomId: string): void {
    for (const seat of this.rooms.get(roomId)?.values() ?? []) this.clearTimers(seat);
    this.rooms.delete(roomId);
  }

  /** Number of tracked seats (for leak tests). */
  size(): number {
    let n = 0;
    for (const seats of this.rooms.values()) n += seats.size;
    return n;
  }

  stop(): void {
    for (const roomId of [...this.rooms.keys()]) this.forgetRoom(roomId);
  }

  private seat(roomId: string, seatKey: string, create: true): SeatPresence;
  private seat(roomId: string, seatKey: string, create: false): SeatPresence | undefined;
  private seat(roomId: string, seatKey: string, create: boolean): SeatPresence | undefined {
    let seats = this.rooms.get(roomId);
    if (!seats) {
      if (!create) return undefined;
      seats = new Map();
      this.rooms.set(roomId, seats);
    }
    let seat = seats.get(seatKey);
    if (!seat && create) {
      seat = { sockets: new Set(), away: false };
      seats.set(seatKey, seat);
    }
    return seat;
  }

  private startTimers(roomId: string, seatKey: string, seat: SeatPresence) {
    this.clearTimers(seat);
    seat.disconnectedAt = Date.now();
    const startupLeft = this.startedAt + this.startupGraceMs - Date.now();
    const grace = Math.max(this.graceMs, startupLeft);
    seat.awayTimer = unref(
      setTimeout(() => {
        seat.away = true;
        this.onChange({ roomId, seatKey, kind: 'away' });
      }, grace),
    );
    seat.expireTimer = unref(
      setTimeout(
        () => this.onChange({ roomId, seatKey, kind: 'expired' }),
        Math.max(this.freeSeatAfterMs, grace),
      ),
    );
  }

  private clearTimers(seat: SeatPresence) {
    clearTimeout(seat.awayTimer);
    clearTimeout(seat.expireTimer);
    seat.awayTimer = seat.expireTimer = undefined;
  }
}

/** Presence timers must never keep the process alive on shutdown. */
const unref = (timer: ReturnType<typeof setTimeout>) => {
  timer.unref?.();
  return timer;
};
