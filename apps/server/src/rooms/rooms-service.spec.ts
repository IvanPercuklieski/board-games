import { randomUUID } from 'node:crypto';
import {
  createRoomResponseSchema,
  joinResponseSchema,
  LIMITS,
  listRoomsResponseSchema,
  lobbyResponseSchema,
  previewResponseSchema,
  type ApiErrorCode,
} from '@board-table/shared';
import { getGameDefinition, type GameDefinition } from '@board-table/games';
import { beforeEach, describe, expect, it } from 'vitest';
import { hashSecret, newRoomId, newSecret } from '../secrets';
import { MemoryRoomsRepository } from '../testing/memory-rooms-repository';
import { MemoryStorage } from '../testing/memory-storage';
import { ApiFailure, RoomsService } from './rooms-service';
import { SeatEvents } from './seat-events';

const ORIGIN = 'https://board-table.example';

let storage: MemoryStorage;
let repo: MemoryRoomsRepository;
let service: RoomsService;
let alice: string;
let bob: string;
let carol: string;
/** Seat keys (credentials hashes) the fake presence reports as away. */
let away: Set<string>;
let events: SeatEvents;
let changed: string[];
let closed: string[];
let revoked: string[];

beforeEach(() => {
  storage = new MemoryStorage();
  repo = new MemoryRoomsRepository(storage);
  away = new Set();
  events = new SeatEvents();
  changed = [];
  closed = [];
  revoked = [];
  events.onRoomChanged((id) => changed.push(id));
  events.onRoomClosed((id) => closed.push(id));
  events.onRevoked((id, playerID) => revoked.push(`${id}:${playerID}`));
  service = new RoomsService({
    repo,
    publicOrigin: ORIGIN,
    findGame,
    seatEvents: events,
    presence: { isAway: (_roomId, seatKey) => away.has(seatKey) },
  });
  alice = randomUUID();
  bob = randomUUID();
  repo.addProfile(alice, 'Alice');
  repo.addProfile(bob, 'Bob');
  carol = randomUUID();
  repo.addProfile(carol, 'Carol');
});

/** The registry plus two made-up games with other player ranges (only rules are fake). */
const extraGames: GameDefinition[] = [
  { id: 'party', displayName: 'Party', minPlayers: 3, maxPlayers: 6, game: { name: 'party' } },
  { id: 'solo', displayName: 'Solo', minPlayers: 1, maxPlayers: 1, game: { name: 'solo' } },
];
const findGame = (id: string) => getGameDefinition(id) ?? extraGames.find((g) => g.id === id);

async function failsWith(promise: Promise<unknown>, code: ApiErrorCode) {
  await expect(promise).rejects.toThrow(ApiFailure);
  await promise.catch((e: ApiFailure) => expect(e.code).toBe(code));
}

/** Creates a room for Alice and returns its id plus the invite token from the link. */
async function aliceRoom(gameId = 'tictactoe') {
  const created = await service.createRoom(alice, { gameId });
  const token = new URL(created.inviteUrl).hash.replace('#t=', '');
  return { ...created, token };
}

