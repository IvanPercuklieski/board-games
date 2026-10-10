import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RunningApp } from './app';
import { createSeatedMatch } from './testing/matches';
import { startTestApp } from './testing/app';
import {
  connectPlayer,
  eventually,
  makeMoveAction,
  playMove,
  rawSocket,
  sleep,
  waitForState,
} from './testing/players';

let running: RunningApp | undefined;
afterEach(async () => {
  await running?.stop();
  running = undefined;
});

async function start(opts: { webDistDir?: string } = {}) {
  const t = await startTestApp({ webDistDir: opts.webDistDir });
  running = t.app;
  return { db: t.storage, url: t.url };
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

  it('sends a strict Content-Security-Policy', async () => {
    const { url } = await start();
    const csp = (await fetch(`${url}/healthz`)).headers.get('content-security-policy') ?? '';
    const directives = Object.fromEntries(
      csp.split(';').map((d) => {
        const [name, ...values] = d.trim().split(/\s+/);
        return [name, values];
      }),
    );
    expect(directives['default-src']).toEqual(["'self'"]);
    expect(directives['script-src']).toEqual(["'self'"]);
    expect(directives['object-src']).toEqual(["'none'"]);
    expect(directives['frame-ancestors']).toEqual(["'none'"]);
    expect(directives['base-uri']).toEqual(["'self'"]);
    // the web app talks only to us (API + websockets) and to Supabase for login
    expect(directives['connect-src']).toEqual([
      "'self'",
      'ws://localhost:4200',
      'https://abc.supabase.co',
    ]);
    expect(directives['img-src']).toEqual(["'self'", 'data:']);
    expect(directives['font-src']).toEqual(["'self'"]);
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
    const { matchID, seats } = await createSeatedMatch(db, ['Alice', 'Bob']);
    const alice = connectPlayer(url, matchID, seats[0]!);
    const bob = connectPlayer(url, matchID, seats[1]!);
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
      expect(final.G.cells.slice(0, 5)).toEqual(['0', '0', '0', '1', '1']);
      // Nothing is kept after a finished game (CLAUDE.md "Data retention").
      await eventually(async () =>
        expect((await db.fetch(matchID, { state: true })).state).toBeUndefined(),
      );
    } finally {
      alice.stop();
      bob.stop();
    }
  });
});

describe('joining while the other player moves', () => {
  it('a player whose sync is still loading still receives a move made meanwhile', async () => {
    const { url, db } = await start();
    const { matchID, seats } = await createSeatedMatch(db, ['Alice', 'Bob']);
    const alice = connectPlayer(url, matchID, seats[0]!);
    await waitForState(alice, (s) => s.ctx.currentPlayer === '0');

    // boardgame.io's sync reads the match (with its log), then answers, then registers the
    // socket for broadcasts. Make that read slow, as with a real database round trip.
    const fetch = db.fetch.bind(db);
    vi.spyOn(db, 'fetch').mockImplementation(async (id, opts) => {
      const result = await fetch(id, opts); // the snapshot is taken now...
      if (opts.log) await sleep(300); // ...and arrives later
      return result;
    });
    const bob = connectPlayer(url, matchID, seats[1]!);
    try {
      await sleep(100); // Bob's sync has read the match and is on its way
      alice.moves['clickCell']!(0);
      const seen = await waitForState(bob, (s) => s.G.cells[0] === '0', 3_000);
      expect(seen.ctx.currentPlayer).toBe('1');
    } finally {
      alice.stop();
      bob.stop();
    }
  });
});

