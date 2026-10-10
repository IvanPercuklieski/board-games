import type { LogEntry, Server, State, StorageAPI } from 'boardgame.io';
import { Async } from 'boardgame.io/internal';
import type postgres from 'postgres';
import type { Sql, Tx } from '../db';
import {
  keepStoredIdentity,
  playerForSeat,
  type GameStorage,
  type MatchSeat,
} from './game-storage';

type Json = postgres.JSONValue;

/**
 * Gives/frees a seat in `bgio.matches` metadata. Runs inside a transaction so the rooms
 * repository can do it atomically together with `room_seats` changes.
 */
export async function setPlayerSeatInDb(
  sql: Tx,
  matchID: string,
  playerID: number,
  seat: MatchSeat | undefined,
): Promise<boolean> {
  const [row] = await sql<{ metadata: Server.MatchData }[]>`
    select metadata from bgio.matches where match_id = ${matchID} for update`;
  const current = row?.metadata.players[playerID];
  if (!row || !current) return false;
  const metadata = {
    ...row.metadata,
    players: { ...row.metadata.players, [playerID]: playerForSeat(current, seat) },
  };
  await sql`
    update bgio.matches set metadata = ${sql.json(metadata as unknown as Json)}, updated_at = now()
    where match_id = ${matchID}`;
  return true;
}

/** Inserts a new match. Runs inside a transaction so rooms can be started atomically. */
export async function insertMatchInDb(
  sql: Tx,
  matchID: string,
  { initialState, metadata }: StorageAPI.CreateMatchOpts,
): Promise<void> {
  const json = (value: unknown) => sql.json(value as Json);
  await sql`
    insert into bgio.matches (match_id, game_name, state, initial_state, metadata, log)
    values (
      ${matchID}, ${metadata.gameName}, ${json(initialState)}, ${json(initialState)},
      ${json(metadata)}, '[]'::jsonb
    )`;
}

/**
 * boardgame.io storage backed by the private `bgio.matches` table in Supabase Postgres.
 * Uses the server's shared connection pool (the owner ends it).
 *
 * close() waits for in-flight queries; calls made after close() (e.g. boardgame.io's
 * disconnect handlers during shutdown) are ignored instead of failing, so they can't
 * become unhandled rejections that crash the process.
 */
export class PostgresStorage extends Async implements GameStorage {
  private closed = false;
  private readonly pending = new Set<Promise<unknown>>();

  constructor(private readonly sql: Sql) {
    super();
  }

  async connect() {
    await this.sql`select 1`;
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    await Promise.allSettled([...this.pending]);
  }

  private run<T>(afterClose: () => T, task: () => Promise<T>): Promise<T> {
    if (this.closed) return Promise.resolve().then(afterClose);
    const promise = task();
    this.pending.add(promise);
    promise.then(
      () => this.pending.delete(promise),
      () => this.pending.delete(promise),
    );
    return promise;
  }

  private ignoredAfterClose = () => undefined;

  override createMatch(matchID: string, opts: StorageAPI.CreateMatchOpts) {
    const failAfterClose = () => {
      throw new Error('Storage is closed');
    };
    return this.run(failAfterClose, () =>
      this.sql.begin((tx) => insertMatchInDb(tx, matchID, opts)),
    );
  }

  setState(matchID: string, state: State, deltalog?: LogEntry[]) {
    return this.run(this.ignoredAfterClose, async () => {
      if (deltalog?.length) {
        await this.sql`
        update bgio.matches
        set state = ${this.json(state)}, log = log || ${this.json(deltalog)}, updated_at = now()
        where match_id = ${matchID}`;
      } else {
        await this.sql`
        update bgio.matches set state = ${this.json(state)}, updated_at = now()
        where match_id = ${matchID}`;
      }
    });
  }

  /** boardgame.io's metadata writes; player identity stays as stored (see GameStorage). */
  setMetadata(matchID: string, metadata: Server.MatchData) {
    return this.run(this.ignoredAfterClose, () =>
      this.sql.begin(async (tx) => {
        const [row] = await tx<{ metadata: Server.MatchData }[]>`
          select metadata from bgio.matches where match_id = ${matchID} for update`;
        if (!row) return;
        const merged = {
          ...metadata,
          players: keepStoredIdentity(metadata.players, row.metadata.players),
        };
        await tx`
          update bgio.matches set metadata = ${tx.json(merged as unknown as Json)}, updated_at = now()
          where match_id = ${matchID}`;
      }),
    );
  }

  setPlayerSeat(matchID: string, playerID: number, seat: MatchSeat | undefined) {
    return this.run(
      () => false,
      () => this.sql.begin((tx) => setPlayerSeatInDb(tx, matchID, playerID, seat)),
    );
  }

  fetch<O extends StorageAPI.FetchOpts>(matchID: string, opts: O) {
    const empty = () => ({}) as StorageAPI.FetchResult<O>;
    return this.run(empty, async () => {
      const [row] = await this.sql<
        { state: State; initial_state: State; metadata: Server.MatchData; log: LogEntry[] }[]
      >`
      select state, initial_state, metadata, log from bgio.matches where match_id = ${matchID}`;
      const result: Partial<StorageAPI.FetchFields> = {};
      if (row) {
        if (opts.state) result.state = row.state;
        if (opts.initialState) result.initialState = row.initial_state;
        if (opts.metadata) result.metadata = row.metadata;
        if (opts.log) result.log = row.log;
      }
      return result as StorageAPI.FetchResult<O>;
    });
  }

  wipe(matchID: string) {
    return this.run(this.ignoredAfterClose, async () => {
      await this.sql`delete from bgio.matches where match_id = ${matchID}`;
    });
  }

  override listMatches(opts: StorageAPI.ListMatchesOpts = {}) {
    return this.run(
      (): string[] => [],
      async () => {
        const { gameName, where = {} } = opts;
        const sql = this.sql;
        const updatedAt = sql`(metadata ->> 'updatedAt')::bigint`;
        const rows = await sql<{ match_id: string }[]>`
      select match_id from bgio.matches
      where true
        ${gameName !== undefined ? sql`and game_name = ${gameName}` : sql``}
        ${
          where.isGameover === undefined
            ? sql``
            : where.isGameover
              ? sql`and metadata ? 'gameover'`
              : sql`and not (metadata ? 'gameover')`
        }
        ${where.updatedBefore !== undefined ? sql`and ${updatedAt} < ${where.updatedBefore}` : sql``}
        ${where.updatedAfter !== undefined ? sql`and ${updatedAt} > ${where.updatedAfter}` : sql``}`;
        return rows.map((r) => r.match_id);
      },
    );
  }

  private json(value: unknown) {
    return this.sql.json(value as Json);
  }
}
