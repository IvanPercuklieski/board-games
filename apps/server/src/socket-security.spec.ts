import type { Server } from 'boardgame.io';
import { describe, expect, it } from 'vitest';
import { hashSecret } from './secrets';
import { isSeatOwner } from './socket-security';

// boardgame.io metadata stores only the SHA-256 hash of each seat's secret.
const metadata = {
  gameName: 'tictactoe',
  players: { 0: { id: 0, name: 'Alice', credentials: hashSecret('alice-secret') }, 1: { id: 1 } },
  createdAt: 0,
  updatedAt: 0,
} as Server.MatchData;

describe('isSeatOwner', () => {
  it('accepts the secret of a claimed seat', () => {
    expect(isSeatOwner(metadata, '0', 'alice-secret')).toBe(true);
  });

  it.each([
    ['wrong credentials', metadata, '0', 'alice-secreT'],
    ['prefix of the credentials', metadata, '0', 'alice'],
    [
      'the stored hash itself (a leaked DB row is not a key)',
      metadata,
      '0',
      hashSecret('alice-secret'),
    ],
    ['missing credentials', metadata, '0', undefined],
    ['unclaimed seat', metadata, '1', ''],
    ['unclaimed seat with any value', metadata, '1', 'anything'],
    ['unknown seat', metadata, '7', 'alice-secret'],
    ['non-string playerID', metadata, 0, 'alice-secret'],
    ['unknown match', undefined, '0', 'alice-secret'],
  ])('rejects %s', (_case, meta, playerID, credentials) => {
    expect(isSeatOwner(meta, playerID, credentials)).toBe(false);
  });
});
