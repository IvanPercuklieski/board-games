import type { RoomStatus } from '@board-table/shared';
import type { Sql, Tx } from '../db';
import { insertMatchInDb, setPlayerSeatInDb } from '../storage/postgres-storage';
import type {
  HandOverResult,
  MatchBuilder,
  NewRoom,
  NewSeat,
  RoomRecord,
  RoomsRepository,
  SeatRecord,
  StaleCutoffs,
} from './rooms-repository';

interface RoomRow {
  id: string;
  game_id: string;
  host_user_id: string;
  max_seats: number;
  status: RoomStatus;
  invite_token_hash: string;
  created_at: Date;
  last_activity_at: Date;
}

interface SeatRow {
  seat_index: number;
  name: string;
  user_id: string | null;
  credentials_hash: string;
}

const toRoom = (r: RoomRow): RoomRecord => ({
  id: r.id,
  gameId: r.game_id,
  hostUserId: r.host_user_id,
  maxSeats: r.max_seats,
  status: r.status,
  inviteTokenHash: r.invite_token_hash,
  createdAt: r.created_at,
  lastActivityAt: r.last_activity_at,
});

const toSeat = (r: SeatRow): SeatRecord => ({
  seatIndex: r.seat_index,
  name: r.name,
  userId: r.user_id,
  credentialsHash: r.credentials_hash,
});

/** Rooms and seats in Supabase Postgres (server-only tables), sharing the server's pool. */
export class PostgresRoomsRepository implements RoomsRepository {
  constructor(private readonly sql: Sql) {}

  async findProfile(userId: string) {
    const [row] = await this.sql<{ display_name: string }[]>`
      select display_name from public.profiles where id = ${userId}`;
    return row && { displayName: row.display_name };
  }

  createRoom(room: NewRoom, hostSeat: NewSeat, maxRoomsPerHost: number) {
    return this.sql.begin(async (tx): Promise<'created' | 'limit_reached'> => {
      // Lock the host's profile so concurrent creates for the same host are serialized.
      await tx`select id from public.profiles where id = ${room.hostUserId} for update`;
      const [hosted] = await tx<{ n: number }[]>`
        select count(*)::int as n from public.rooms where host_user_id = ${room.hostUserId}`;
      if ((hosted?.n ?? 0) >= maxRoomsPerHost) return 'limit_reached';
      await tx`
        insert into public.rooms (id, game_id, host_user_id, max_seats, invite_token_hash)
        values (${room.id}, ${room.gameId}, ${room.hostUserId}, ${room.maxSeats},
                ${room.inviteTokenHash})`;
      await insertSeat(tx, room.id, 0, hostSeat);
      return 'created';
    });
  }

  async findRoom(roomId: string) {
    const [row] = await this.sql<RoomRow[]>`select * from public.rooms where id = ${roomId}`;
    return row && toRoom(row);
  }

  async listRoomsByHost(hostUserId: string) {
    const rows = await this.sql<RoomRow[]>`
      select * from public.rooms where host_user_id = ${hostUserId} order by created_at desc`;
    return rows.map(toRoom);
  }

  async listSeats(roomId: string) {
    return (await selectSeats(this.sql, roomId)).map(toSeat);
  }

  async findSeatByCredentialsHash(roomId: string, hash: string) {
    const [row] = await this.sql<SeatRow[]>`
      select seat_index, name, user_id, credentials_hash from public.room_seats
      where room_id = ${roomId} and credentials_hash = ${hash}`;
    return row && toSeat(row);
  }

  takeFreeSeat(roomId: string, seat: NewSeat) {
    return this.sql.begin(async (tx) => {
      const room = await lockRoom(tx, roomId);
      if (!room) return undefined;
      const seats = await selectSeats(tx, roomId);
      if (seat.userId && seats.some((s) => s.user_id === seat.userId)) return 'already_seated';
      const taken = new Set(seats.map((s) => s.seat_index));
      const free = Array.from({ length: room.max_seats }, (_, i) => i).find((i) => !taken.has(i));
      if (free === undefined) return undefined;
      await insertSeat(tx, roomId, free, seat);
      await touchInTx(tx, roomId);
      if (room.status === 'playing') {
        await setPlayerSeatInDb(tx, roomId, free, {
          name: seat.name,
          credentialsHash: seat.credentialsHash,
        });
      }
      return free;
    });
  }

