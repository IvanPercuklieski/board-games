import type { Server } from 'boardgame.io';
import { describe, expect, it } from 'vitest';
import { hashSecret } from './secrets';
import { chatRateLimiter, isChatMessage, isSeatOwner } from './socket-security';

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

describe('isChatMessage', () => {
  const ok = { id: 'abc', sender: '1', payload: 'Anyone have ore?' };

  it('accepts a short text message from the socket’s own seat', () => {
    expect(isChatMessage(ok, '1')).toBe(true);
    expect(isChatMessage({ ...ok, payload: 'x'.repeat(200) }, '1')).toBe(true);
  });

  it.each([
    ['another seat', ok, '0'],
    ['an empty message', { ...ok, payload: '   ' }, '1'],
    ['a message over 200 characters', { ...ok, payload: 'x'.repeat(201) }, '1'],
    ['a non-text payload', { ...ok, payload: { html: '<b>' } }, '1'],
    ['extra fields', { ...ok, padding: 'x'.repeat(10_000) }, '1'],
    ['a missing or long id', { ...ok, id: 'x'.repeat(65) }, '1'],
    ['not an object', 'hi', '1'],
  ])('rejects %s', (_case, message, seat) => {
    expect(isChatMessage(message, seat)).toBe(false);
  });
});

describe('chatRateLimiter', () => {
  it('allows 5 messages per 10 seconds', () => {
    let now = 0;
    const allow = chatRateLimiter(() => now);
    expect([1, 2, 3, 4, 5, 6].map(() => allow())).toEqual([true, true, true, true, true, false]);
    now = 9_999;
    expect(allow()).toBe(false);
    now = 10_001;
    expect(allow()).toBe(true);
  });
});