describe('createRoom', () => {
  it('creates a room with the host in seat 0 and an invite link', async () => {
    const created = await service.createRoom(alice, { gameId: 'tictactoe' });
    expect(createRoomResponseSchema.parse(created)).toEqual(created);
    expect(created.inviteUrl).toMatch(
      new RegExp(`^${ORIGIN}/join/${created.roomId}#t=[A-Za-z0-9_-]{43}$`),
    );
    expect(created.seat.seatIndex).toBe(0);

    const room = await repo.findRoom(created.roomId);
    expect(room).toMatchObject({ hostUserId: alice, status: 'waiting', maxSeats: 2 });
    const token = new URL(created.inviteUrl).hash.slice(3);
    expect(room!.inviteTokenHash).toBe(hashSecret(token));
    expect(await repo.listSeats(created.roomId)).toEqual([
      {
        seatIndex: 0,
        name: 'Alice',
        userId: alice,
        credentialsHash: hashSecret(created.seat.credentials),
      },
    ]);
  });

  it('cuts long display names to the seat name limit', async () => {
    repo.addProfile(bob, 'B'.repeat(40));
    const created = await service.createRoom(bob, { gameId: 'tictactoe' });
    const [seat] = await repo.listSeats(created.roomId);
    expect(seat!.name).toBe('B'.repeat(LIMITS.playerNameMaxLength));
  });

  it('refuses users without a profile', async () => {
    await failsWith(service.createRoom(randomUUID(), { gameId: 'tictactoe' }), 'forbidden');
  });

  it('refuses unknown games', async () => {
    await failsWith(service.createRoom(alice, { gameId: 'chess' }), 'validation_error');
  });

  it('opens the room up to the game’s maximum number of players', async () => {
    const party = await aliceRoom('party');
    expect(await repo.findRoom(party.roomId)).toMatchObject({ maxSeats: 6 });
    expect((await service.preview(party.roomId, party.token)).freeSeats).toBe(5);
  });

  it(`allows at most ${LIMITS.maxActiveRoomsPerHost} active rooms per host`, async () => {
    for (let i = 0; i < LIMITS.maxActiveRoomsPerHost; i++) await aliceRoom();
    await failsWith(service.createRoom(alice, { gameId: 'tictactoe' }), 'limit_reached');
    // other hosts are unaffected
    await expect(service.createRoom(bob, { gameId: 'tictactoe' })).resolves.toBeDefined();
  });
});

describe('listRooms', () => {
  it("lists only the host's rooms with their seats", async () => {
    const room = await aliceRoom();
    await service.join(room.roomId, { token: room.token, name: 'Bob' });
    await service.createRoom(bob, { gameId: 'tictactoe' });

    const list = await service.listRooms(alice);
    expect(listRoomsResponseSchema.parse(list)).toEqual(list);
    expect(list.rooms).toHaveLength(1);
    expect(list.rooms[0]).toMatchObject({
      roomId: room.roomId,
      gameId: 'tictactoe',
      status: 'waiting',
      maxSeats: 2,
      seats: [
        { seatIndex: 0, name: 'Alice', isHost: true, away: false },
        { seatIndex: 1, name: 'Bob', isHost: false, away: false },
      ],
    });
  });
});

describe('changeGame', () => {
  it('switches a waiting room to another game, open up to its maximum', async () => {
    const room = await aliceRoom();
    const bobSeat = await service.join(room.roomId, { token: room.token, name: 'Bob' });

    const summary = await service.changeGame(alice, room.roomId, { gameId: 'party' });
    expect(listRoomsResponseSchema.parse({ rooms: [summary] }).rooms[0]).toEqual(summary);
    expect(summary).toMatchObject({ roomId: room.roomId, gameId: 'party', maxSeats: 6 });
    expect(await service.lobby(room.roomId, bobSeat.credentials)).toMatchObject({
      gameId: 'party',
      maxSeats: 6,
      status: 'waiting',
    });
  });

  it('refuses when the seated players do not fit the new game', async () => {
    const room = await aliceRoom();
    await service.join(room.roomId, { token: room.token, name: 'Bob' });
    await failsWith(service.changeGame(alice, room.roomId, { gameId: 'solo' }), 'too_many_players');
    expect((await repo.findRoom(room.roomId))!.gameId).toBe('tictactoe');
  });

  it('rejects an unknown game', async () => {
    const room = await aliceRoom();
    await failsWith(
      service.changeGame(alice, room.roomId, { gameId: 'no-such-game' }),
      'validation_error',
    );
  });

  it('is locked while a game is running', async () => {
    const room = await aliceRoom();
    await service.join(room.roomId, { token: room.token, name: 'Bob' });
    await service.start(alice, room.roomId);
    await failsWith(service.changeGame(alice, room.roomId, { gameId: 'party' }), 'room_locked');
  });

  it('answers not_found to anyone but the host', async () => {
    const room = await aliceRoom();
    const req = { gameId: 'party' };
    await failsWith(service.changeGame(bob, room.roomId, req), 'not_found');
    await failsWith(service.changeGame(alice, newRoomId(), req), 'not_found');
  });
});

