import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildMatch } from '../matches';
import { newRoomId } from '../secrets';
import type { GameStorage } from '../storage/game-storage';
import type { NewRoom, RoomsRepository } from './rooms-repository';

export interface RoomsRepositoryFixture {
  repo: RoomsRepository;
  storage: GameStorage;
  /** Creates a user with a profile and returns its id. */
  createHost(displayName: string): Promise<string>;
  cleanup(): Promise<void>;
}

/** Shared behaviour every RoomsRepository implementation must satisfy. */
export function describeRoomsRepositoryContract(
  name: string,
  setup: () => Promise<RoomsRepositoryFixture>,
) {
  describe(`${name} rooms repository contract`, () => {
    let repo: RoomsRepository;
    let storage: GameStorage;
    let fixture: RoomsRepositoryFixture;
    let alice: string;
    let bob: string;

    beforeAll(async () => {
      fixture = await setup();
      ({ repo, storage } = fixture);
      alice = await fixture.createHost('Alice');
      bob = await fixture.createHost('Bob');
    });
    afterAll(() => fixture.cleanup());

    const newRoom = (host: string, maxSeats = 2): NewRoom => ({
      id: newRoomId(),
      gameId: 'tictactoe',
      hostUserId: host,
      maxSeats,
      inviteTokenHash: `invite-${Math.random()}`,
    });
    const hostSeat = (host: string) => ({
      name: 'Host',
      userId: host,
      credentialsHash: `h-${host}`,
    });
    const guest = (name: string) => ({ name, credentialsHash: `hash-${name}` });

    async function createRoom(host: string, maxSeats = 2) {
      const room = newRoom(host, maxSeats);
      expect(await repo.createRoom(room, hostSeat(host), 100)).toBe('created');
      return room;
    }

    it('finds profiles by user id', async () => {
      expect(await repo.findProfile(alice)).toEqual({ displayName: 'Alice' });
      expect(await repo.findProfile('99999999-9999-9999-9999-999999999999')).toBeUndefined();
    });

    it('creates a waiting room with the host in seat 0', async () => {
      const room = await createRoom(alice);
      const stored = await repo.findRoom(room.id);
      expect(stored).toMatchObject({ ...room, status: 'waiting' });
      expect(stored!.createdAt).toBeInstanceOf(Date);
      expect(stored!.lastActivityAt).toBeInstanceOf(Date);
      expect(await repo.listSeats(room.id)).toEqual([
        { seatIndex: 0, name: 'Host', userId: alice, credentialsHash: `h-${alice}` },
      ]);
    });

    it('returns undefined for unknown rooms', async () => {
      expect(await repo.findRoom(newRoomId())).toBeUndefined();
      expect(await repo.listSeats(newRoomId())).toEqual([]);
    });

    it('refuses to create more rooms than the per-host limit, even concurrently', async () => {
      const carol = await fixture.createHost('Carol');
      const results = await Promise.all(
        Array.from({ length: 6 }, () => repo.createRoom(newRoom(carol), hostSeat(carol), 3)),
      );
      expect(results.filter((r) => r === 'created')).toHaveLength(3);
      expect(results.filter((r) => r === 'limit_reached')).toHaveLength(3);
      expect(await repo.listRoomsByHost(carol)).toHaveLength(3);
    });

    it('lists rooms per host, newest first', async () => {
      const first = await createRoom(bob);
      const second = await createRoom(bob);
      const ids = (await repo.listRoomsByHost(bob)).map((r) => r.id);
      expect(ids.indexOf(second.id)).toBeLessThan(ids.indexOf(first.id));
      expect((await repo.listRoomsByHost(alice)).map((r) => r.id)).not.toContain(first.id);
    });

    it('gives guests the lowest free seat and refuses when full', async () => {
      const room = await createRoom(alice, 3);
      expect(await repo.takeFreeSeat(room.id, guest('Bob'))).toBe(1);
      expect(await repo.takeFreeSeat(room.id, guest('Carol'))).toBe(2);
      expect(await repo.takeFreeSeat(room.id, guest('Dave'))).toBeUndefined();
      expect((await repo.listSeats(room.id)).map((s) => s.name)).toEqual(['Host', 'Bob', 'Carol']);
    });

    it('never gives the same seat to simultaneous joins', async () => {
      const room = await createRoom(alice, 3);
      const results = await Promise.all(
        ['A', 'B', 'C', 'D', 'E'].map((n) => repo.takeFreeSeat(room.id, guest(n))),
      );
      expect(results.filter((r) => r !== undefined).sort()).toEqual([1, 2]);
      expect(await repo.listSeats(room.id)).toHaveLength(3);
    });

    it('reuses a freed seat', async () => {
      const room = await createRoom(alice, 3);
      await repo.takeFreeSeat(room.id, guest('Bob'));
      await repo.takeFreeSeat(room.id, guest('Carol'));
      expect(await repo.freeSeat(room.id, 1)).toBe(true);
      expect(await repo.freeSeat(room.id, 1)).toBe(false);
      expect(await repo.takeFreeSeat(room.id, guest('Dave'))).toBe(1);
    });

    it('finds a seat by its credentials hash, only within that room', async () => {
      const room = await createRoom(alice);
      const other = await createRoom(alice);
      await repo.takeFreeSeat(room.id, guest('Bob'));
      expect(await repo.findSeatByCredentialsHash(room.id, 'hash-Bob')).toMatchObject({
        seatIndex: 1,
        name: 'Bob',
      });
      expect(await repo.findSeatByCredentialsHash(other.id, 'hash-Bob')).toBeUndefined();
      expect(await repo.findSeatByCredentialsHash(room.id, 'nope')).toBeUndefined();
    });

    it('replaces the invite token hash', async () => {
      const room = await createRoom(alice);
      await repo.setInviteTokenHash(room.id, 'new-hash');
      expect((await repo.findRoom(room.id))!.inviteTokenHash).toBe('new-hash');
    });

    /** Runs `change` and expects it to move the room's last activity forward. */
    async function expectActivity(roomId: string, change: () => Promise<unknown>) {
      const before = (await repo.findRoom(roomId))!.lastActivityAt;
      await new Promise((r) => setTimeout(r, 20));
      await change();
      expect((await repo.findRoom(roomId))!.lastActivityAt.getTime()).toBeGreaterThan(
        before.getTime(),
      );
    }

    it('touch moves last activity forward', async () => {
      const room = await createRoom(alice);
      await expectActivity(room.id, () => repo.touch(room.id));
    });

    it('counts joining, freeing a seat and a new invite link as activity', async () => {
      const room = await createRoom(alice);
      await expectActivity(room.id, () => repo.takeFreeSeat(room.id, guest('Bob')));
      await expectActivity(room.id, () => repo.freeSeat(room.id, 1));
      await expectActivity(room.id, () => repo.setInviteTokenHash(room.id, 'newer-hash'));
    });

    describe('starting a room', () => {
      it('compacts seats, locks the seat count and stores the match', async () => {
        const room = await createRoom(alice, 3);
        await repo.takeFreeSeat(room.id, guest('Bob'));
        await repo.takeFreeSeat(room.id, guest('Carol'));
        await repo.freeSeat(room.id, 1); // seats 0 and 2 remain

        let builtFrom: unknown;
        const result = await repo.startRoom(room.id, (seats) => {
          builtFrom = seats;
          return buildMatch('tictactoe', seats);
        });

        expect(result).toBe('started');
        expect(builtFrom).toEqual([
          { name: 'Host', credentialsHash: `h-${alice}` },
          { name: 'Carol', credentialsHash: 'hash-Carol' },
        ]);
        expect(await repo.findRoom(room.id)).toMatchObject({ status: 'playing', maxSeats: 2 });
        expect((await repo.listSeats(room.id)).map((s) => [s.seatIndex, s.name])).toEqual([
          [0, 'Host'],
          [1, 'Carol'],
        ]);
        const { metadata } = await storage.fetch(room.id, { metadata: true });
        expect(metadata.players[1]).toMatchObject({ name: 'Carol', credentials: 'hash-Carol' });
      });

      it('starts only once', async () => {
        const room = await createRoom(alice);
        await repo.takeFreeSeat(room.id, guest('Bob'));
        const build = (seats: Parameters<typeof buildMatch>[1]) => buildMatch('tictactoe', seats);
        expect(await repo.startRoom(room.id, build)).toBe('started');
        expect(await repo.startRoom(room.id, build)).toBe('not_waiting');
        expect(await repo.startRoom(newRoomId(), build)).toBe('not_waiting');
      });

      it('changes nothing when building the match fails', async () => {
        const room = await createRoom(alice); // only the host: too few players
        await expect(
          repo.startRoom(room.id, (seats) => buildMatch('tictactoe', seats)),
        ).rejects.toThrow();
        expect(await repo.findRoom(room.id)).toMatchObject({ status: 'waiting', maxSeats: 2 });
        expect((await storage.fetch(room.id, { metadata: true })).metadata).toBeUndefined();
      });

      it('keeps the match players in sync when seats are freed and retaken', async () => {
        const room = await createRoom(alice);
        await repo.takeFreeSeat(room.id, guest('Bob'));
        await repo.startRoom(room.id, (seats) => buildMatch('tictactoe', seats));

        await repo.freeSeat(room.id, 1);
        expect((await storage.fetch(room.id, { metadata: true })).metadata.players[1]).toEqual({
          id: 1,
        });
        expect(await repo.takeFreeSeat(room.id, guest('Eve'))).toBe(1);
        expect(
          (await storage.fetch(room.id, { metadata: true })).metadata.players[1],
        ).toMatchObject({ name: 'Eve', credentials: 'hash-Eve' });
      });
    });

    describe('replacing seat credentials (host on a new device)', () => {
      it('swaps the stored hash; the old one no longer finds the seat', async () => {
        const room = await createRoom(alice);
        expect(await repo.replaceSeatCredentials(room.id, 0, 'new-host-hash')).toBe(true);
        expect(await repo.findSeatByCredentialsHash(room.id, `h-${alice}`)).toBeUndefined();
        expect(await repo.findSeatByCredentialsHash(room.id, 'new-host-hash')).toMatchObject({
          seatIndex: 0,
          name: 'Host',
          userId: alice,
        });
      });

      it('also updates a running match', async () => {
        const room = await createRoom(alice);
        await repo.takeFreeSeat(room.id, guest('Bob'));
        await repo.startRoom(room.id, (seats) => buildMatch('tictactoe', seats));
        await repo.replaceSeatCredentials(room.id, 0, 'new-host-hash');
        const { metadata } = await storage.fetch(room.id, { metadata: true });
        expect(metadata.players[0]).toMatchObject({ name: 'Host', credentials: 'new-host-hash' });
      });

      it('returns false for an unknown room or seat', async () => {
        const room = await createRoom(alice);
        expect(await repo.replaceSeatCredentials(room.id, 1, 'x')).toBe(false);
        expect(await repo.replaceSeatCredentials(newRoomId(), 0, 'x')).toBe(false);
      });
    });

    it('deletes a room with its seats and match', async () => {
      const room = await createRoom(alice);
      await repo.takeFreeSeat(room.id, guest('Bob'));
      await repo.startRoom(room.id, (seats) => buildMatch('tictactoe', seats));
      await repo.deleteRoom(room.id);
      expect(await repo.findRoom(room.id)).toBeUndefined();
      expect(await repo.listSeats(room.id)).toEqual([]);
      expect((await storage.fetch(room.id, { state: true })).state).toBeUndefined();
    });

    describe('finishing a game', () => {
      async function startedRoom() {
        const room = await createRoom(alice, 3);
        await repo.takeFreeSeat(room.id, guest('Bob'));
        await repo.startRoom(room.id, (seats) => buildMatch('tictactoe', seats));
        return room;
      }

      it('deletes the match and opens the room again with the same seats and link', async () => {
        const room = await startedRoom();
        const seats = await repo.listSeats(room.id);
        await expectActivity(room.id, async () =>
          expect(await repo.finishGame(room.id)).toBe(true),
        );
        expect(await repo.findRoom(room.id)).toMatchObject({
          status: 'waiting',
          maxSeats: 2,
          inviteTokenHash: room.inviteTokenHash,
        });
        expect(await repo.listSeats(room.id)).toEqual(seats);
        expect((await storage.fetch(room.id, { state: true })).state).toBeUndefined();
      });

      it('lets the room start a new game under the same match id', async () => {
        const room = await startedRoom();
        await repo.finishGame(room.id);
        expect(await repo.startRoom(room.id, (s) => buildMatch('tictactoe', s))).toBe('started');
        const { state } = await storage.fetch(room.id, { state: true });
        expect(state.ctx.gameover).toBeUndefined();
        expect(state._stateID).toBe(0);
      });

      it('deletes a match that has no room and returns false', async () => {
        const id = newRoomId();
        await storage.createMatch(id, buildMatch('tictactoe', [guest('A'), guest('B')]));
        expect(await repo.finishGame(id)).toBe(false);
        expect((await storage.fetch(id, { state: true })).state).toBeUndefined();
      });
    });

    it('lists stale rooms with separate idle limits for waiting and playing rooms', async () => {
      const waiting = await createRoom(alice);
      const playing = await createRoom(alice);
      await repo.takeFreeSeat(playing.id, guest('Bob'));
      await repo.startRoom(playing.id, (seats) => buildMatch('tictactoe', seats));
      const inFuture = new Date(Date.now() + 60_000);
      const inPast = new Date(Date.now() - 60_000);

      const waitingStale = await repo.listStaleRoomIds({
        waitingBefore: inFuture,
        playingBefore: inPast,
      });
      expect(waitingStale).toContain(waiting.id);
      expect(waitingStale).not.toContain(playing.id);

      const playingStale = await repo.listStaleRoomIds({
        waitingBefore: inPast,
        playingBefore: inFuture,
      });
      expect(playingStale).toContain(playing.id);
      expect(playingStale).not.toContain(waiting.id);
    });
  });
}
