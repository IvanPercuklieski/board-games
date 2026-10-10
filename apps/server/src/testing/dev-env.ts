import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

/** Reads a variable of board-games-dev only from the repo's .env.dev (never the shell env). */
function devEnv(name: string): string {
  const file = resolve(import.meta.dirname, '../../../../.env.dev');
  const value = parseEnv(readFileSync(file, 'utf8'))[name];
  if (!value || value.includes('your-project')) {
    throw new Error(`${name} is missing or still the placeholder in .env.dev.`);
  }
  return value;
}

export const devDatabaseUrl = () => devEnv('DATABASE_URL');
export const devSupabaseUrl = () => devEnv('SUPABASE_URL');
