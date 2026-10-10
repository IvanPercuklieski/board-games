import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

/** DATABASE_URL of board-games-dev, read only from the repo's .env.dev (never the shell env). */
export function devDatabaseUrl(): string {
  const file = resolve(import.meta.dirname, '../../../../.env.dev');
  const url = parseEnv(readFileSync(file, 'utf8'))['DATABASE_URL'];
  if (!url)
    throw new Error('DATABASE_URL missing in .env.dev (integration tests need the dev DB).');
  return url;
}
