import type { LogEntry, Server, State, StorageAPI } from 'boardgame.io';
import { Async } from 'boardgame.io/internal';
import type { GameStorage, MatchSeat } from '../storage/game-storage';
import type { RoomsRepository } from './rooms-repository';
import { SeatEvents } from './seat-events';

const HOUR = 3_600_000;

type Log = (...args: unknown[]) => void;

/**
 * Room cleanup (CLAUDE.md "Data retention"):
 * - every move updates the room's last activity,
 * - a finished game deletes its match right away (players keep the final board in their
 *   browser) and its sockets are disconnected; the room, seats and invite link stay, so the
 *   same table can play again,
 * - every 15 min, waiting rooms idle for 1 h and games in progress idle for 48 h are deleted.
 *
 * Moves and game over are observed by wrapping the storage boardgame.io writes through, so
 * no boardgame.io internals are touched.
 */
export class RoomLifecycle {
  private readonly repo: RoomsRepository;
  private readonly seatEvents: SeatEvents;
  private readonly now: () => number;
  private readonly log: Log;
  private readonly waitingIdleMs: number;
  private readonly playingIdleMs: number;
  private readonly sweepIntervalMs: number;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor({
    repo,
    seatEvents = new SeatEvents(),
    now = Date.now,
    log = console.error,
    waitingIdleMs = HOUR,
    playingIdleMs = 48 * HOUR,
    sweepIntervalMs = HOUR / 4,
  }: {
    repo: RoomsRepository;
    seatEvents?: SeatEvents;
    now?: () => number;
    log?: Log;
    waitingIdleMs?: number;
    playingIdleMs?: number;
    sweepIntervalMs?: number;
  }) {
    this.repo = repo;
    this.seatEvents = seatEvents;
    this.now = now;
    this.log = log;
    this.waitingIdleMs = waitingIdleMs;
    this.playingIdleMs = playingIdleMs;
    this.sweepIntervalMs = sweepIntervalMs;
  }

  /** The storage to hand to boardgame.io. */
  wrap(storage: GameStorage): GameStorage {
    return new ObservedStorage(storage, {
      onMove: (matchID) => this.guard('touch', () => this.repo.touch(matchID)),
      onGameOver: (matchID) => this.guard('game-over cleanup', () => this.finishGame(matchID)),
    });
  }

  /** Deletes idle rooms (with seats and match), by their status's limit. Returns how many. */
  async sweepStale(): Promise<number> {
    let deleted = 0;
    await this.guard('stale sweep', async () => {
      const ids = await this.repo.listStaleRoomIds({
        waitingBefore: new Date(this.now() - this.waitingIdleMs),
        playingBefore: new Date(this.now() - this.playingIdleMs),
      });
      for (const id of ids) {
        await this.repo.deleteRoom(id);
        this.seatEvents.roomClosed(id);
        deleted++;
      }
    });
    return deleted;
  }

  start() {
    this.stop();
    this.timer = setInterval(() => void this.sweepStale(), this.sweepIntervalMs);
    this.timer.unref(); // never keeps the process alive on its own
  }

  stop() {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  private async finishGame(matchID: string) {
    await this.repo.finishGame(matchID);
    this.seatEvents.matchEnded(matchID);
    this.seatEvents.roomChanged(matchID); // the room is waiting again
  }

  /** Cleanup must never break gameplay or crash the server: failures are logged. */
  private async guard(what: string, task: () => Promise<unknown>) {
    try {
      await task();
    } catch (e) {
      this.log(`Room ${what} failed:`, e instanceof Error ? e.message : e);
    }
  }
}

/** Delegates to the real storage and reports moves and game over (room id = match id). */
class ObservedStorage extends Async implements GameStorage {
  constructor(
    private readonly inner: GameStorage,
    private readonly hooks: {
      onMove(matchID: string): Promise<void>;
      onGameOver(matchID: string): Promise<void>;
    },
  ) {
    super();
  }

  connect() {
    return this.inner.connect();
  }

  override createMatch(matchID: string, opts: StorageAPI.CreateMatchOpts) {
    return this.inner.createMatch(matchID, opts);
  }

  async setState(matchID: string, state: State, deltalog?: LogEntry[]) {
    await this.inner.setState(matchID, state, deltalog);
    await this.hooks.onMove(matchID);
  }

  async setMetadata(matchID: string, metadata: Server.MatchData) {
    await this.inner.setMetadata(matchID, metadata);
    if (metadata.gameover !== undefined) await this.hooks.onGameOver(matchID);
  }

  fetch<O extends StorageAPI.FetchOpts>(matchID: string, opts: O) {
    return this.inner.fetch(matchID, opts);
  }

  wipe(matchID: string) {
    return this.inner.wipe(matchID);
  }

  override listMatches(opts?: StorageAPI.ListMatchesOpts) {
    return this.inner.listMatches(opts);
  }

  setPlayerSeat(matchID: string, playerID: number, seat: MatchSeat | undefined) {
    return this.inner.setPlayerSeat(matchID, playerID, seat);
  }
}
