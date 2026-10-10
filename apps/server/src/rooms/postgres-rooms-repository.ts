import type { RoomStatus } from '@board-table/shared';
import type { Sql, Tx } from '../db';
import { insertMatchInDb, setPlayerSeatInDb } from '../storage/postgres-storage';
import type {
  MatchBuilder,
  NewRoom,
  NewSeat,
  RoomRecord,
  RoomsRepository,
  SeatRecord,
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
      const taken = new Set((await selectSeats(tx, roomId)).map((s) => s.seat_index));
      const free = Array.from({ length: room.max_seats }, (_, i) => i).find((i) => !taken.has(i));
      if (free === undefined) return undefined;
      await insertSeat(tx, roomId, free, seat);
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
      if (room.status === 'playing') await setPlayerSeatInDb(tx, roomId, seatIndex, undefined);
      return true;
    });
  }

  async setInviteTokenHash(roomId: string, hash: string) {
    await this.sql`update public.rooms set invite_token_hash = ${hash} where id = ${roomId}`;
  }

  startRoom(roomId: string, build: MatchBuilder) {
    return this.sql.begin(async (tx): Promise<'started' | 'not_waiting'> => {
      const room = await lockRoom(tx, roomId);
      if (room?.status !== 'waiting') return 'not_waiting';
      const seats = await selectSeats(tx, roomId);
      const match = build(
        seats.map((s) => ({ name: s.name, credentialsHash: s.credentials_hash })),
      );

      // Renumber seats 0..n-1 in their current order (delete + reinsert keeps the PK simple).
      await tx`delete from public.room_seats where room_id = ${roomId}`;
      for (const [index, s] of seats.entries()) {
        await insertSeat(tx, roomId, index, {
          name: s.name,
          userId: s.user_id,
          credentialsHash: s.credentials_hash,
        });
      }
      await tx`
        update public.rooms
        set status = 'playing', max_seats = ${seats.length}, last_activity_at = now()
        where id = ${roomId}`;
      await insertMatchInDb(tx, roomId, match);
      return 'started';
    });
  }

  async touch(roomId: string) {
    await this.sql`update public.rooms set last_activity_at = now() where id = ${roomId}`;
  }

  async deleteRoom(roomId: string) {
    await this.sql.begin(async (tx) => {
      await tx`delete from bgio.matches where match_id = ${roomId}`;
      await tx`delete from public.rooms where id = ${roomId}`; // seats cascade
    });
  }

  async listRoomIdsInactiveSince(cutoff: Date) {
    const rows = await this.sql<{ id: string }[]>`
      select id from public.rooms where last_activity_at < ${cutoff}`;
    return rows.map((r) => r.id);
  }
}

/** Locks the room row so seat changes and starting are serialized per room. */
async function lockRoom(tx: Tx, roomId: string) {
  const [row] = await tx<Pick<RoomRow, 'status' | 'max_seats'>[]>`
    select status, max_seats from public.rooms where id = ${roomId} for update`;
  return row;
}

function selectSeats(sql: Sql | Tx, roomId: string) {
  return sql<SeatRow[]>`
    select seat_index, name, user_id, credentials_hash from public.room_seats
    where room_id = ${roomId} order by seat_index`;
}

async function insertSeat(tx: Tx, roomId: string, seatIndex: number, seat: NewSeat) {
  await tx`
    insert into public.room_seats (room_id, seat_index, name, user_id, credentials_hash)
    values (${roomId}, ${seatIndex}, ${seat.name}, ${seat.userId ?? null}, ${seat.credentialsHash})`;
}
