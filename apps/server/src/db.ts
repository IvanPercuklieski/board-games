import postgres from 'postgres';

export type Sql = postgres.Sql;

/** One connection pool per server process, shared by game storage and the rooms repository. */
export function createSql(databaseUrl: string): Sql {
  return postgres(databaseUrl, { max: 5, idle_timeout: 30, onnotice: () => {} });
}

/** A connection inside `sql.begin(...)`; helpers that must run atomically take this. */
export type Tx = postgres.TransactionSql;
