import type { Server } from 'boardgame.io';
import { afterAll, describe, expect, it } from 'vitest';
import { createSql } from '../db';
import { devDatabaseUrl } from '../testing/dev-env';
import { PostgresStorage } from './postgres-storage';
import { describeStorageContract } from './storage-contract';

const sql = createSql(devDatabaseUrl());
const db = new PostgresStorage(sql);
afterAll(async () => {
  await db.close();
  await sql.end();
});

describeStorageContract('PostgresStorage (board-games-dev)', async () => ({
  db,
  cleanup: async (ids) => {
    for (const id of ids) await db.wipe(id);
  },
}));

describe('PostgresStorage shutdown', () => {
  const metadata = {
    gameName: 'tictactoe',
    players: { 0: { id: 0 }, 1: { id: 1 } },
    createdAt: 1,
    updatedAt: 1,
  } as Server.MatchData;
  const state = { G: {}, ctx: {}, _stateID: 0, plugins: {} } as never;

  it('finishes in-flight writes before closing and ignores calls after closing', async () => {
    const matchID = `test-shutdown-${Date.now().toString(36)}`;
    try {
      const storage = new PostgresStorage(sql);
      await storage.createMatch(matchID, { initialState: state, metadata });
      const inFlight = storage.setMetadata(matchID, { ...metadata, updatedAt: 2 });
      await storage.close();
      await expect(inFlight).resolves.toBeUndefined();
      // Late calls (e.g. boardgame.io disconnect handlers) must not throw after close.
      await expect(
        storage.setMetadata(matchID, { ...metadata, updatedAt: 3 }),
      ).resolves.toBeUndefined();
      await expect(storage.fetch(matchID, { metadata: true })).resolves.toEqual({});
      const { metadata: stored } = await db.fetch(matchID, { metadata: true });
      expect(stored.updatedAt).toBe(2);
    } finally {
      await db.wipe(matchID);
    }
  });
});
