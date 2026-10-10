import {
  createRoomRequestSchema,
  joinRequestSchema,
  previewRequestSchema,
  roomIdSchema,
  SEAT_CREDENTIALS_HEADER,
  secretSchema,
  updateRoomRequestSchema,
  type ApiErrorCode,
  type Infer,
  type PublicConfig,
  type Schema,
} from '@board-table/shared';
import type { IncomingMessage } from 'node:http';
import type { Context, Middleware } from 'koa';
import { AuthError, bearerToken, type AccessTokenVerifier } from '../auth/access-token';
import { ApiFailure, type RoomsService } from '../rooms/rooms-service';
import type { RateLimiter } from './rate-limiter';

const MAX_BODY_BYTES = 10 * 1024;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Rate limits from CLAUDE.md ("API design"). */
const LIMITS = {
  allPerIp: { limit: 60, windowMs: MINUTE },
  guestPerIp: { limit: 10, windowMs: MINUTE }, // preview + join
  createRoomPerUser: { limit: 10, windowMs: HOUR },
};

const STATUS: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  invalid_invite: 404,
  room_full: 409,
  room_locked: 409,
  too_many_players: 409,
  limit_reached: 409,
  players_away: 409,
  validation_error: 400,
  rate_limited: 429,
  internal_error: 500,
};

class RateLimited extends ApiFailure {
  constructor(readonly retryAfterSeconds: number) {
    super('rate_limited');
  }
}

class PayloadTooLarge extends ApiFailure {
  constructor() {
    super('validation_error');
  }
}

export interface ApiDeps {
  service: RoomsService;
  verifier: AccessTokenVerifier;
  limiter: RateLimiter;
  publicConfig: PublicConfig;
}

type Handler = (ctx: Context, params: string[]) => Promise<void>;
interface Route {
  method: string;
  pattern: RegExp;
  handle: Handler;
}

/** JSON API under /api (rooms & invites). Everything else passes through to `next`. */
export function apiMiddleware(deps: ApiDeps): Middleware {
  const routes = buildRoutes(deps);
  return async (ctx, next) => {
    if (ctx.path !== '/api' && !ctx.path.startsWith('/api/')) return next();
    ctx.set('Cache-Control', 'no-store');
    try {
      rateLimit(deps.limiter, `ip:${ctx.ip}`, LIMITS.allPerIp);
      const found = matchRoute(routes, ctx);
      if (!found) throw new ApiFailure('not_found');
      await found.route.handle(ctx, found.params);
    } catch (e) {
      respondWithError(ctx, e);
    }
  };
}

