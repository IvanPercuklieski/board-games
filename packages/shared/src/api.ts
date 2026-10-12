// Uses zod/mini (functional, tree-shakable API): the full `zod` namespace would pull every
// locale and JSON-schema helper into the browser bundle.
import * as z from 'zod/mini';
import { LIMITS } from './limits';

// --- building blocks ----------------------------------------------------------

/** Base64url encoding of 16 random bytes (room IDs, also used as boardgame.io match IDs). */
export const roomIdSchema = z.string().check(z.regex(/^[A-Za-z0-9_-]{22}$/));

/** Base64url encoding of 32 random bytes (invite tokens and seat credentials). */
export const secretSchema = z.string().check(z.regex(/^[A-Za-z0-9_-]{43}$/));

export const gameIdSchema = z.string().check(z.regex(/^[a-z0-9][a-z0-9-]{0,63}$/));

export const playerNameSchema = z
  .string()
  .check(
    z.trim(),
    z.minLength(1),
    z.maxLength(LIMITS.playerNameMaxLength),
    z.regex(/^[^\p{Cc}]+$/u, 'must not contain control characters'),
  );

export const roomStatusSchema = z.enum(['waiting', 'playing']);

const seatIndexSchema = z.int().check(z.minimum(0), z.maximum(LIMITS.maxSeats - 1));
const countSchema = z.int().check(z.minimum(0));

export const seatInfoSchema = z.object({
  seatIndex: seatIndexSchema,
  name: z.string(),
  isHost: z.boolean(),
  /** No lobby poll from this seat for a while (see PRESENCE); the host can't start meanwhile. */
  away: z.boolean(),
});

// --- requests (strict: unknown fields are rejected) -----------------------------

/**
 * Which game a room plays (creating a room or changing its game). The room takes up to the
 * game's maximum number of players; the seat count is not chosen.
 */
const roomGameSchema = z.strictObject({
  gameId: gameIdSchema,
});

export const createRoomRequestSchema = roomGameSchema;

export const updateRoomRequestSchema = roomGameSchema;

export const previewRequestSchema = z.strictObject({
  token: secretSchema,
});

export const joinRequestSchema = z.strictObject({
  token: secretSchema,
  name: playerNameSchema,
});

// --- responses ------------------------------------------------------------------

export const seatCredentialsSchema = z.object({
  seatIndex: seatIndexSchema,
  credentials: secretSchema,
});

export const createRoomResponseSchema = z.object({
  roomId: roomIdSchema,
  inviteUrl: z.url(),
  seat: seatCredentialsSchema,
});

export const roomSummarySchema = z.object({
  roomId: roomIdSchema,
  gameId: gameIdSchema,
  status: roomStatusSchema,
  maxSeats: countSchema,
  seats: z.array(seatInfoSchema),
  createdAt: z.iso.datetime(),
});

export const listRoomsResponseSchema = z.object({
  rooms: z.array(roomSummarySchema),
});

export const inviteResponseSchema = z.object({
  inviteUrl: z.url(),
});

export const previewResponseSchema = z.object({
  gameId: gameIdSchema,
  gameName: z.string(),
  hostName: z.string(),
  status: roomStatusSchema,
  maxSeats: countSchema,
  freeSeats: countSchema,
});

export const joinResponseSchema = seatCredentialsSchema;

export const lobbyResponseSchema = z.object({
  roomId: roomIdSchema,
  gameId: gameIdSchema,
  status: roomStatusSchema,
  maxSeats: countSchema,
  seats: z.array(seatInfoSchema),
  you: z.object({
    seatIndex: seatIndexSchema,
    isHost: z.boolean(),
    /** boardgame.io playerID, present once the game has started. */
    playerID: z.optional(z.string()),
  }),
});

// --- room connection (socket.io, server -> browser only) -------------------------------

/**
 * Namespace of the live room connection. Game namespaces are `/<gameId>` and game ids start
 * with [a-z0-9], so this can never clash with a game.
 */
export const ROOM_NAMESPACE = '/_room';

/** Events the server sends on the room connection; the browser sends none. */
export const ROOM_EVENTS = {
  /** A full LobbyResponse snapshot, on connect and after every change. */
  lobby: 'lobby',
  /** The room is gone or this seat was freed/reissued; the server disconnects afterwards. */
  closed: 'closed',
} as const;

/** The socket.io handshake `auth` payload (never in the URL). */
export const roomSocketAuthSchema = z.strictObject({
  roomId: roomIdSchema,
  credentials: secretSchema,
});

/** Public values the web app needs to log in (served by GET /api/config). */
export const publicConfigSchema = z.object({
  supabaseUrl: z.url({ protocol: /^https$/ }),
  supabaseAnonKey: z.string().check(z.minLength(1)),
});

export const apiErrorCodeSchema = z.enum([
  'unauthorized',
  'forbidden',
  'not_found',
  'invalid_invite',
  'room_full',
  'room_locked',
  'too_many_players',
  'limit_reached',
  'players_away',
  'validation_error',
  'rate_limited',
  'internal_error',
]);

export const apiErrorSchema = z.object({
  error: apiErrorCodeSchema,
});

// --- types ----------------------------------------------------------------------

/** Any schema from this package (for generic validation helpers). */
export type Schema = z.ZodMiniType;
/** The validated output type of a schema. */
export type Infer<S extends Schema> = z.infer<S>;

export type RoomStatus = z.infer<typeof roomStatusSchema>;
export type SeatInfo = z.infer<typeof seatInfoSchema>;
export type SeatCredentials = z.infer<typeof seatCredentialsSchema>;
export type CreateRoomRequest = z.infer<typeof createRoomRequestSchema>;
export type UpdateRoomRequest = z.infer<typeof updateRoomRequestSchema>;
export type CreateRoomResponse = z.infer<typeof createRoomResponseSchema>;
export type RoomSummary = z.infer<typeof roomSummarySchema>;
export type ListRoomsResponse = z.infer<typeof listRoomsResponseSchema>;
export type InviteResponse = z.infer<typeof inviteResponseSchema>;
export type PreviewRequest = z.infer<typeof previewRequestSchema>;
export type PreviewResponse = z.infer<typeof previewResponseSchema>;
export type JoinRequest = z.infer<typeof joinRequestSchema>;
export type JoinResponse = z.infer<typeof joinResponseSchema>;
export type LobbyResponse = z.infer<typeof lobbyResponseSchema>;
export type RoomSocketAuth = z.infer<typeof roomSocketAuthSchema>;
export type PublicConfig = z.infer<typeof publicConfigSchema>;
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
