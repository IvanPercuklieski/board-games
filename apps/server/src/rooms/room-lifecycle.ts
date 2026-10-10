import type { LogEntry, Server, State, StorageAPI } from 'boardgame.io';
import { Async } from 'boardgame.io/internal';
import type { GameStorage, MatchSeat } from '../storage/game-storage';
import type { RoomsRepository } from './rooms-repository';

const HOUR = 3_600_000;

type Log = (...args: unknown[]) => void;

/**
 * Room cleanup (CLAUDE.md "Data retention"):
 * - every move updates the room's last activity,
 * - a finished game deletes its room, seats and match right away (players keep the final
 *   board in their browser),
 * - rooms without activity for 48 h are swept every 15 min.
 *
 * Moves and game over are observed by wrapping the storage boardgame.io writes through, so
 * no boardgame.io internals are touched.
 */
export class RoomLifecycle {
  private readonly repo: RoomsRepository;
  private readonly now: () => number;
  private readonly log: Log;
  private readonly staleAfterMs: number;
  private readonly sweepIntervalMs: number;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor({
    repo,
    now = Date.now,
    log = console.error,
    staleAfterMs = 48 * HOUR,
    sweepIntervalMs = HOUR / 4,
  }: {
    repo: RoomsRepository;
    now?: () => number;
    log?: Log;
    staleAfterMs?: number;
    sweepIntervalMs?: number;
  }) {
    this.repo = repo;
    this.now = now;
    this.log = log;
    this.staleAfterMs = staleAfterMs;
    this.sweepIntervalMs = sweepIntervalMs;
  }

  /** The storage to hand to boardgame.io. */
  wrap(storage: GameStorage): GameStorage {
    return new ObservedStorage(storage, {
      onMove: (matchID) => this.guard('touch', () => this.repo.touch(matchID)),
      onGameOver: (matchID) => this.guard('game-over cleanup', () => this.repo.deleteRoom(matchID)),
    });
  }

  /** Deletes rooms (with seats and match) inactive for `staleAfterMs`. Returns how many. */
  async sweepStale(): Promise<number> {
    let deleted = 0;
    await this.guard('stale sweep', async () => {
      const ids = await this.repo.listRoomIdsInactiveSince(
        new Date(this.now() - this.staleAfterMs),
      );
      for (const id of ids) {
        await this.repo.deleteRoom(id);
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
