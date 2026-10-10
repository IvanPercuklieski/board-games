import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { extname, join } from 'node:path';
import { gameRegistry } from '@board-table/games';
import type { Async } from 'boardgame.io/internal';
import { Server, SocketIO } from 'boardgame.io/server';
import type { Middleware } from 'koa';
import serve from 'koa-static';
import type { ServerConfig } from './config';
import { guardSockets, isSeatOwner } from './socket-security';
import { PostgresStorage } from './storage/postgres-storage';

/** Max size of a single websocket message from a client. */
const MAX_SOCKET_MESSAGE_BYTES = 64 * 1024;

export interface RunningApp {
  url: string;
  db: Async;
  stop(): Promise<void>;
}

/**
 * The single web service: boardgame.io websockets, our HTTP endpoints and the built web app.
 *
 * Requests are handled by an allow-list of our own middleware and never fall through to
 * boardgame.io's built-in lobby REST API (create/list/join/leave matches), which is public
 * by design. Rooms and seats are managed by our own code instead (see matches.ts).
 */
export function createApp({ config, db }: { config: ServerConfig; db?: Async }) {
  const storage = db ?? new PostgresStorage(config.databaseUrl);
  const ownsStorage = db === undefined;

  return {
    async start(): Promise<RunningApp> {
      const server = Server({
        games: gameRegistry.map((def) => def.game),
        db: storage,
        origins: [config.publicOrigin],
        transport: new SocketIO({
          // only the option we set; boardgame.io types require the full socket.io options object
          socketOpts: { maxHttpBufferSize: MAX_SOCKET_MESSAGE_BYTES } as never,
        }),
      });

      // Always require a claimed seat's credentials (stock boardgame.io skips the check
      // while no seat has credentials and for unknown matches).
      server.auth.authenticateCredentials = ({ playerID, credentials, metadata }) =>
        isSeatOwner(metadata, playerID, credentials);

      server.app.use(securityHeaders);
      server.app.use(healthCheck);
      if (config.webDistDir) {
        server.app.use(serve(config.webDistDir, { index: 'index.html' }));
        server.app.use(spaFallback(config.webDistDir));
      }
      server.app.use(notFound); // terminal: nothing reaches boardgame.io's lobby router

      const { appServer } = await server.run(config.port);
      const { port } = appServer.address() as AddressInfo;
      // koa-socket-2 (used by boardgame.io) exposes the socket.io server as app._io
      const io = (
        server.app as unknown as { _io: Parameters<typeof guardSockets>[0] & { close(): void } }
      )._io;
      guardSockets(
        io,
        gameRegistry.map((def) => def.game.name!),
        storage,
      );

      return {
        url: `http://localhost:${port}`,
        db: storage,
        async stop() {
          io.close();
          appServer.closeAllConnections();
          await new Promise<void>((resolve) => appServer.close(() => resolve()));
          if (ownsStorage) await (storage as PostgresStorage).close();
        },
      };
    },
  };
}

const securityHeaders: Middleware = async (ctx, next) => {
  ctx.set('X-Content-Type-Options', 'nosniff');
  ctx.set('X-Frame-Options', 'DENY');
  ctx.set('Referrer-Policy', 'no-referrer');
  await next();
};

const healthCheck: Middleware = async (ctx, next) => {
  if (ctx.method === 'GET' && ctx.path === '/healthz') {
    ctx.body = { ok: true };
    return;
  }
  await next();
};

/** Serves index.html for client-side routes like /join/abc (GET, HTML, no file extension). */
function spaFallback(webDistDir: string): Middleware {
  return async (ctx, next) => {
    const isPageRequest =
      (ctx.method === 'GET' || ctx.method === 'HEAD') &&
      !ctx.path.startsWith('/api/') &&
      extname(ctx.path) === '' &&
      ctx.accepts('html') === 'html';
    if (!isPageRequest) return next();
    ctx.type = 'html';
    ctx.set('Cache-Control', 'no-cache');
    ctx.body = await readFile(join(webDistDir, 'index.html'));
  };
}

const notFound: Middleware = async (ctx) => {
  ctx.status = 404;
  ctx.body = { error: 'Not found' };
};
