import type { RoomStatus } from '@board-table/shared';
import type { StorageAPI } from 'boardgame.io';
import type { MatchSeat } from '../storage/game-storage';

export interface RoomRecord {
  id: string;
  gameId: string;
  hostUserId: string;
  maxSeats: number;
  status: RoomStatus;
  inviteTokenHash: string;
  createdAt: Date;
  lastActivityAt: Date;
}

export interface SeatRecord {
  seatIndex: number;
  name: string;
  /** Set for the host's seat. */
  userId: string | null;
  credentialsHash: string;
}

export interface NewRoom {
  id: string;
  gameId: string;
  hostUserId: string;
  maxSeats: number;
  inviteTokenHash: string;
}

export interface NewSeat {
  name: string;
  userId?: string | null;
  credentialsHash: string;
}

export interface StaleCutoffs {
  waitingBefore: Date;
  playingBefore: Date;
}

/** Builds the boardgame.io match from the seats as they are at start time (inside the lock). */
export type MatchBuilder = (seats: MatchSeat[]) => StorageAPI.CreateMatchOpts;

/**
 * Persistence for rooms, seats and (at start/finish/delete) their boardgame.io match.
 * Every method that touches more than one row is atomic. Changes to a room (joining, freeing
 * a seat, a new invite link, starting or finishing a game) count as activity.
 */
export interface RoomsRepository {
  findProfile(userId: string): Promise<{ displayName: string } | undefined>;
  /**
   * Creates the room with the host in seat 0, unless the host already has
   * `maxRoomsPerHost` rooms. Atomic per host, so concurrent requests can't exceed the limit.
   */
  createRoom(
    room: NewRoom,
    hostSeat: NewSeat,
    maxRoomsPerHost: number,
  ): Promise<'created' | 'limit_reached'>;
  findRoom(roomId: string): Promise<RoomRecord | undefined>;
  /** Newest first. */
  listRoomsByHost(hostUserId: string): Promise<RoomRecord[]>;
  /** Ordered by seat index. */
  listSeats(roomId: string): Promise<SeatRecord[]>;
  findSeatByCredentialsHash(roomId: string, hash: string): Promise<SeatRecord | undefined>;
  /**
   * Puts the player into the lowest free seat below `maxSeats` and returns its index, or
   * `undefined` if none is free. Concurrent calls never get the same seat. In a started room
   * the boardgame.io match's player for that seat is updated in the same transaction.
   */
  takeFreeSeat(roomId: string, seat: NewSeat): Promise<number | undefined>;
  /** Frees a seat (and clears it in the match if started). False if there was no such seat. */
  freeSeat(roomId: string, seatIndex: number): Promise<boolean>;
  setInviteTokenHash(roomId: string, hash: string): Promise<void>;
  /**
   * Gives an existing seat new credentials (old ones stop working), also in a started match.
   * False if there is no such seat.
   */
  replaceSeatCredentials(
    roomId: string,
    seatIndex: number,
    credentialsHash: string,
  ): Promise<boolean>;
  /**
   * Starts a waiting room: renumbers the seats to 0..n-1 (keeping their order), sets
   * `maxSeats` to n, marks it `playing` and stores the match built by `build`. If `build`
   * throws, nothing changes and the error is rethrown.
   */
  startRoom(roomId: string, build: MatchBuilder): Promise<'started' | 'not_waiting'>;
  touch(roomId: string): Promise<void>;
  /**
   * The game is over: deletes the boardgame.io match and puts the room back to `waiting`
   * with its seats, seat count and invite link, so the same table can play again.
   * The match is deleted even without a room; returns false if there was no room.
   */
  finishGame(roomId: string): Promise<boolean>;
  /** Deletes the room, its seats and its boardgame.io match. */
  deleteRoom(roomId: string): Promise<void>;
  /** Rooms whose last activity is older than the cutoff for their status. */
  listStaleRoomIds(cutoffs: StaleCutoffs): Promise<string[]>;
}