describe('preview and join (guests)', () => {
  it('previews a room with a valid invite token', async () => {
    const room = await aliceRoom();
    const preview = await service.preview(room.roomId, room.token);
    expect(previewResponseSchema.parse(preview)).toEqual({
      gameId: 'tictactoe',
      gameName: 'Tic-tac-toe',
      hostName: 'Alice',
      status: 'waiting',
      maxSeats: 2,
      freeSeats: 1,
    });
  });

  it('gives a guest the next seat and secret credentials', async () => {
    const room = await aliceRoom();
    const seat = await service.join(room.roomId, { token: room.token, name: 'Bob' });
    expect(joinResponseSchema.parse(seat)).toEqual(seat);
    expect(seat.seatIndex).toBe(1);
    expect(seat.credentials).not.toBe(room.seat.credentials);
    const stored = await repo.listSeats(room.roomId);
    expect(stored[1]).toEqual({
      seatIndex: 1,
      name: 'Bob',
      userId: null,
      credentialsHash: hashSecret(seat.credentials),
    });
  });

  it('answers not_found for a wrong token or unknown room (no probing)', async () => {
    const room = await aliceRoom();
    await failsWith(service.preview(room.roomId, newSecret()), 'not_found');
    await failsWith(
      service.join(room.roomId, { token: newSecret(), name: 'Mallory' }),
      'not_found',
    );
    await failsWith(service.preview(newRoomId(), room.token), 'not_found');
    await failsWith(service.join(newRoomId(), { token: room.token, name: 'Mallory' }), 'not_found');
  });

  it('refuses joins when the room is full', async () => {
    const room = await aliceRoom();
    await service.join(room.roomId, { token: room.token, name: 'Bob' });
    await failsWith(service.join(room.roomId, { token: room.token, name: 'Carol' }), 'room_full');
  });

  it('kills the old link when the host makes a new one', async () => {
    const room = await aliceRoom();
    const { inviteUrl } = await service.regenerateInvite(alice, room.roomId);
    const newToken = new URL(inviteUrl).hash.slice(3);
    expect(newToken).not.toBe(room.token);
    await failsWith(service.join(room.roomId, { token: room.token, name: 'Bob' }), 'not_found');
    await expect(
      service.join(room.roomId, { token: newToken, name: 'Bob' }),
    ).resolves.toMatchObject({
      seatIndex: 1,
    });
  });
});

describe('start', () => {
  it('starts with the seated players and locks the room', async () => {
    const room = await aliceRoom();
    const bobSeat = await service.join(room.roomId, { token: room.token, name: 'Bob' });
    await service.start(alice, room.roomId);

    expect((await repo.findRoom(room.roomId))!.status).toBe('playing');
    const { metadata } = await storage.fetch(room.roomId, { metadata: true });
    expect(metadata.players[1]).toMatchObject({
      name: 'Bob',
      credentials: hashSecret(bobSeat.credentials),
    });
    await failsWith(service.join(room.roomId, { token: room.token, name: 'Carol' }), 'room_locked');
    await failsWith(service.start(alice, room.roomId), 'room_locked');
  });

  it('needs at least the game minimum of players', async () => {
    const room = await aliceRoom();
    await failsWith(service.start(alice, room.roomId), 'validation_error');
    expect((await repo.findRoom(room.roomId))!.status).toBe('waiting');
  });
});

