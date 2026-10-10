import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { extname, join } from 'node:path';
import { gameRegistry } from '@board-table/games';
import { Server, SocketIO } from 'boardgame.io/server';
import type { Middleware } from 'koa';
import serve from 'koa-static';
import { createSupabaseAccessTokenVerifier, type AccessTokenVerifier } from './auth/access-token';
import type { ServerConfig } from './config';
import { createSql } from './db';
import { apiMiddleware } from './http/api';
import { RateLimiter } from './http/rate-limiter';
import { PostgresRoomsRepository } from './rooms/postgres-rooms-repository';
import { RoomLifecycle } from './rooms/room-lifecycle';
import { SeatEvents } from './rooms/seat-events';
import type { RoomsRepository } from './rooms/rooms-repository';
import { RoomsService } from './rooms/rooms-service';
import { guardSockets, isSeatOwner } from './socket-security';
import type { GameStorage } from './storage/game-storage';
import { PostgresStorage } from './storage/postgres-storage';

/** Max size of a single websocket message from a client. */
const MAX_SOCKET_MESSAGE_BYTES = 64 * 1024;

export interface RunningApp {
  url: string;
  db: GameStorage;
  stop(): Promise<void>;
}

/** What the app needs from the outside world; tests pass in-memory versions. */
export interface AppDeps {
  storage: GameStorage;
  repo: RoomsRepository;
  verifier: AccessTokenVerifier;
}

/** Production dependencies: one Postgres pool shared by storage and rooms; owned by the app. */
function productionDeps(config: ServerConfig): AppDeps & { close(): Promise<void> } {
  const sql = createSql(config.databaseUrl);
  const storage = new PostgresStorage(sql);
  return {
    storage,
    repo: new PostgresRoomsRepository(sql),
    verifier: createSupabaseAccessTokenVerifier(config.supabaseUrl),
    async close() {
      await storage.close(); // drain in-flight game writes first
      await sql.end({ timeout: 5 });
    },
  };
}

/**
 * The single web service: boardgame.io websockets, our HTTP endpoints and the built web app.
 *
 * Requests are handled by an allow-list of our own middleware and never fall through to
 * boardgame.io's built-in lobby REST API (create/list/join/leave matches), which is public
 * by design. Rooms and seats are managed by our own code instead (see rooms/).
 */
export function createApp({ config, deps }: { config: ServerConfig; deps?: AppDeps }) {
  const { storage, repo, verifier, close } = deps
    ? { ...deps, close: async () => {} }
    : productionDeps(config);

  return {
    async start(): Promise<RunningApp> {
      // boardgame.io writes through the observed storage: moves keep rooms alive, a finished
      // game deletes its match and reopens the room; idle rooms are swept periodically.
      const seatEvents = new SeatEvents();
      const lifecycle = new RoomLifecycle({ repo, seatEvents });
      const gameStorage = lifecycle.wrap(storage);

      const server = Server({
        games: gameRegistry.map((def) => def.game),
        db: gameStorage,
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

      // Behind Render's proxy: client IP = last X-Forwarded-For entry (added by the proxy).
      server.app.proxy = config.trustProxy;
      server.app.maxIpsCount = 1;

      const limiter = new RateLimiter();
      limiter.start();
      lifecycle.start();

      server.app.use(securityHeaders(config));
      server.app.use(healthCheck);
      server.app.use(
        apiMiddleware({
          service: new RoomsService({ repo, publicOrigin: config.publicOrigin, seatEvents }),
          verifier,
          limiter,
          publicConfig: {
            supabaseUrl: config.supabaseUrl,
            supabaseAnonKey: config.supabaseAnonKey,
          },
        }),
      );
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
      const stopGuard = guardSockets(
        io,
        gameRegistry.map((def) => def.game.name!),
        storage,
        seatEvents,
      );

      return {
        url: `http://localhost:${port}`,
        db: storage,
        async stop() {
          stopGuard();
          io.close();
          appServer.closeAllConnections();
          await new Promise<void>((resolve) => appServer.close(() => resolve()));
          limiter.stop();
          lifecycle.stop();
          await close();
        },
      };
    },
  };
}

/**
 * Strict CSP: only our own scripts; network access only to us (API + websockets) and to
 * Supabase for login. Inline styles are allowed because Angular inlines component styles.
 * This limits what injected script could do (e.g. steal seat secrets from localStorage).
 */
function contentSecurityPolicy({ publicOrigin, supabaseUrl }: ServerConfig): string {
  const websocketOrigin = publicOrigin.replace(/^http/, 'ws');
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self' ${websocketOrigin} ${supabaseUrl}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

const securityHeaders = (config: ServerConfig): Middleware => {
  const csp = contentSecurityPolicy(config);
  return async (ctx, next) => {
    ctx.set('Content-Security-Policy', csp);
    ctx.set('X-Content-Type-Options', 'nosniff');
    ctx.set('X-Frame-Options', 'DENY');
    ctx.set('Referrer-Policy', 'no-referrer');
    await next();
  };
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
  ctx.body = { error: 'not_found' };
};
