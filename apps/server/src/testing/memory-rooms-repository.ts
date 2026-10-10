import type {
  MatchBuilder,
  NewRoom,
  NewSeat,
  RoomRecord,
  RoomsRepository,
  SeatRecord,
  StaleCutoffs,
} from '../rooms/rooms-repository';
import type { GameStorage } from '../storage/game-storage';

interface StoredRoom extends RoomRecord {
  /** Insertion order, to keep "newest first" stable within the same millisecond. */
  seq: number;
}

/**
 * In-memory RoomsRepository for unit tests (same contract as PostgresRoomsRepository).
 * Each method mutates state synchronously before its first await, so it is atomic.
 */
export class MemoryRoomsRepository implements RoomsRepository {
  private readonly profiles = new Map<string, string>();
  private readonly rooms = new Map<string, StoredRoom>();
  private readonly seats = new Map<string, SeatRecord[]>();
  private seq = 0;

  constructor(private readonly storage: GameStorage) {}

  addProfile(userId: string, displayName: string) {
    this.profiles.set(userId, displayName);
  }

  /** Test helper: pretend the room was last active at `date`. */
  setLastActivity(roomId: string, date: Date) {
    const room = this.rooms.get(roomId);
    if (room) room.lastActivityAt = date;
  }

  async findProfile(userId: string) {
    const displayName = this.profiles.get(userId);
    return displayName === undefined ? undefined : { displayName };
  }

  async createRoom(room: NewRoom, hostSeat: NewSeat, maxRoomsPerHost: number) {
    const hosted = [...this.rooms.values()].filter((r) => r.hostUserId === room.hostUserId);
    if (hosted.length >= maxRoomsPerHost) return 'limit_reached' as const;
    const now = new Date();
    this.rooms.set(room.id, {
      ...room,
      status: 'waiting',
      createdAt: now,
      lastActivityAt: now,
      seq: this.seq++,
    });
    this.seats.set(room.id, [toSeat(0, hostSeat)]);
    return 'created' as const;
  }

  async findRoom(roomId: string) {
    const room = this.rooms.get(roomId);
    return room && toRecord(room);
  }

  async listRoomsByHost(hostUserId: string) {
    return [...this.rooms.values()]
      .filter((r) => r.hostUserId === hostUserId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.seq - a.seq)
      .map(toRecord);
  }

  async listSeats(roomId: string) {
    return this.seatsOf(roomId).map((s) => ({ ...s }));
  }

  async findSeatByCredentialsHash(roomId: string, hash: string) {
    const seat = this.seatsOf(roomId).find((s) => s.credentialsHash === hash);
    return seat && { ...seat };
  }

  async takeFreeSeat(roomId: string, seat: NewSeat) {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    const seats = this.seatsOf(roomId);
    const taken = new Set(seats.map((s) => s.seatIndex));
    const free = Array.from({ length: room.maxSeats }, (_, i) => i).find((i) => !taken.has(i));
    if (free === undefined) return undefined;
    seats.push(toSeat(free, seat));
    seats.sort((a, b) => a.seatIndex - b.seatIndex);
    room.lastActivityAt = new Date();
    if (room.status === 'playing') {
      await this.storage.setPlayerSeat(roomId, free, {
        name: seat.name,
        credentialsHash: seat.credentialsHash,
      });
    }
    return free;
  }

  async freeSeat(roomId: string, seatIndex: number) {
    const room = this.rooms.get(roomId);
    const seats = this.seatsOf(roomId);
    const index = seats.findIndex((s) => s.seatIndex === seatIndex);
    if (!room || index === -1) return false;
    seats.splice(index, 1);
    room.lastActivityAt = new Date();
    if (room.status === 'playing') await this.storage.setPlayerSeat(roomId, seatIndex, undefined);
    return true;
  }

  async setInviteTokenHash(roomId: string, hash: string) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.inviteTokenHash = hash;
    room.lastActivityAt = new Date();
  }

  async replaceSeatCredentials(roomId: string, seatIndex: number, credentialsHash: string) {
    const room = this.rooms.get(roomId);
    const seat = this.seatsOf(roomId).find((s) => s.seatIndex === seatIndex);
    if (!room || !seat) return false;
    seat.credentialsHash = credentialsHash;
    if (room.status === 'playing') {
      await this.storage.setPlayerSeat(roomId, seatIndex, { name: seat.name, credentialsHash });
    }
    return true;
  }

  async startRoom(roomId: string, build: MatchBuilder) {
    const room = this.rooms.get(roomId);
    if (room?.status !== 'waiting') return 'not_waiting' as const;
    const seats = this.seatsOf(roomId);
    const match = build(seats.map((s) => ({ name: s.name, credentialsHash: s.credentialsHash })));

    this.seats.set(
      roomId,
      seats.map((s, index) => ({ ...s, seatIndex: index })),
    );
    room.status = 'playing';
    room.maxSeats = seats.length;
    room.lastActivityAt = new Date();
    await this.storage.createMatch(roomId, match);
    return 'started' as const;
  }

  async touch(roomId: string) {
    const room = this.rooms.get(roomId);
    if (room) room.lastActivityAt = new Date();
  }

  async finishGame(roomId: string) {
    const room = this.rooms.get(roomId);
    if (room) {
      room.status = 'waiting';
      room.lastActivityAt = new Date();
    }
    await this.storage.wipe(roomId);
    return room !== undefined;
  }

  async deleteRoom(roomId: string) {
    this.rooms.delete(roomId);
    this.seats.delete(roomId);
    await this.storage.wipe(roomId);
  }

  async listStaleRoomIds({ waitingBefore, playingBefore }: StaleCutoffs) {
    const cutoff = { waiting: waitingBefore, playing: playingBefore };
    return [...this.rooms.values()]
      .filter((r) => r.lastActivityAt.getTime() < cutoff[r.status].getTime())
      .map((r) => r.id);
  }

  private seatsOf(roomId: string): SeatRecord[] {
    return this.seats.get(roomId) ?? [];
  }
}

const toSeat = (seatIndex: number, seat: NewSeat): SeatRecord => ({
  seatIndex,
  name: seat.name,
  userId: seat.userId ?? null,
  credentialsHash: seat.credentialsHash,
});

const toRecord = ({ seq: _seq, ...room }: StoredRoom): RoomRecord => ({ ...room });
