import { roomIdSchema, secretSchema } from '@board-table/shared';
import { describe, expect, it } from 'vitest';
import { hashSecret, newRoomId, newSecret } from './secrets';

describe('secrets', () => {
  it('creates room ids that match the shared room id format', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newRoomId()));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(roomIdSchema.safeParse(id).success).toBe(true);
  });

  it('creates secrets that match the shared secret format', () => {
    const secrets = new Set(Array.from({ length: 50 }, () => newSecret()));
    expect(secrets.size).toBe(50);
    for (const s of secrets) expect(secretSchema.safeParse(s).success).toBe(true);
  });

  it('hashes secrets with SHA-256 (hex), deterministically', () => {
    const secret = newSecret();
    expect(hashSecret(secret)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSecret(secret)).toBe(hashSecret(secret));
    expect(hashSecret(secret)).not.toBe(hashSecret(newSecret()));
    expect(hashSecret('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
