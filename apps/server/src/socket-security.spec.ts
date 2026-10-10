import type { Server } from 'boardgame.io';
import { describe, expect, it } from 'vitest';
import { isSeatOwner } from './socket-security';

const metadata = {
  gameName: 'tictactoe',
  players: { 0: { id: 0, name: 'Alice', credentials: 'alice-secret' }, 1: { id: 1 } },
  createdAt: 0,
  updatedAt: 0,
} as Server.MatchData;

describe('isSeatOwner', () => {
  it('accepts the credentials of a claimed seat', () => {
    expect(isSeatOwner(metadata, '0', 'alice-secret')).toBe(true);
  });

  it.each([
    ['wrong credentials', metadata, '0', 'alice-secreT'],
    ['prefix of the credentials', metadata, '0', 'alice'],
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