describe('host-only actions', () => {
  it.each(['regenerateInvite', 'start', 'closeRoom'] as const)(
    '%s answers not_found to anyone but the host',
    async (action) => {
      const room = await aliceRoom();
      await service.join(room.roomId, { token: room.token, name: 'Bob' });
      await failsWith(service[action](bob, room.roomId), 'not_found');
      await failsWith(service[action](alice, newRoomId()), 'not_found');
    },
  );

  it('frees a guest seat so someone else can join (also mid-game)', async () => {
    const room = await aliceRoom();
    const bobSeat = await service.join(room.roomId, { token: room.token, name: 'Bob' });
    await service.start(alice, room.roomId);

    await service.freeSeat(alice, room.roomId, 1);
    await failsWith(service.lobby(room.roomId, bobSeat.credentials), 'not_found');
    expect((await storage.fetch(room.roomId, { metadata: true })).metadata.players[1]).toEqual({
      id: 1,
    });

    const carol = await service.join(room.roomId, { token: room.token, name: 'Carol' });
    expect(carol.seatIndex).toBe(1);
    expect((await service.lobby(room.roomId, carol.credentials)).you).toEqual({
      seatIndex: 1,
      isHost: false,
      playerID: '1',
    });
  });

  it('refuses to free the host seat, unknown seats, or seats in rooms of others', async () => {
    const room = await aliceRoom();
    await failsWith(service.freeSeat(alice, room.roomId, 0), 'forbidden');
    await failsWith(service.freeSeat(alice, room.roomId, 1), 'not_found');
    await service.join(room.roomId, { token: room.token, name: 'Bob' });
    await failsWith(service.freeSeat(bob, room.roomId, 1), 'not_found');
  });

  it('closes a room with its seats and match', async () => {
    const room = await aliceRoom();
    await service.join(room.roomId, { token: room.token, name: 'Bob' });
    await service.start(alice, room.roomId);
    await service.closeRoom(alice, room.roomId);
    expect(await repo.findRoom(room.roomId)).toBeUndefined();
    expect((await storage.fetch(room.roomId, { state: true })).state).toBeUndefined();
    await failsWith(service.lobby(room.roomId, room.seat.credentials), 'not_found');
  });
});

describe('reclaimHostSeat', () => {
  it('gives the host fresh seat credentials and invalidates the old ones', async () => {
    const room = await aliceRoom();
    const reclaimed = await service.reclaimHostSeat(alice, room.roomId);
    expect(reclaimed.seatIndex).toBe(0);
    expect(reclaimed.credentials).not.toBe(room.seat.credentials);
    await failsWith(service.lobby(room.roomId, room.seat.credentials), 'not_found');
    expect((await service.lobby(room.roomId, reclaimed.credentials)).you.seatIndex).toBe(0);
  });

  it('answers not_found to anyone but the host', async () => {
    const room = await aliceRoom();
    await failsWith(service.reclaimHostSeat(bob, room.roomId), 'not_found');
    await failsWith(service.reclaimHostSeat(alice, newRoomId()), 'not_found');
  });
});

describe('lobby', () => {
  it('shows seats and the caller, and the playerID once started', async () => {
    const room = await aliceRoom();
    const bobSeat = await service.join(room.roomId, { token: room.token, name: 'Bob' });

    const waiting = await service.lobby(room.roomId, bobSeat.credentials);
    expect(lobbyResponseSchema.parse(waiting)).toEqual({
      roomId: room.roomId,
      gameId: 'tictactoe',
      status: 'waiting',
      maxSeats: 2,
      seats: [
        { seatIndex: 0, name: 'Alice', isHost: true, away: false },
        { seatIndex: 1, name: 'Bob', isHost: false, away: false },
      ],
      you: { seatIndex: 1, isHost: false },
    });

    await service.start(alice, room.roomId);
    const playing = await service.lobby(room.roomId, room.seat.credentials);
    expect(playing).toMatchObject({
      status: 'playing',
      you: { seatIndex: 0, isHost: true, playerID: '0' },
    });
  });

  it('answers not_found for unknown credentials or another room', async () => {
    const room = await aliceRoom();
    const other = await aliceRoom();
    await failsWith(service.lobby(room.roomId, newSecret()), 'not_found');
    await failsWith(service.lobby(other.roomId, room.seat.credentials), 'not_found');
  });
});

