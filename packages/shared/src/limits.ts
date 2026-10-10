/** Limits shared by the server (enforcement) and the web app (form validation). */
export const LIMITS = {
  playerNameMaxLength: 24,
  /** Upper bound for any game; each game's own min/max players apply on top. */
  maxSeats: 16,
  maxActiveRoomsPerHost: 3,
} as const;

/** Presence on the live room connection (see ROOM_NAMESPACE). */
export const PRESENCE = {
  /** A seat without a connection for this long is away (covers a reload). */
  disconnectGraceMs: 10_000,
  /** Right after a server start, while every browser reconnects. */
  startupGraceMs: 30_000,
  /** A guest seat away for this long is freed. */
  freeSeatAfterMs: 120_000,
} as const;

/** Header carrying a seated player's secret (never put secrets in URLs). */
export const SEAT_CREDENTIALS_HEADER = 'x-seat-credentials';
