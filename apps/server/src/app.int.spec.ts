import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { createSql } from './db';
import { PostgresStorage } from './storage/postgres-storage';
import { devDatabaseUrl } from './testing/dev-env';
import { createSeatedMatch } from './testing/matches';
import { connectPlayer, eventually, playMove, waitForState } from './testing/players';

const config = {
  port: 0,
  publicOrigin: 'http://localhost:4200',
  databaseUrl: devDatabaseUrl(),
  supabaseUrl: 'https://abc.supabase.co',
  webDistDir: undefined,
};

const matchIDs: string[] = [];
afterAll(async () => {
  const sql = createSql(config.databaseUrl);
  const db = new PostgresStorage(sql);
  for (const id of matchIDs) await db.wipe(id);
  await sql.end();
});

describe('server with Postgres storage (board-games-dev)', () => {
  it('keeps a game in the database across a server restart', async () => {
    // First server: create a match, seat two players, play two moves.
    const first = await createApp({ config }).start();
    const { matchID, seats } = await createSeatedMatch(first.db, ['Alice', 'Bob']);
    matchIDs.push(matchID);
    const aliceSeat = seats[0]!;
    const bobSeat = seats[1]!;

    const alice = connectPlayer(first.url, matchID, aliceSeat);
    const bob = connectPlayer(first.url, matchID, bobSeat);
    await playMove(alice, 4);
    await playMove(bob, 0);
    alice.stop();
    bob.stop();
    await first.stop();

    // Second server, fresh process state: the game continues where it left off.
    const second = await createApp({ config }).start();
    const aliceAgain = connectPlayer(second.url, matchID, aliceSeat);
    try {
      const resumed = await waitForState(aliceAgain, (s) => s.isConnected && s.G.cells[4] === '0');
      expect(resumed.G.cells[0]).toBe('1');
      expect(resumed.ctx.currentPlayer).toBe('0');

      await playMove(aliceAgain, 8);
      await eventually(async () => {
        const stored = await second.db.fetch(matchID, { state: true });
        expect(stored.state.G.cells[8]).toBe('0');
      });
    } finally {
      aliceAgain.stop();
      await second.stop();
    }
  });
});
