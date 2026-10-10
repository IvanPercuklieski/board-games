import { LIMITS, type ApiErrorCode } from '@board-table/shared';
import { ApiError } from './api-client';
import { describeError, isChunkLoadError } from './error-messages';

describe('describeError', () => {
  it.each<[ApiErrorCode | 'network', RegExp]>([
    ['network', /Can’t reach board·table/],
    ['rate_limited', /a lot of tries in a short time/],
    ['room_locked', /already started/],
    ['room_full', /Every seat at this table is taken/],
    ['too_many_players', /Too many players are seated for that game/],
    ['limit_reached', new RegExp(`${LIMITS.maxActiveRoomsPerHost} open rooms`)],
    ['not_found', /no longer exists/],
    ['invalid_invite', /no longer exists/],
    ['unauthorized', /session ended/],
    ['forbidden', /can’t do that/],
    ['validation_error', /didn’t look right/],
    ['internal_error', /went wrong on our side/],
  ])('explains %s', (code, text) => {
    expect(describeError(new ApiError(code, 400))).toMatch(text);
  });

  it('treats anything that is not an API error as a problem on our side', () => {
    expect(describeError(new Error('boom'))).toBe(
      'Something went wrong on our side. Please try again.',
    );
    expect(describeError('weird')).toMatch(/went wrong on our side/);
  });

  it('says what failed first when given the context', () => {
    expect(describeError(new ApiError('network', 0), 'The room couldn’t be closed.')).toMatch(
      /^The room couldn’t be closed\. Can’t reach board·table/,
    );
  });

  it('recognises a page that could not be loaded after a new version was deployed', () => {
    const chunk = new TypeError(
      'Failed to fetch dynamically imported module: https://x/chunk-ABC.js',
    );
    expect(isChunkLoadError(chunk)).toBe(true);
    expect(isChunkLoadError(new Error('boom'))).toBe(false);
    expect(describeError(chunk)).toMatch(/new version of board·table/);
  });
});
