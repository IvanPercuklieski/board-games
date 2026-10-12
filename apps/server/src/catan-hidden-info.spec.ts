import { settlementSpots, type CatanState } from '@board-table/games';
import type { State } from 'boardgame.io';
import { afterEach, describe, expect, it } from 'vitest';
import type { RunningApp } from './app';
import { startTestApp } from './testing/app';
import { createSeatedMatch } from './testing/matches';
import { connectPlayer, rawSocket, sleep, waitForState } from './testing/players';

let running: RunningApp | undefined;
const closers: { close(): void }[] = [];
afterEach(async () => {
  for (const c of closers.splice(0)) c.close();
  await running?.stop();
  running = undefined;
});

/**
 * Catan hides other players' hands and the development deck (`playerView`). Check what a
 * browser actually receives: the sync answer, the post-sync resend (socket-transport.ts) and
 * the broadcast after someone else's move.
 */
describe('Catan hidden information over the wire', () => {
  it('never sends a player the deck or another player’s cards', async () => {
    const t = await startTestApp();
    running = t.app;
    const { matchID, seats } = await createSeatedMatch(t.storage, ['Ana', 'Ben', 'Cy'], 'catan');

    // Mark the secrets so they are easy to spot: Ben and Cy hold cards, the deck is known.
    const { state } = await t.storage.fetch(matchID, { state: true });
    const G = structuredClone(state!.G) as CatanState;
    G.hands['1']!.resources.ore = 7;
    G.hands['1']!.cards = ['landmark'];
    G.hands['2']!.newCards = ['market'];
    G.secret.devDeck = ['windfall', 'roadCrew'];
    await t.storage.setState(matchID, { ...state!, G } as State);

    // Seat 0 as a raw socket that records every packet.
    const packets: { event: string; json: string }[] = [];
    const ana = rawSocket(t.url, 'catan');
    closers.push(ana.socket);
    ana.socket.onAny((event: string, ...args: unknown[]) =>
      packets.push({ event, json: JSON.stringify(args) }),
    );
    await ana.connected;
    ana.socket.emit('sync', matchID, '0', seats[0]!.credentials, 3);

    // Whoever starts places a settlement, so seat 0 receives a broadcast.
    const current = state!.ctx.currentPlayer;
    const mover = connectPlayer(t.url, matchID, seats[Number(current)]!, 'catan');
    closers.push({ close: () => mover.stop() });
    await waitForState(mover, (s) => s.isConnected && s.ctx.currentPlayer === current);
    mover.moves['placeSettlement']!(settlementSpots(G, current, false)[0]);
    await waitForState(mover, (s) => (s.G as CatanState).setupSettlement !== null);
    await sleep(200);

    expect(packets.map((p) => p.event)).toEqual(expect.arrayContaining(['sync', 'update']));
    for (const { event, json } of packets) {
      // the cards above, and the random seed or generator state (future dice and steals)
      for (const secret of [
        'landmark',
        'market',
        'windfall',
        'roadCrew',
        '"ore":7',
        'seed',
        'prngstate',
      ]) {
        expect(json, `${event} leaks ${secret}`).not.toContain(secret);
      }
    }
    const updates = packets.filter((p) => p.event === 'update');
    expect(updates.length).toBeGreaterThanOrEqual(2); // the resend and the broadcast
    for (const { json } of updates) {
      expect(json).toContain('"deckSize":2');
      expect(json).toContain('"1":{"resources":7,"cards":1}');
    }
  });
});