describe('signed-in players joining through the link', () => {
  it('seats them with their account', async () => {
    const room = await aliceRoom('party');
    const seat = await service.join(room.roomId, { token: room.token, name: 'Bobby' }, bob);
    expect((await repo.listSeats(room.roomId))[1]).toMatchObject({ name: 'Bobby', userId: bob });
    expect((await service.lobby(room.roomId, seat.credentials)).you.isHost).toBe(false);
  });

  it('reissues their seat when they join again (old device stops working)', async () => {
    const room = await aliceRoom();
    const first = await service.join(room.roomId, { token: room.token, name: 'Bob' }, bob);
    revoked = [];
    const again = await service.join(room.roomId, { token: room.token, name: 'Bob' }, bob);
    expect(again.seatIndex).toBe(1);
    await failsWith(service.lobby(room.roomId, first.credentials), 'not_found');
    expect((await service.lobby(room.roomId, again.credentials)).you.seatIndex).toBe(1);
    expect(revoked).toEqual([`${room.roomId}:1`]);
    expect(await repo.listSeats(room.roomId)).toHaveLength(2);
  });

  it('the host joining their own link just gets their seat again', async () => {
    const room = await aliceRoom();
    const again = await service.join(room.roomId, { token: room.token, name: 'Alice' }, alice);
    expect(again.seatIndex).toBe(0);
    await failsWith(service.lobby(room.roomId, room.seat.credentials), 'not_found');
  });
});

describe('room events', () => {
  it('announces every change to the room', async () => {
    const room = await aliceRoom('party');
    await service.join(room.roomId, { token: room.token, name: 'Bob' });
    await service.changeGame(alice, room.roomId, { gameId: 'tictactoe' });
    await service.freeSeat(alice, room.roomId, 1);
    await service.reclaimHostSeat(alice, room.roomId);
    await service.join(room.roomId, { token: room.token, name: 'Bob' });
    await service.start(alice, room.roomId);
    expect(changed).toEqual(Array(6).fill(room.roomId));
    await service.closeRoom(alice, room.roomId);
    expect(closed).toEqual([room.roomId]);
  });
});

describe('presence', () => {
  it('marks away seats in the lobby', async () => {
    const room = await aliceRoom();
    const bobSeat = await service.join(room.roomId, { token: room.token, name: 'Bob' });
    away.add(hashSecret(bobSeat.credentials));
    const lobby = await service.lobby(room.roomId, room.seat.credentials);
    expect(lobby.seats.map((s) => s.away)).toEqual([false, true]);
  });

  it('refuses to start while anyone is away', async () => {
    const room = await aliceRoom();
    const bobSeat = await service.join(room.roomId, { token: room.token, name: 'Bob' });
    away.add(hashSecret(bobSeat.credentials));
    await failsWith(service.start(alice, room.roomId), 'players_away');
    away.clear();
    await service.start(alice, room.roomId);
  });

  it('frees an expired guest seat in a waiting room', async () => {
    const room = await aliceRoom();
    const bobSeat = await service.join(room.roomId, { token: room.token, name: 'Bob' });
    changed = [];
    await service.seatExpired(room.roomId, hashSecret(bobSeat.credentials));
    expect(await repo.listSeats(room.roomId)).toHaveLength(1);
    expect(revoked).toEqual([`${room.roomId}:1`]);
    expect(changed).toEqual([room.roomId]);
  });

  it('keeps expired seats while a game is running, and never frees the host this way', async () => {
    const room = await aliceRoom();
    const bobSeat = await service.join(room.roomId, { token: room.token, name: 'Bob' });
    await service.seatExpired(room.roomId, hashSecret(room.seat.credentials));
    await service.start(alice, room.roomId);
    await service.seatExpired(room.roomId, hashSecret(bobSeat.credentials));
    expect(await repo.listSeats(room.roomId)).toHaveLength(2);
  });

  it('ignores expiry of seats or rooms that are gone', async () => {
    const room = await aliceRoom();
    await service.seatExpired(room.roomId, 'unknown');
    await service.seatExpired(newRoomId(), 'unknown');
    expect(await repo.listSeats(room.roomId)).toHaveLength(1);
  });

  it('hands a waiting room to the first present account holder when the host is away', async () => {
    const room = await aliceRoom('party');
    await service.join(room.roomId, { token: room.token, name: 'Gus' }); // guest, no account
    const bobSeat = await service.join(room.roomId, { token: room.token, name: 'Bob' }, bob);
    await service.join(room.roomId, { token: room.token, name: 'Carol' }, carol);
    away.add(hashSecret(room.seat.credentials));
    away.add(hashSecret(bobSeat.credentials)); // Bob is away too, so Carol takes over
    changed = [];
    await service.seatAway(room.roomId, hashSecret(room.seat.credentials));
    expect((await repo.findRoom(room.roomId))!.hostUserId).toBe(carol);
    expect(await repo.listSeats(room.roomId)).toHaveLength(4); // Alice stays seated
    expect(changed).toEqual([room.roomId]);
    const lobby = await service.lobby(room.roomId, room.seat.credentials);
    expect(lobby.you.isHost).toBe(false);
    expect(lobby.seats.find((s) => s.isHost)?.name).toBe('Carol');
  });

  it('deletes the room when the host is away and no one with an account can take it', async () => {
    const room = await aliceRoom();
    await service.join(room.roomId, { token: room.token, name: 'Gus' });
    away.add(hashSecret(room.seat.credentials));
    await service.seatAway(room.roomId, hashSecret(room.seat.credentials));
    expect(await repo.findRoom(room.roomId)).toBeUndefined();
    expect(closed).toEqual([room.roomId]);
  });

  it('an away guest only changes what others see', async () => {
    const room = await aliceRoom();
    const gus = await service.join(room.roomId, { token: room.token, name: 'Gus' });
    changed = [];
    await service.seatAway(room.roomId, hashSecret(gus.credentials));
    expect((await repo.findRoom(room.roomId))!.hostUserId).toBe(alice);
    expect(changed).toEqual([room.roomId]);
  });

  it('keeps the host while a game is running', async () => {
    const room = await aliceRoom();
    await service.join(room.roomId, { token: room.token, name: 'Bob' }, bob);
    await service.start(alice, room.roomId);
    await service.seatAway(room.roomId, hashSecret(room.seat.credentials));
    expect((await repo.findRoom(room.roomId))!.hostUserId).toBe(alice);
  });

  it('the new host runs the room; the old one no longer can', async () => {
    const room = await aliceRoom('party');
    await service.join(room.roomId, { token: room.token, name: 'Bob' }, bob);
    away.add(hashSecret(room.seat.credentials));
    await service.seatAway(room.roomId, hashSecret(room.seat.credentials));
    await failsWith(service.regenerateInvite(alice, room.roomId), 'not_found');
    await expect(service.regenerateInvite(bob, room.roomId)).resolves.toBeDefined();
    await failsWith(service.freeSeat(bob, room.roomId, 1), 'forbidden'); // Bob's own seat
    await service.freeSeat(bob, room.roomId, 0); // the old host's seat
    expect((await service.listRooms(bob)).rooms).toHaveLength(1);
  });
});