describe('joining while a move is being saved', () => {
  it('a player who syncs before the move is stored still receives it', async () => {
    const { url, db } = await start();
    const { matchID, seats } = await createSeatedMatch(db, ['Alice', 'Bob']);
    const alice = connectPlayer(url, matchID, seats[0]!);
    await waitForState(alice, (s) => s.ctx.currentPlayer === '0');

    // boardgame.io broadcasts a move first and stores it afterwards; a sync in between
    // reads the old state from the database.
    const setState = db.setState.bind(db);
    vi.spyOn(db, 'setState').mockImplementation(async (...args) => {
      await sleep(300);
      return setState(...args);
    });
    alice.moves['clickCell']!(0);
    await sleep(50); // the move is broadcast, not stored yet
    const bob = connectPlayer(url, matchID, seats[1]!);
    try {
      const seen = await waitForState(bob, (s) => s.G.cells[0] === '0', 3_000);
      expect(seen.ctx.currentPlayer).toBe('1');
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
    const { matchID } = await createSeatedMatch(db, ['Alice', null]);
    const { socket, received } = await attacker(url);
    socket.emit('sync', matchID, null, undefined, 2);
    await sleep(300);
    expect(received).not.toContain('sync');
  });

  it('sends no game state for wrong credentials', async () => {
    const { url, db } = await start();
    const { matchID } = await createSeatedMatch(db, ['Alice', null]);
    const { socket, received } = await attacker(url);
    socket.emit('sync', matchID, '0', 'wrong', 2);
    await sleep(300);
    expect(received).not.toContain('sync');
  });

  it('requires credentials even before any seat is claimed', async () => {
    const { url, db } = await start();
    const { matchID } = await createSeatedMatch(db, [null, null]);
    const { socket, received } = await attacker(url);
    socket.emit('sync', matchID, '0', undefined, 2);
    socket.emit('update', makeMoveAction('clickCell', [4], '0'), 0, matchID, '0');
    await sleep(300);
    expect(received).not.toContain('sync');
    expect((await db.fetch(matchID, { state: true })).state.G.cells[4]).toBeNull();
  });

  it('keeps a move sent right after sync, even while the seat check is still reading the DB', async () => {
    const { url, db } = await start();
    const { matchID, seats } = await createSeatedMatch(db, ['Alice', 'Bob']);
    const alice = seats[0]!;
    const fetch = db.fetch.bind(db);
    vi.spyOn(db, 'fetch').mockImplementation(async (id, opts) => {
      await sleep(100); // a real database round trip
      return fetch(id, opts);
    });
    const { socket } = await attacker(url);
    socket.emit('sync', matchID, '0', alice.credentials, 2);
    socket.emit(
      'update',
      makeMoveAction('clickCell', [4], '0', alice.credentials),
      0,
      matchID,
      '0',
    );
    await eventually(async () =>
      expect((await fetch(matchID, { state: true })).state.G.cells[4]).toBe('0'),
    );
  });

  it('drops packets beyond a small per-socket backlog while a seat check is pending', async () => {
    const { url, db } = await start();
    const { matchID, seats } = await createSeatedMatch(db, ['Alice', 'Bob']);
    const alice = seats[0]!;
    const fetch = db.fetch.bind(db);
    vi.spyOn(db, 'fetch').mockImplementation(async (id, opts) => {
      await sleep(100);
      return fetch(id, opts);
    });
    const { socket } = await attacker(url);
    socket.emit('sync', matchID, '0', alice.credentials, 2);
    for (let i = 0; i < 20; i++) socket.emit('chat', matchID, { id: String(i), sender: '0' });
    socket.emit(
      'update',
      makeMoveAction('clickCell', [4], '0', alice.credentials),
      0,
      matchID,
      '0',
    );
    await sleep(500);
    expect((await fetch(matchID, { state: true })).state.G.cells[4]).toBeNull();
  });

  it('rejects moves with wrong credentials or for an unclaimed seat', async () => {
    const { url, db } = await start();
    const { matchID, seats } = await createSeatedMatch(db, ['Alice', null]);
    const alice = seats[0]!;
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

  it.each([
    ['UPDATE (replace the whole state)', 'UPDATE'],
    ['SYNC (replace the whole state)', 'SYNC'],
    ['RESET (replace the whole state)', 'RESET'],
    ['PATCH (patch the state)', 'PATCH'],
    ['GAME_EVENT endGame (declare a winner)', 'GAME_EVENT'],
    ['UNDO', 'UNDO'],
    ['an unknown action type', 'SOMETHING_ELSE'],
  ])('a seated player cannot bypass the rules with %s', async (_case, type) => {
    const { url, db } = await start();
    const { matchID, seats } = await createSeatedMatch(db, ['Alice', 'Bob']);
    const alice = seats[0]!;
    const { socket, received } = await attacker(url);
    socket.emit('sync', matchID, '0', alice.credentials, 2);
    await eventually(async () => expect(received).toContain('sync'));
    const { state } = await db.fetch(matchID, { state: true });

    // Valid seat, valid credentials, Alice's turn, correct stateID: only the action type is forged.
    const forged = {
      ...state,
      G: { cells: Array(9).fill('0') },
      ctx: { ...state.ctx, gameover: { winner: '0' } },
    };
    const payload = { playerID: '0', credentials: alice.credentials };
    const action =
      type === 'PATCH'
        ? {
            type,
            patch: [{ op: 'replace', path: '/ctx/gameover', value: { winner: '0' } }],
            payload,
          }
        : type === 'GAME_EVENT'
          ? { type, payload: { ...payload, type: 'endGame', args: [{ winner: '0' }] } }
          : { type, state: forged, payload };
    socket.emit('update', action, state._stateID, matchID, '0');
    await sleep(300);

    const after = await db.fetch(matchID, { state: true, metadata: true });
    expect(after.state.G.cells).toEqual(Array(9).fill(null));
    expect(after.state.ctx.gameover).toBeUndefined();
    expect(after.metadata.gameover).toBeUndefined();
  });

  it('still accepts normal moves from the seated player', async () => {
    const { url, db } = await start();
    const { matchID, seats } = await createSeatedMatch(db, ['Alice', 'Bob']);
    const alice = seats[0]!;
    const { socket, received } = await attacker(url);
    socket.emit('sync', matchID, '0', alice.credentials, 2);
    await eventually(async () => expect(received).toContain('sync'));
    socket.emit(
      'update',
      makeMoveAction('clickCell', [4], '0', alice.credentials),
      0,
      matchID,
      '0',
    );
    await eventually(async () =>
      expect((await db.fetch(matchID, { state: true })).state.G.cells[4]).toBe('0'),
    );
  });

  it('only lets a seated socket act in its own match and seat', async () => {
    const { url, db } = await start();
    const { matchID: matchA, seats: seatsA } = await createSeatedMatch(db, ['Alice', 'Bob']);
    const { matchID: matchB } = await createSeatedMatch(db, ['Carol', null]);
    const aliceA = seatsA[0]!;
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
    const { matchID, seats } = await createSeatedMatch(db, ['Alice', null]);
    const alice = connectPlayer(url, matchID, seats[0]!);
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
