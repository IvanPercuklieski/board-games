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
import { beforeEach, describe, expect, it } from 'vitest';
import { hashSecret, newRoomId, newSecret } from '../secrets';
import { MemoryRoomsRepository } from '../testing/memory-rooms-repository';
import { MemoryStorage } from '../testing/memory-storage';
import { ApiFailure, RoomsService } from './rooms-service';

const ORIGIN = 'https://board-table.example';

let storage: MemoryStorage;
let repo: MemoryRoomsRepository;
let service: RoomsService;
let alice: string;
let bob: string;

beforeEach(() => {
  storage = new MemoryStorage();
  repo = new MemoryRoomsRepository(storage);
  service = new RoomsService({ repo, publicOrigin: ORIGIN });
  alice = randomUUID();
  bob = randomUUID();
  repo.addProfile(alice, 'Alice');
  repo.addProfile(bob, 'Bob');
});

async function failsWith(promise: Promise<unknown>, code: ApiErrorCode) {
  await expect(promise).rejects.toThrow(ApiFailure);
  await promise.catch((e: ApiFailure) => expect(e.code).toBe(code));
}

/** Creates a room for Alice and returns its id plus the invite token from the link. */
async function aliceRoom(maxSeats = 2) {
  const created = await service.createRoom(alice, { gameId: 'tictactoe', maxSeats });
  const token = new URL(created.inviteUrl).hash.replace('#t=', '');
  return { ...created, token };
}

describe('createRoom', () => {
  it('creates a room with the host in seat 0 and an invite link', async () => {
    const created = await service.createRoom(alice, { gameId: 'tictactoe', maxSeats: 2 });
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
    const created = await service.createRoom(bob, { gameId: 'tictactoe', maxSeats: 2 });
    const [seat] = await repo.listSeats(created.roomId);
    expect(seat!.name).toBe('B'.repeat(LIMITS.playerNameMaxLength));
  });

  it('refuses users without a profile', async () => {
    await failsWith(
      service.createRoom(randomUUID(), { gameId: 'tictactoe', maxSeats: 2 }),
      'forbidden',
    );
  });

  it('refuses unknown games and seat counts outside the game limits', async () => {
    await failsWith(
      service.createRoom(alice, { gameId: 'chess', maxSeats: 2 }),
      'validation_error',
    );
    await failsWith(
      service.createRoom(alice, { gameId: 'tictactoe', maxSeats: 1 }),
      'validation_error',
    );
    await failsWith(
      service.createRoom(alice, { gameId: 'tictactoe', maxSeats: 3 }),
      'validation_error',
    );
  });

  it(`allows at most ${LIMITS.maxActiveRoomsPerHost} active rooms per host`, async () => {
    for (let i = 0; i < LIMITS.maxActiveRoomsPerHost; i++) await aliceRoom();
    await failsWith(
      service.createRoom(alice, { gameId: 'tictactoe', maxSeats: 2 }),
      'limit_reached',
    );
    // other hosts are unaffected
    await expect(
      service.createRoom(bob, { gameId: 'tictactoe', maxSeats: 2 }),
    ).resolves.toBeDefined();
  });
});

describe('listRooms', () => {
  it("lists only the host's rooms with their seats", async () => {
    const room = await aliceRoom();
    await service.join(room.roomId, { token: room.token, name: 'Bob' });
    await service.createRoom(bob, { gameId: 'tictactoe', maxSeats: 2 });

    const list = await service.listRooms(alice);
    expect(listRoomsResponseSchema.parse(list)).toEqual(list);
    expect(list.rooms).toHaveLength(1);
    expect(list.rooms[0]).toMatchObject({
      roomId: room.roomId,
      gameId: 'tictactoe',
      status: 'waiting',
      maxSeats: 2,
      seats: [
        { seatIndex: 0, name: 'Alice', isHost: true },
        { seatIndex: 1, name: 'Bob', isHost: false },
      ],
    });
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
    const room = await aliceRoom(2);
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
    const room = await aliceRoom(2);
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
    const room = await aliceRoom(2);
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
    const room = await aliceRoom(2);
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
    const room = await aliceRoom(2);
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
      playerID: '1',
    });
  });

  it('refuses to free the host seat, unknown seats, or seats in rooms of others', async () => {
    const room = await aliceRoom(2);
    await failsWith(service.freeSeat(alice, room.roomId, 0), 'forbidden');
    await failsWith(service.freeSeat(alice, room.roomId, 1), 'not_found');
    await service.join(room.roomId, { token: room.token, name: 'Bob' });
    await failsWith(service.freeSeat(bob, room.roomId, 1), 'not_found');
  });

  it('closes a room with its seats and match', async () => {
    const room = await aliceRoom(2);
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
    const room = await aliceRoom(2);
    const reclaimed = await service.reclaimHostSeat(alice, room.roomId);
    expect(reclaimed.seatIndex).toBe(0);
    expect(reclaimed.credentials).not.toBe(room.seat.credentials);
    await failsWith(service.lobby(room.roomId, room.seat.credentials), 'not_found');
    expect((await service.lobby(room.roomId, reclaimed.credentials)).you.seatIndex).toBe(0);
  });

  it('answers not_found to anyone but the host', async () => {
    const room = await aliceRoom(2);
    await failsWith(service.reclaimHostSeat(bob, room.roomId), 'not_found');
    await failsWith(service.reclaimHostSeat(alice, newRoomId()), 'not_found');
  });
});

describe('lobby', () => {
  it('shows seats and the caller, and the playerID once started', async () => {
    const room = await aliceRoom(2);
    const bobSeat = await service.join(room.roomId, { token: room.token, name: 'Bob' });

    const waiting = await service.lobby(room.roomId, bobSeat.credentials);
    expect(lobbyResponseSchema.parse(waiting)).toEqual({
      roomId: room.roomId,
      gameId: 'tictactoe',
      status: 'waiting',
      maxSeats: 2,
      seats: [
        { seatIndex: 0, name: 'Alice', isHost: true },
        { seatIndex: 1, name: 'Bob', isHost: false },
      ],
      you: { seatIndex: 1 },
    });

    await service.start(alice, room.roomId);
    const playing = await service.lobby(room.roomId, room.seat.credentials);
    expect(playing).toMatchObject({ status: 'playing', you: { seatIndex: 0, playerID: '0' } });
  });

  it('answers not_found for unknown credentials or another room', async () => {
    const room = await aliceRoom(2);
    const other = await aliceRoom(2);
    await failsWith(service.lobby(room.roomId, newSecret()), 'not_found');
    await failsWith(service.lobby(other.roomId, room.seat.credentials), 'not_found');
  });
});
