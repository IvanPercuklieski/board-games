import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { claimSeat, createMatch } from './matches';
import { PostgresStorage } from './storage/postgres-storage';
import { devDatabaseUrl } from './testing/dev-env';
import { connectPlayer, eventually, playMove, waitForState } from './testing/players';

const config = {
  port: 0,
  publicOrigin: 'http://localhost:4200',
  databaseUrl: devDatabaseUrl(),
  webDistDir: undefined,
};

const matchIDs: string[] = [];
afterAll(async () => {
  const db = new PostgresStorage(config.databaseUrl);
  for (const id of matchIDs) await db.wipe(id);
  await db.close();
});

describe('server with Postgres storage (board-games-dev)', () => {
  it('keeps a game in the database across a server restart', async () => {
    // First server: create a match, seat two players, play two moves.
    const first = await createApp({ config }).start();
    const matchID = await createMatch(first.db, 'tictactoe');
    matchIDs.push(matchID);
    const aliceSeat = await claimSeat(first.db, matchID, 'Alice');
    const bobSeat = await claimSeat(first.db, matchID, 'Bob');

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