function buildRoutes({ service, verifier, limiter, publicConfig }: ApiDeps): Route[] {
  const ROOM = '([^/]+)';

  async function requireHost(ctx: Context): Promise<string> {
    const token = bearerToken(ctx.get('authorization') || undefined);
    if (!token) throw new ApiFailure('unauthorized');
    try {
      return (await verifier.verify(token)).userId;
    } catch (e) {
      if (e instanceof AuthError) throw new ApiFailure('unauthorized');
      throw e;
    }
  }

  /** The signed-in user, if the request has a login token; a bad token is rejected. */
  async function optionalUser(ctx: Context): Promise<string | undefined> {
    return ctx.get('authorization') ? requireHost(ctx) : undefined;
  }

  function seatCredentials(ctx: Context): string {
    const credentials = secretSchema.safeParse(ctx.get(SEAT_CREDENTIALS_HEADER));
    if (!credentials.success) throw new ApiFailure('unauthorized');
    return credentials.data;
  }

  const guestLimit = (ctx: Context) => rateLimit(limiter, `guest:${ctx.ip}`, LIMITS.guestPerIp);

  return [
    route('GET', '/api/config', async (ctx) => {
      ctx.body = publicConfig;
    }),
    route('POST', '/api/rooms', async (ctx) => {
      const userId = await requireHost(ctx);
      rateLimit(limiter, `create:${userId}`, LIMITS.createRoomPerUser);
      const body = await readJson(ctx, createRoomRequestSchema);
      ctx.status = 201;
      ctx.body = await service.createRoom(userId, body);
    }),
    route('GET', '/api/rooms', async (ctx) => {
      ctx.body = await service.listRooms(await requireHost(ctx));
    }),
    route('POST', `/api/rooms/${ROOM}/invite`, async (ctx, [id]) => {
      ctx.body = await service.regenerateInvite(await requireHost(ctx), roomId(id));
    }),
    route('POST', `/api/rooms/${ROOM}/host-seat`, async (ctx, [id]) => {
      ctx.body = await service.reclaimHostSeat(await requireHost(ctx), roomId(id));
    }),
    route('POST', `/api/rooms/${ROOM}/start`, async (ctx, [id]) => {
      await service.start(await requireHost(ctx), roomId(id));
      ctx.status = 204;
    }),
    route('DELETE', `/api/rooms/${ROOM}/seats/([^/]+)`, async (ctx, [id, seat]) => {
      const userId = await requireHost(ctx);
      await service.freeSeat(userId, roomId(id), seatIndex(seat));
      ctx.status = 204;
    }),
    route('PATCH', `/api/rooms/${ROOM}`, async (ctx, [id]) => {
      const userId = await requireHost(ctx);
      const body = await readJson(ctx, updateRoomRequestSchema);
      ctx.body = await service.changeGame(userId, roomId(id), body);
    }),
    route('DELETE', `/api/rooms/${ROOM}`, async (ctx, [id]) => {
      await service.closeRoom(await requireHost(ctx), roomId(id));
      ctx.status = 204;
    }),
    route('POST', `/api/rooms/${ROOM}/preview`, async (ctx, [id]) => {
      guestLimit(ctx);
      const { token } = await readJson(ctx, previewRequestSchema);
      ctx.body = await service.preview(roomId(id), token);
    }),
    route('POST', `/api/rooms/${ROOM}/join`, async (ctx, [id]) => {
      guestLimit(ctx);
      const userId = await optionalUser(ctx);
      const body = await readJson(ctx, joinRequestSchema);
      ctx.status = 201;
      ctx.body = await service.join(roomId(id), body, userId);
    }),
    route('GET', `/api/rooms/${ROOM}/lobby`, async (ctx, [id]) => {
      ctx.body = await service.lobby(roomId(id), seatCredentials(ctx));
    }),
    route('POST', `/api/rooms/${ROOM}/leave`, async (ctx, [id]) => {
      await service.leave(roomId(id), seatCredentials(ctx));
      ctx.status = 204;
    }),
  ];
}

function route(method: string, path: string, handle: Handler): Route {
  return { method, pattern: new RegExp(`^${path}$`), handle };
}

function matchRoute(routes: Route[], ctx: Context) {
  for (const r of routes) {
    const m = r.method === ctx.method ? r.pattern.exec(ctx.path) : null;
    if (m) return { route: r, params: m.slice(1).map((p) => decodeURIComponent(p)) };
  }
  return undefined;
}

/** Malformed room ids are answered like unknown rooms (no probing). */
function roomId(raw: string | undefined): string {
  const parsed = roomIdSchema.safeParse(raw);
  if (!parsed.success) throw new ApiFailure('not_found');
  return parsed.data;
}

function seatIndex(raw: string | undefined): number {
  const n = /^\d{1,2}$/.test(raw ?? '') ? Number(raw) : NaN;
  if (!Number.isInteger(n) || n > 15) throw new ApiFailure('validation_error');
  return n;
}

function rateLimit(limiter: RateLimiter, key: string, { limit, windowMs }: typeof LIMITS.allPerIp) {
  const result = limiter.consume(key, limit, windowMs);
  if (!result.allowed) throw new RateLimited(result.retryAfterSeconds);
}

async function readJson<T extends Schema>(ctx: Context, schema: T): Promise<Infer<T>> {
  if (!ctx.is('application/json')) throw new ApiFailure('validation_error');
  const raw = await readBody(ctx.req, MAX_BODY_BYTES);
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new ApiFailure('validation_error'); // malformed JSON
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new ApiFailure('validation_error');
  return parsed.data;
}

/** Reads at most `maxBytes`; larger bodies are refused without buffering them. */
async function readBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  if (Number(req.headers['content-length'] ?? 0) > maxBytes) throw new PayloadTooLarge();
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > maxBytes) throw new PayloadTooLarge();
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function respondWithError(ctx: Context, e: unknown) {
  let code: ApiErrorCode;
  if (e instanceof ApiFailure) {
    code = e.code;
    ctx.status = e instanceof PayloadTooLarge ? 413 : STATUS[code];
    if (e instanceof RateLimited) ctx.set('Retry-After', String(e.retryAfterSeconds));
    if (e instanceof PayloadTooLarge) ctx.set('Connection', 'close'); // unread body
  } else {
    // Unexpected: log the message only (no request data), answer without details.
    console.error('Unhandled API error:', e instanceof Error ? e.message : e);
    code = 'internal_error';
    ctx.status = 500;
  }
  ctx.body = { error: code };
}
