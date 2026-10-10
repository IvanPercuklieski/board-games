import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp, type RunningApp } from './app';
import { claimSeat, createMatch } from './matches';
import { MemoryStorage } from './testing/memory-storage';
import {
  connectPlayer,
  eventually,
  makeMoveAction,
  playMove,
  rawSocket,
  sleep,
  waitForState,
} from './testing/players';

const ORIGIN = 'http://localhost:4200';

let running: RunningApp | undefined;
afterEach(async () => {
  await running?.stop();
  running = undefined;
});

async function start(opts: { webDistDir?: string } = {}) {
  const db = new MemoryStorage();
  running = await createApp({
    config: {
      port: 0,
      publicOrigin: ORIGIN,
      databaseUrl: 'unused',
      supabaseUrl: 'https://abc.supabase.co',
      webDistDir: opts.webDistDir,
    },
    db,
  }).start();
  return { db, url: running.url };
}

function makeWebDist() {
  const dir = mkdtempSync(join(tmpdir(), 'web-dist-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>board-table</title>');
  writeFileSync(join(dir, 'main.js'), 'console.log(1);');
  return dir;
}

describe('HTTP', () => {
  it('answers the health check', async () => {
    const { url } = await start();
    const res = await fetch(`${url}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it.each([
    ['GET', '/games'],
    ['GET', '/games/tictactoe'],
    ['POST', '/games/tictactoe/create'],
    ['GET', '/games/tictactoe/some-id'],
    ['POST', '/games/tictactoe/some-id/join'],
    ['POST', '/games/tictactoe/some-id/leave'],
    ['POST', '/games/tictactoe/some-id/update'],
    ['POST', '/games/tictactoe/some-id/playAgain'],
    ['POST', '/GAMES/tictactoe/create'],
    ['POST', '/games/tictactoe/create/'],
  ])('blocks the public boardgame.io lobby endpoint %s %s', async (method, path) => {
    const { url, db } = await start();
    const res = await fetch(`${url}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: method === 'POST' ? JSON.stringify({ numPlayers: 2, playerName: 'x' }) : undefined,
    });
    expect(res.status).toBe(404);
    expect(await db.listMatches()).toEqual([]);
  });

  it('sets basic security headers', async () => {
    const { url } = await start();
    const res = await fetch(`${url}/healthz`);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('serves the built web app with SPA fallback', async () => {
    const { url } = await start({ webDistDir: makeWebDist() });

    const asset = await fetch(`${url}/main.js`);
    expect(asset.status).toBe(200);
    expect(await asset.text()).toBe('console.log(1);');

    const deepLink = await fetch(`${url}/join/abc`, { headers: { accept: 'text/html' } });
    expect(deepLink.status).toBe(200);
    expect(await deepLink.text()).toContain('<title>board-table</title>');
  });

  it('does not serve files outside the web dist folder', async () => {
    const { url } = await start({ webDistDir: makeWebDist() });
    const res = await fetch(`${url}/..%2f..%2fpackage.json`);
    expect(await res.text()).not.toContain('"name"');
  });

  it('returns 404 (not the SPA) for unknown API paths and missing assets', async () => {
    const { url } = await start({ webDistDir: makeWebDist() });
    expect((await fetch(`${url}/api/nope`, { headers: { accept: 'text/html' } })).status).toBe(404);
    expect((await fetch(`${url}/missing.js`)).status).toBe(404);
  });
});

describe('multiplayer over socket.io', () => {
  it('lets two seated players play tic-tac-toe to a win', async () => {
    const { url, db } = await start();
    const matchID = await createMatch(db, 'tictactoe');
    const alice = connectPlayer(url, matchID, await claimSeat(db, matchID, 'Alice'));
    const bob = connectPlayer(url, matchID, await claimSeat(db, matchID, 'Bob'));
    try {
      for (const [player, cell] of [
        [alice, 0],
        [bob, 3],
        [alice, 1],
        [bob, 4],
        [alice, 2],
      ] as const) {
        await playMove(player, cell);
      }

      const final = await waitForState(bob, (s) => s.ctx.gameover !== undefined);
      expect(final.ctx.gameover).toEqual({ winner: '0' });
      const stored = await db.fetch(matchID, { state: true });
      expect(stored.state.G.cells.slice(0, 5)).toEqual(['0', '0', '0', '1', '1']);
    } finally {
      alice.stop();
      bob.stop();
    }
  });
});

describe('socket security', () => {
  async function attacker(url: string) {
    const a = rawSocket(url);
    await a.connected;
    sockets.push(a.socket);
    return a;
  }
  const sockets: { close(): void }[] = [];
  afterEach(() => {
    for (const s of sockets.splice(0)) s.close();
  });

  it('never creates matches for unknown match ids', async () => {
    const { url, db } = await start();
    const { socket } = await attacker(url);
    socket.emit('sync', 'made-up-id', '0', 'whatever', 2);
    socket.emit('sync', 'made-up-id-2', null, undefined, 2);
    socket.emit('update', makeMoveAction('clickCell', [0], '0'), 0, 'made-up-id-3', '0');
    await sleep(300);
    expect(await db.listMatches()).toEqual([]);
  });

  it('sends no game state to spectators (no seat)', async () => {
    const { url, db } = await start();
    const matchID = await createMatch(db, 'tictactoe');
    await claimSeat(db, matchID, 'Alice');
    const { socket, received } = await attacker(url);
    socket.emit('sync', matchID, null, undefined, 2);
    await sleep(300);
    expect(received).not.toContain('sync');
  });

  it('sends no game state for wrong credentials', async () => {
    const { url, db } = await start();
    const matchID = await createMatch(db, 'tictactoe');
    await claimSeat(db, matchID, 'Alice');
    const { socket, received } = await attacker(url);
    socket.emit('sync', matchID, '0', 'wrong', 2);
    await sleep(300);
    expect(received).not.toContain('sync');
  });

  it('requires credentials even before any seat is claimed', async () => {
    const { url, db } = await start();
    const matchID = await createMatch(db, 'tictactoe');
    const { socket, received } = await attacker(url);
    socket.emit('sync', matchID, '0', undefined, 2);
    socket.emit('update', makeMoveAction('clickCell', [4], '0'), 0, matchID, '0');
    await sleep(300);
    expect(received).not.toContain('sync');
    expect((await db.fetch(matchID, { state: true })).state.G.cells[4]).toBeNull();
  });

  it('rejects moves with wrong credentials or for an unclaimed seat', async () => {
    const { url, db } = await start();
    const matchID = await createMatch(db, 'tictactoe');
    const alice = await claimSeat(db, matchID, 'Alice');
    const { socket } = await attacker(url);
    socket.emit('update', makeMoveAction('clickCell', [4], '0', 'wrong'), 0, matchID, '0');
    socket.emit('update', makeMoveAction('clickCell', [5], '1'), 0, matchID, '1');
    socket.emit(
      'update',
      makeMoveAction('clickCell', [6], '0', alice.credentials + 'x'),
      0,
      matchID,
      '0',
    );
    await sleep(300);
    expect((await db.fetch(matchID, { state: true })).state.G.cells).toEqual(Array(9).fill(null));
  });

  it('drops updates and chat from sockets that have not synced into a seat', async () => {
    const { url, db } = await start();
    const { socket } = await attacker(url);
    for (let i = 0; i < 20; i++) {
      socket.emit('update', makeMoveAction('clickCell', [0], '0', 'x'), 0, `random-${i}`, '0');
      socket.emit('chat', `random-${i}`, { id: 'c', sender: '0', payload: 'hi' }, 'x');
    }
    await sleep(300);
    // Dropped before boardgame.io sees them: no storage reads, no per-match server state.
    expect(db.fetchCount).toBe(0);
  });

  it('only lets a seated socket act in its own match and seat', async () => {
    const { url, db } = await start();
    const matchA = await createMatch(db, 'tictactoe');
    const matchB = await createMatch(db, 'tictactoe');
    const aliceA = await claimSeat(db, matchA, 'Alice');
    await claimSeat(db, matchA, 'Bob');
    await claimSeat(db, matchB, 'Carol');
    const { socket, received } = await attacker(url);
    socket.emit('sync', matchA, '0', aliceA.credentials, 2);
    await eventually(async () => expect(received).toContain('sync'));

    const fetchesBefore = db.fetchCount;
    socket.emit(
      'update',
      makeMoveAction('clickCell', [4], '0', aliceA.credentials),
      0,
      matchB,
      '0',
    );
    socket.emit(
      'update',
      makeMoveAction('clickCell', [4], '1', aliceA.credentials),
      0,
      matchA,
      '1',
    );
    await sleep(300);
    expect(db.fetchCount).toBe(fetchesBefore);
    expect((await db.fetch(matchB, { state: true })).state.G.cells[4]).toBeNull();
  });

  it('still accepts the real player after attacks', async () => {
    const { url, db } = await start();
    const matchID = await createMatch(db, 'tictactoe');
    const alice = connectPlayer(url, matchID, await claimSeat(db, matchID, 'Alice'));
    const { socket } = await attacker(url);
    socket.emit('update', makeMoveAction('clickCell', [4], '0', 'wrong'), 0, matchID, '0');
    try {
      await playMove(alice, 0);
      expect((await db.fetch(matchID, { state: true })).state.G.cells[0]).toBe('0');
    } finally {
      alice.stop();
    }
  });
});
