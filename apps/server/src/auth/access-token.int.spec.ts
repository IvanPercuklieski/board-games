import { describe, expect, it } from 'vitest';
import { devSupabaseUrl } from '../testing/dev-env';
import { supabaseJwksUrl } from './access-token';

describe('board-games-dev JWT signing keys', () => {
  it('publishes asymmetric signing keys the server can verify against', async () => {
    const res = await fetch(supabaseJwksUrl(devSupabaseUrl()));
    expect(res.status).toBe(200);
    const { keys } = (await res.json()) as { keys: { kty: string; alg?: string }[] };
    // Empty means the project still uses the legacy shared (HS256) secret: switch it to
    // asymmetric JWT signing keys in the dashboard (Project Settings -> JWT Keys).
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(['EC', 'RSA', 'OKP']).toContain(key.kty);
  });
});
