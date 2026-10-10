import { createApp, type RunningApp } from '../app';
import type { ServerConfig } from '../config';
import { createTestAuth, TEST_SUPABASE_URL } from './auth';
import { MemoryRoomsRepository } from './memory-rooms-repository';
import { MemoryStorage } from './memory-storage';

export const TEST_ORIGIN = 'http://localhost:4200';

export function testConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    port: 0,
    publicOrigin: TEST_ORIGIN,
    databaseUrl: 'unused',
    supabaseUrl: TEST_SUPABASE_URL,
    supabaseAnonKey: 'test-anon-key',
    trustProxy: false,
    webDistDir: undefined,
    ...overrides,
  };
}

/** Starts the real app with in-memory storage/repository and a local test login key. */
export async function startTestApp(overrides: Partial<ServerConfig> = {}) {
  const storage = new MemoryStorage();
  const repo = new MemoryRoomsRepository(storage);
  const auth = await createTestAuth();
  const app: RunningApp = await createApp({
    config: testConfig(overrides),
    deps: { storage, repo, verifier: auth.verifier },
  }).start();
  return { app, url: app.url, storage, repo, tokenFor: auth.tokenFor };
}
