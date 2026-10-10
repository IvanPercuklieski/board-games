/** Limits shared by the server (enforcement) and the web app (form validation). */
export const LIMITS = {
  playerNameMaxLength: 24,
  /** Upper bound for any game; each game's own min/max players apply on top. */
  maxSeats: 16,
  maxActiveRoomsPerHost: 3,
} as const;

/** Header carrying a seated player's secret (never put secrets in URLs). */
export const SEAT_CREDENTIALS_HEADER = 'x-seat-credentials';