describe('leave', () => {
  it('a guest frees their own seat', async () => {
    const room = await aliceRoom();
    const gus = await service.join(room.roomId, { token: room.token, name: 'Gus' });
    await service.leave(room.roomId, gus.credentials);
    expect(await repo.listSeats(room.roomId)).toHaveLength(1);
    expect(revoked).toEqual([`${room.roomId}:1`]);
    await failsWith(service.lobby(room.roomId, gus.credentials), 'not_found');
  });

  it('the host hands the room over and leaves', async () => {
    const room = await aliceRoom();
    await service.join(room.roomId, { token: room.token, name: 'Bob' }, bob);
    await service.leave(room.roomId, room.seat.credentials);
    expect((await repo.findRoom(room.roomId))!.hostUserId).toBe(bob);
    expect((await repo.listSeats(room.roomId)).map((s) => s.name)).toEqual(['Bob']);
  });

  it('the host leaving with no one to take over closes the room', async () => {
    const room = await aliceRoom();
    await service.join(room.roomId, { token: room.token, name: 'Gus' });
    await service.leave(room.roomId, room.seat.credentials);
    expect(await repo.findRoom(room.roomId)).toBeUndefined();
    expect(closed).toEqual([room.roomId]);
  });

  it('answers not_found for unknown credentials or another room', async () => {
    const room = await aliceRoom();
    const other = await aliceRoom();
    await failsWith(service.leave(room.roomId, newSecret()), 'not_found');
    await failsWith(service.leave(other.roomId, room.seat.credentials), 'not_found');
    expect(await repo.listSeats(room.roomId)).toHaveLength(1);
  });
});
