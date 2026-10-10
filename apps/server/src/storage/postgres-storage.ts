import type { LogEntry, Server, State, StorageAPI } from 'boardgame.io';
import { Async } from 'boardgame.io/internal';
import postgres from 'postgres';

type Json = postgres.JSONValue;

/**
 * boardgame.io storage backed by the private `bgio.matches` table in Supabase Postgres.
 *
 * close() waits for in-flight queries; calls made after close() (e.g. boardgame.io's
 * disconnect handlers during shutdown) are ignored instead of failing, so they can't
 * become unhandled rejections that crash the process.
 */
export class PostgresStorage extends Async {
  private readonly sql: postgres.Sql;
  private closed = false;
  private readonly pending = new Set<Promise<unknown>>();

  constructor(databaseUrl: string) {
    super();
    this.sql = postgres(databaseUrl, { max: 5, idle_timeout: 30, onnotice: () => {} });
  }

  async connect() {
    await this.sql`select 1`;
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    await Promise.allSettled([...this.pending]);
    await this.sql.end({ timeout: 5 });
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

  override createMatch(matchID: string, { initialState, metadata }: StorageAPI.CreateMatchOpts) {
    const failAfterClose = () => {
      throw new Error('Storage is closed');
    };
    return this.run(failAfterClose, async () => {
      await this.sql`
      insert into bgio.matches (match_id, game_name, state, initial_state, metadata, log)
      values (
        ${matchID}, ${metadata.gameName}, ${this.json(initialState)}, ${this.json(initialState)},
        ${this.json(metadata)}, '[]'::jsonb
      )`;
    });
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

  setMetadata(matchID: string, metadata: Server.MatchData) {
    return this.run(this.ignoredAfterClose, async () => {
      await this.sql`
        update bgio.matches set metadata = ${this.json(metadata)}, updated_at = now()
        where match_id = ${matchID}`;
    });
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