  freeSeat(roomId: string, seatIndex: number) {
    return this.sql.begin(async (tx) => {
      const room = await lockRoom(tx, roomId);
      if (!room) return false;
      const deleted = await tx`
        delete from public.room_seats where room_id = ${roomId} and seat_index = ${seatIndex}
        returning seat_index`;
      if (deleted.length === 0) return false;
      await touchInTx(tx, roomId);
      if (room.status === 'playing') await setPlayerSeatInDb(tx, roomId, seatIndex, undefined);
      return true;
    });
  }

  replaceSeatCredentials(roomId: string, seatIndex: number, credentialsHash: string) {
    return this.sql.begin(async (tx) => {
      const room = await lockRoom(tx, roomId);
      if (!room) return false;
      const [seat] = await tx<{ name: string }[]>`
        update public.room_seats set credentials_hash = ${credentialsHash}
        where room_id = ${roomId} and seat_index = ${seatIndex}
        returning name`;
      if (!seat) return false;
      if (room.status === 'playing') {
        await setPlayerSeatInDb(tx, roomId, seatIndex, { name: seat.name, credentialsHash });
      }
      return true;
    });
  }

  replaceAccountSeatCredentials(roomId: string, userId: string, credentialsHash: string) {
    return this.sql.begin(async (tx) => {
      const room = await lockRoom(tx, roomId);
      if (!room) return undefined;
      const [seat] = await tx<SeatRow[]>`
        select seat_index, name, user_id, credentials_hash from public.room_seats
        where room_id = ${roomId} and user_id = ${userId}`;
      if (!seat) return undefined;
      await tx`
        update public.room_seats set credentials_hash = ${credentialsHash}
        where room_id = ${roomId} and seat_index = ${seat.seat_index}`;
      if (room.status === 'playing') {
        await setPlayerSeatInDb(tx, roomId, seat.seat_index, { name: seat.name, credentialsHash });
      }
      return { seatIndex: seat.seat_index, previousCredentialsHash: seat.credentials_hash };
    });
  }

  handOverHost(roomId: string, fromUserId: string, candidates: string[], maxRoomsPerHost: number) {
    return this.sql.begin(async (tx): Promise<HandOverResult> => {
      const [room] = await tx<{ host_user_id: string }[]>`
        select host_user_id from public.rooms where id = ${roomId} for update`;
      if (room?.host_user_id !== fromUserId) return { outcome: 'unchanged' };
      const seated = new Set((await selectSeats(tx, roomId)).map((s) => s.user_id));
      for (const candidate of candidates) {
        if (!seated.has(candidate)) continue;
        // Same lock as createRoom, so the per-host room limit holds under concurrency.
        await tx`select id from public.profiles where id = ${candidate} for update`;
        const [hosted] = await tx<{ n: number }[]>`
          select count(*)::int as n from public.rooms where host_user_id = ${candidate}`;
        if ((hosted?.n ?? 0) >= maxRoomsPerHost) continue;
        await tx`
          update public.rooms set host_user_id = ${candidate}, last_activity_at = now()
          where id = ${roomId}`;
        return { outcome: 'handed_over', hostUserId: candidate };
      }
      await tx`delete from bgio.matches where match_id = ${roomId}`;
      await tx`delete from public.rooms where id = ${roomId}`; // seats cascade
      return { outcome: 'deleted' };
    });
  }

  async setInviteTokenHash(roomId: string, hash: string) {
    await this.sql`
      update public.rooms set invite_token_hash = ${hash}, last_activity_at = now()
      where id = ${roomId}`;
  }

