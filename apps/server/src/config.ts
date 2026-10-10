import { z } from 'zod';

export interface ServerConfig {
  port: number;
  /** Origin the web app is served from; the only origin allowed for websockets/CORS. */
  publicOrigin: string;
  databaseUrl: string;
  /** Supabase project URL; its public signing keys are used to verify login tokens. */
  supabaseUrl: string;
  /** Folder with the built Angular app. When unset, the server only serves the API/websockets. */
  webDistDir: string | undefined;
}

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  PUBLIC_ORIGIN: z.url().transform((url) => url.replace(/\/+$/, '')),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'must be a postgres:// connection string'),
  SUPABASE_URL: z.url({ protocol: /^https$/ }).transform((url) => new URL(url).origin),
  WEB_DIST_DIR: z.string().min(1).optional(),
});

/** Validates the environment. Error messages name the variables but never include their values. */
export function loadConfig(env: Record<string, string | undefined>): ServerConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid server environment:\n  ${problems.join('\n  ')}`);
  }
  const e = result.data;
  return {
    port: e.PORT,
    publicOrigin: e.PUBLIC_ORIGIN,
    databaseUrl: e.DATABASE_URL,
    supabaseUrl: e.SUPABASE_URL,
    webDistDir: e.WEB_DIST_DIR,
  };
}
