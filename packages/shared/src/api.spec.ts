import { describe, expect, it } from 'vitest';
import {
  apiErrorSchema,
  createRoomRequestSchema,
  createRoomResponseSchema,
  joinRequestSchema,
  updateRoomRequestSchema,
  joinResponseSchema,
  listRoomsResponseSchema,
  lobbyResponseSchema,
  playerNameSchema,
  previewRequestSchema,
  previewResponseSchema,
  publicConfigSchema,
  roomIdSchema,
  roomSocketAuthSchema,
  ROOM_NAMESPACE,
  gameIdSchema,
  secretSchema,
} from './api';
import { LIMITS } from './limits';

const roomId = 'AbCdEfGhIjKlMnOpQrSt_-'; // 22 chars, base64url (16 random bytes)
const secret = 'A'.repeat(42) + '_'; // 43 chars, base64url (32 random bytes)

describe('ids and secrets', () => {
  it('accepts base64url room ids of 16 random bytes', () => {
    expect(roomIdSchema.parse(roomId)).toBe(roomId);
  });

  it.each(['', 'short', roomId + 'x', 'AbCdEfGhIjKlMnOpQrSt/=', '../../etc/passwd'])(
    'rejects malformed room id %j',
    (id) => {
      expect(roomIdSchema.safeParse(id).success).toBe(false);
    },
  );

  it('accepts base64url secrets of 32 random bytes', () => {
    expect(secretSchema.parse(secret)).toBe(secret);
  });

  it.each(['', 'x'.repeat(42), 'x'.repeat(44), 'A'.repeat(42) + '='])(
    'rejects malformed secret %j',
    (value) => {
      expect(secretSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe('playerNameSchema', () => {
  it('trims surrounding whitespace', () => {
    expect(playerNameSchema.parse('  Alice  ')).toBe('Alice');
  });

  it(`allows up to ${LIMITS.playerNameMaxLength} characters, including non-ASCII`, () => {
    expect(playerNameSchema.parse('Ž'.repeat(24))).toBe('Ž'.repeat(24));
  });

  it.each(['', '   ', 'x'.repeat(25), 'bad\nname', 'tab\there', 'nul\u0000'])(
    'rejects %j',
    (name) => {
      expect(playerNameSchema.safeParse(name).success).toBe(false);
    },
  );
});

describe('request schemas', () => {
  it('parses a create-room request: just the game (seats go up to its maximum)', () => {
    expect(createRoomRequestSchema.parse({ gameId: 'tictactoe' })).toEqual({ gameId: 'tictactoe' });
  });

  it.each([
    { gameId: 'Tic Tac Toe' },
    { gameId: '' },
    {},
    { gameId: 'tictactoe', maxSeats: 2 }, // the seat count is no longer chosen
    { gameId: 'tictactoe', hostUserId: 'someone-else' },
  ])('rejects invalid create-room request %j', (body) => {
    expect(createRoomRequestSchema.safeParse(body).success).toBe(false);
  });

  it('parses a change-game request with the same rules as creating a room', () => {
    expect(updateRoomRequestSchema.parse({ gameId: 'catan' })).toEqual({ gameId: 'catan' });
    expect(updateRoomRequestSchema.safeParse({}).success).toBe(false);
    expect(
      updateRoomRequestSchema.safeParse({ gameId: 'tictactoe', status: 'waiting' }).success,
    ).toBe(false);
  });

  it('parses join and preview requests and trims the name', () => {
    expect(joinRequestSchema.parse({ token: secret, name: ' Bob ' })).toEqual({
      token: secret,
      name: 'Bob',
    });
    expect(previewRequestSchema.parse({ token: secret })).toEqual({ token: secret });
  });

  it.each([
    { token: 'nope', name: 'Bob' },
    { token: secret },
    { token: secret, name: 'Bob', seatIndex: 0 },
  ])('rejects invalid join request %j', (body) => {
    expect(joinRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe('response schemas', () => {
  const seats = [
    { seatIndex: 0, name: 'Alice', isHost: true, away: false },
    { seatIndex: 1, name: 'Bob', isHost: false, away: true },
  ];

  it('requires the away flag on seats', () => {
    expect(
      listRoomsResponseSchema.safeParse({
        rooms: [
          {
            roomId,
            gameId: 'tictactoe',
            status: 'waiting',
            maxSeats: 2,
            seats: [{ seatIndex: 0, name: 'Alice', isHost: true }],
            createdAt: '2026-10-10T12:00:00.000Z',
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('parses a create-room response', () => {
    const body = {
      roomId,
      inviteUrl: `https://example.com/join/${roomId}#t=${secret}`,
      seat: { seatIndex: 0, credentials: secret },
    };
    expect(createRoomResponseSchema.parse(body)).toEqual(body);
  });

  it('parses a room list', () => {
    const body = {
      rooms: [
        {
          roomId,
          gameId: 'tictactoe',
          status: 'waiting',
          maxSeats: 2,
          seats,
          createdAt: '2026-10-10T12:00:00.000Z',
        },
      ],
    };
    expect(listRoomsResponseSchema.parse(body)).toEqual(body);
  });

  it('parses a preview response', () => {
    const body = {
      gameId: 'tictactoe',
      gameName: 'Tic-tac-toe',
      hostName: 'Alice',
      status: 'waiting',
      maxSeats: 2,
      freeSeats: 1,
    };
    expect(previewResponseSchema.parse(body)).toEqual(body);
  });

  it('parses a join response', () => {
    expect(joinResponseSchema.parse({ seatIndex: 1, credentials: secret })).toEqual({
      seatIndex: 1,
      credentials: secret,
    });
  });

  it('parses lobby responses before and after the game starts', () => {
    const waiting = {
      roomId,
      gameId: 'tictactoe',
      status: 'waiting',
      maxSeats: 2,
      seats,
      you: { seatIndex: 1, isHost: false },
    };
    expect(lobbyResponseSchema.parse(waiting)).toEqual(waiting);

    const playing = {
      ...waiting,
      status: 'playing',
      you: { seatIndex: 1, isHost: false, playerID: '1' },
    };
    expect(lobbyResponseSchema.parse(playing)).toEqual(playing);
  });

  it('rejects an unknown room status', () => {
    expect(
      lobbyResponseSchema.safeParse({
        roomId,
        gameId: 'tictactoe',
        status: 'finished',
        maxSeats: 2,
        seats,
        you: { seatIndex: 0, isHost: true },
      }).success,
    ).toBe(false);
  });
});

describe('publicConfigSchema', () => {
  it('parses the public web config', () => {
    const body = { supabaseUrl: 'https://abc.supabase.co', supabaseAnonKey: 'anon-key' };
    expect(publicConfigSchema.parse(body)).toEqual(body);
  });

  it('rejects a non-https Supabase URL', () => {
    expect(
      publicConfigSchema.safeParse({ supabaseUrl: 'http://abc.supabase.co', supabaseAnonKey: 'k' })
        .success,
    ).toBe(false);
  });
});

describe('apiErrorSchema', () => {
  it.each([
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
  ])('accepts error code %s', (code) => {
    expect(apiErrorSchema.parse({ error: code })).toEqual({ error: code });
  });

  it('rejects unknown error codes', () => {
    expect(apiErrorSchema.safeParse({ error: 'oops' }).success).toBe(false);
  });
});

describe('room socket contract', () => {
  it('uses a namespace no game id can take', () => {
    expect(gameIdSchema.safeParse(ROOM_NAMESPACE.slice(1)).success).toBe(false);
  });

  it('parses the handshake auth payload', () => {
    const auth = { roomId, credentials: secret };
    expect(roomSocketAuthSchema.parse(auth)).toEqual(auth);
  });

  it.each([
    {},
    { roomId },
    { roomId, credentials: 'short' },
    { roomId: '../x', credentials: secret },
    { roomId, credentials: secret, extra: 1 },
  ])('rejects handshake auth %j', (auth) => {
    expect(roomSocketAuthSchema.safeParse(auth).success).toBe(false);
  });
});