  startRoom(roomId: string, build: MatchBuilder) {
    return this.sql.begin(async (tx): Promise<'started' | 'not_waiting'> => {
      const room = await lockRoom(tx, roomId);
      if (room?.status !== 'waiting') return 'not_waiting';
      const seats = await selectSeats(tx, roomId);
      const match = build(
        seats.map((s) => ({ name: s.name, credentialsHash: s.credentials_hash })),
      );

      await compactSeats(tx, roomId, seats);
      await tx`
        update public.rooms
        set status = 'playing', max_seats = ${seats.length}, last_activity_at = now()
        where id = ${roomId}`;
      await insertMatchInDb(tx, roomId, match);
      return 'started';
    });
  }

  updateRoomGame(roomId: string, gameId: string, maxSeats: number) {
    return this.sql.begin(async (tx): Promise<'updated' | 'not_waiting' | 'too_many_players'> => {
      const room = await lockRoom(tx, roomId);
      if (room?.status !== 'waiting') return 'not_waiting';
      const seats = await selectSeats(tx, roomId);
      if (seats.length > maxSeats) return 'too_many_players';
      await compactSeats(tx, roomId, seats);
      await tx`
        update public.rooms
        set game_id = ${gameId}, max_seats = ${maxSeats}, last_activity_at = now()
        where id = ${roomId}`;
      return 'updated';
    });
  }

  async touch(roomId: string) {
    await touchInTx(this.sql, roomId);
  }

  finishGame(roomId: string) {
    return this.sql.begin(async (tx) => {
      const room = await lockRoom(tx, roomId);
      await tx`delete from bgio.matches where match_id = ${roomId}`;
      if (!room) return false;
      await tx`
        update public.rooms set status = 'waiting', last_activity_at = now() where id = ${roomId}`;
      return true;
    });
  }

  async deleteRoom(roomId: string) {
    await this.sql.begin(async (tx) => {
      await tx`delete from bgio.matches where match_id = ${roomId}`;
      await tx`delete from public.rooms where id = ${roomId}`; // seats cascade
    });
  }

  async listStaleRoomIds({ waitingBefore, playingBefore }: StaleCutoffs) {
    const rows = await this.sql<{ id: string }[]>`
      select id from public.rooms
      where (status = 'waiting' and last_activity_at < ${waitingBefore})
         or (status = 'playing' and last_activity_at < ${playingBefore})`;
    return rows.map((r) => r.id);
  }
}

/** Locks the room row so seat changes and starting are serialized per room. */
async function lockRoom(tx: Tx, roomId: string) {
  const [row] = await tx<Pick<RoomRow, 'status' | 'max_seats'>[]>`
    select status, max_seats from public.rooms where id = ${roomId} for update`;
  return row;
}

async function touchInTx(sql: Sql | Tx, roomId: string) {
  await sql`update public.rooms set last_activity_at = now() where id = ${roomId}`;
}

function selectSeats(sql: Sql | Tx, roomId: string) {
  return sql<SeatRow[]>`
    select seat_index, name, user_id, credentials_hash from public.room_seats
    where room_id = ${roomId} order by seat_index`;
}

/** Renumbers seats 0..n-1 in their current order (delete + reinsert keeps the PK simple). */
async function compactSeats(tx: Tx, roomId: string, seats: SeatRow[]) {
  await tx`delete from public.room_seats where room_id = ${roomId}`;
  for (const [index, s] of seats.entries()) {
    await insertSeat(tx, roomId, index, {
      name: s.name,
      userId: s.user_id,
      credentialsHash: s.credentials_hash,
    });
  }
}

async function insertSeat(tx: Tx, roomId: string, seatIndex: number, seat: NewSeat) {
  await tx`
    insert into public.room_seats (room_id, seat_index, name, user_id, credentials_hash)
    values (${roomId}, ${seatIndex}, ${seat.name}, ${seat.userId ?? null}, ${seat.credentialsHash})`;
}
