import type { LogEntry, Server, State } from 'boardgame.io';
import { Async } from 'boardgame.io/internal';
import type { StorageAPI } from 'boardgame.io';
import {
  keepStoredIdentity,
  playerForSeat,
  type GameStorage,
  type MatchSeat,
} from '../storage/game-storage';

interface Row {
  state: State;
  initialState: State;
  metadata: Server.MatchData;
  log: LogEntry[];
}

/** In-memory storage for unit tests. Same contract as PostgresStorage (see storage-contract.ts). */
export class MemoryStorage extends Async implements GameStorage {
  private readonly rows = new Map<string, Row>();
  /** Number of fetch() calls, so tests can check that dropped messages never reach storage. */
  fetchCount = 0;

  connect() {
    return Promise.resolve();
  }

  override async createMatch(
    matchID: string,
    { initialState, metadata }: StorageAPI.CreateMatchOpts,
  ) {
    this.rows.set(matchID, clone({ state: initialState, initialState, metadata, log: [] }));
  }

  async setState(matchID: string, state: State, deltalog?: LogEntry[]) {
    const row = this.rows.get(matchID);
    if (!row) return;
    row.state = clone(state);
    if (deltalog?.length) row.log.push(...clone(deltalog));
  }

  async setMetadata(matchID: string, metadata: Server.MatchData) {
    const row = this.rows.get(matchID);
    if (!row) return;
    const incoming = clone(metadata);
    row.metadata = {
      ...incoming,
      players: keepStoredIdentity(incoming.players, row.metadata.players),
    };
  }

  async setPlayerSeat(matchID: string, playerID: number, seat: MatchSeat | undefined) {
    const current = this.rows.get(matchID)?.metadata.players[playerID];
    if (!current) return false;
    this.rows.get(matchID)!.metadata.players[playerID] = playerForSeat(
      current,
      seat && clone(seat),
    );
    return true;
  }

  async fetch<O extends StorageAPI.FetchOpts>(matchID: string, opts: O) {
    this.fetchCount++;
    const row = this.rows.get(matchID);
    const result: Partial<StorageAPI.FetchFields> = {};
    if (row) {
      if (opts.state) result.state = clone(row.state);
      if (opts.initialState) result.initialState = clone(row.initialState);
      if (opts.metadata) result.metadata = clone(row.metadata);
      if (opts.log) result.log = clone(row.log);
    }
    return result as StorageAPI.FetchResult<O>;
  }

  async wipe(matchID: string) {
    this.rows.delete(matchID);
  }

  override async listMatches(opts: StorageAPI.ListMatchesOpts = {}) {
    const { gameName, where = {} } = opts;
    return [...this.rows.entries()]
      .filter(([, { metadata: m }]) => {
        if (gameName !== undefined && m.gameName !== gameName) return false;
        if (where.isGameover !== undefined && (m.gameover !== undefined) !== where.isGameover)
          return false;
        if (where.updatedBefore !== undefined && !(m.updatedAt < where.updatedBefore)) return false;
        if (where.updatedAfter !== undefined && !(m.updatedAt > where.updatedAfter)) return false;
        return true;
      })
      .map(([id]) => id);
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
