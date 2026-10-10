import { LIMITS, type ApiErrorCode } from '@board-table/shared';
import { ApiError } from './api-client';

const SOMETHING_WENT_WRONG = 'Something went wrong on our side. Please try again.';

/** The one place for error wording (CLAUDE.md "Errors & loading"). */
const MESSAGES: Record<ApiErrorCode | 'network', string> = {
  network:
    'Can’t reach board·table. Check your connection; if the site was asleep it can take a minute to wake up.',
  rate_limited: 'That was a lot of tries in a short time. Wait a moment and try again.',
  room_locked: 'The game has already started.',
  room_full: 'Every seat at this table is taken.',
  too_many_players: 'Too many players are seated for that game. Free a seat first.',
  limit_reached: `You already have ${LIMITS.maxActiveRoomsPerHost} open rooms. Close one first.`,
  not_found: 'This table no longer exists, or the link stopped working.',
  invalid_invite: 'This table no longer exists, or the link stopped working.',
  unauthorized: 'Your session ended. Log in again.',
  forbidden: 'You can’t do that here.',
  validation_error: 'That didn’t look right. Please check it and try again.',
  internal_error: SOMETHING_WENT_WRONG,
};

const NEW_VERSION = 'A new version of board·table is available. Reload to continue.';

/** A lazy-loaded chunk failed to load, usually because a newer version was deployed. */
export function isChunkLoadError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
      error.message,
    )
  );
}

/**
 * User-facing text for an error. With `context` (what failed, e.g. "The room couldn't be
 * closed."), that comes first.
 */
export function describeError(error: unknown, context?: string): string {
  const detail = isChunkLoadError(error)
    ? NEW_VERSION
    : error instanceof ApiError
      ? MESSAGES[error.code]
      : SOMETHING_WENT_WRONG;
  return context ? `${context} ${detail}` : detail;
}
