import { getGameDefinition, type GameDefinition } from '@board-table/games';
import {
  LIMITS,
  type ApiErrorCode,
  type CreateRoomRequest,
  type CreateRoomResponse,
  type InviteResponse,
  type JoinRequest,
  type JoinResponse,
  type ListRoomsResponse,
  type LobbyResponse,
  type PreviewResponse,
  type RoomSummary,
  type SeatCredentials,
  type SeatInfo,
  type UpdateRoomRequest,
} from '@board-table/shared';
import { buildMatch, MatchError } from '../matches';
import { hashSecret, newRoomId, newSecret } from '../secrets';
import type { RoomRecord, RoomsRepository, SeatRecord } from './rooms-repository';
import { SeatEvents } from './seat-events';

/** An expected, client-facing failure. Routes map `code` to an HTTP status. */
export class ApiFailure extends Error {
  constructor(readonly code: ApiErrorCode) {
    super(code);
  }
}

/** Who is at the table right now (live room connections). Seats are keyed by credentials hash. */
export interface PresenceView {
  isAway(roomId: string, seatKey: string): boolean;
}

const NOBODY_AWAY: PresenceView = { isAway: () => false };

/**
 * Room and invite rules (see CLAUDE.md "API design"). Callers pass an already-authenticated
 * user id (hosts) or the raw secrets from the request (guests); inputs are already
 * schema-validated by the routes. Every change is announced through `SeatEvents`, so the room
 * connections can push a fresh snapshot.
 */
export class RoomsService {
  private readonly repo: RoomsRepository;
  private readonly publicOrigin: string;
  private readonly seatEvents: SeatEvents;
  private readonly findGame: (gameId: string) => GameDefinition | undefined;
  private readonly presence: PresenceView;

  constructor({
    repo,
    publicOrigin,
    seatEvents = new SeatEvents(),
    findGame = getGameDefinition,
    presence = NOBODY_AWAY,
  }: {
    repo: RoomsRepository;
    publicOrigin: string;
    seatEvents?: SeatEvents;
    /** The game registry; tests add games with other player ranges. */
    findGame?: (gameId: string) => GameDefinition | undefined;
    presence?: PresenceView;
  }) {
    this.repo = repo;
    this.publicOrigin = publicOrigin;
    this.seatEvents = seatEvents;
    this.findGame = findGame;
    this.presence = presence;
  }

  // --- hosts ---------------------------------------------------------------------

  async createRoom(userId: string, req: CreateRoomRequest): Promise<CreateRoomResponse> {
    const profile = await this.repo.findProfile(userId);
    if (!profile) throw new ApiFailure('forbidden');
    const game = this.validGame(req);
    const roomId = newRoomId();
    const token = newSecret();
    const credentials = newSecret();
    const result = await this.repo.createRoom(
      {
        id: roomId,
        gameId: game.id,
        hostUserId: userId,
        maxSeats: req.maxSeats,
        inviteTokenHash: hashSecret(token),
      },
      {
        name: seatName(profile.displayName),
        userId,
        credentialsHash: hashSecret(credentials),
      },
      LIMITS.maxActiveRoomsPerHost,
    );
    if (result === 'limit_reached') throw new ApiFailure('limit_reached');
    return {
      roomId,
      inviteUrl: this.inviteUrl(roomId, token),
      seat: { seatIndex: 0, credentials },
    };
  }

  async listRooms(userId: string): Promise<ListRoomsResponse> {
    const rooms = await this.repo.listRoomsByHost(userId);
    return { rooms: await Promise.all(rooms.map((room) => this.summary(room))) };
  }

  /** Switches a waiting room to another game; the seated players must fit its seat count. */
  async changeGame(userId: string, roomId: string, req: UpdateRoomRequest): Promise<RoomSummary> {
    await this.hostedRoom(userId, roomId);
    const game = this.validGame(req);
    const result = await this.repo.updateRoomGame(roomId, game.id, req.maxSeats);
    if (result === 'not_waiting') throw new ApiFailure('room_locked');
    if (result === 'too_many_players') throw new ApiFailure('too_many_players');
    this.seatEvents.roomChanged(roomId);
    return this.summary(await this.hostedRoom(userId, roomId));
  }

  async regenerateInvite(userId: string, roomId: string): Promise<InviteResponse> {
    await this.hostedRoom(userId, roomId);
    const token = newSecret();
    await this.repo.setInviteTokenHash(roomId, hashSecret(token));
    return { inviteUrl: this.inviteUrl(roomId, token) };
  }

  async start(userId: string, roomId: string): Promise<void> {
    const room = await this.hostedRoom(userId, roomId);
    if (room.status !== 'waiting') throw new ApiFailure('room_locked');
    const seats = await this.repo.listSeats(roomId);
    if (seats.some((seat) => this.presence.isAway(roomId, seat.credentialsHash))) {
      throw new ApiFailure('players_away');
    }
    let result;
    try {
      result = await this.repo.startRoom(roomId, (seats) => buildMatch(room.gameId, seats));
    } catch (e) {
      if (e instanceof MatchError) throw new ApiFailure('validation_error'); // too few players
      throw e;
    }
    if (result === 'not_waiting') throw new ApiFailure('room_locked');
    this.seatEvents.roomChanged(roomId);
  }

  async freeSeat(userId: string, roomId: string, seatIndex: number): Promise<void> {
    const room = await this.hostedRoom(userId, roomId);
    const host = await this.hostSeat(room);
    if (seatIndex === host?.seatIndex) throw new ApiFailure('forbidden'); // host closes instead
    if (!(await this.removeSeat(roomId, seatIndex))) throw new ApiFailure('not_found');
  }

  /**
   * The host opened the room on another device (seat secrets live only in the browser):
   * issue fresh credentials for the host's seat. The old device's credentials stop working.
   */
  async reclaimHostSeat(userId: string, roomId: string): Promise<SeatCredentials> {
    await this.hostedRoom(userId, roomId);
    const reissued = await this.reissueAccountSeat(roomId, userId);
    if (!reissued) throw new ApiFailure('not_found');
    return reissued;
  }

  async closeRoom(userId: string, roomId: string): Promise<void> {
    await this.hostedRoom(userId, roomId);
    await this.repo.deleteRoom(roomId);
    this.seatEvents.roomClosed(roomId);
  }

  // --- guests ----------------------------------------------------------------------

  async preview(roomId: string, token: string): Promise<PreviewResponse> {
    const room = await this.invitedRoom(roomId, token);
    const seats = await this.repo.listSeats(roomId);
    return {
      gameId: room.gameId,
      gameName: this.findGame(room.gameId)?.displayName ?? room.gameId,
      hostName: seats.find((s) => s.userId === room.hostUserId)?.name ?? '',
      status: room.status,
      maxSeats: room.maxSeats,
      freeSeats: Math.max(0, room.maxSeats - seats.length),
    };
  }

  /**
   * Takes the first free seat. With `userId` (a signed-in player) the seat belongs to that
   * account; if the account already sits here, that seat gets fresh credentials instead.
   */
  async join(roomId: string, req: JoinRequest, userId?: string): Promise<JoinResponse> {
    const room = await this.invitedRoom(roomId, req.token);
    const credentials = newSecret();
    const seatIndex = await this.repo.takeFreeSeat(roomId, {
      name: req.name,
      userId: userId ?? null,
      credentialsHash: hashSecret(credentials),
    });
    if (seatIndex === 'already_seated') {
      // only possible with an account (`userId` set)
      const reissued = userId && (await this.reissueAccountSeat(roomId, userId));
      if (!reissued) throw new ApiFailure('not_found'); // the seat was freed in between
      return reissued;
    }
    if (seatIndex === undefined) {
      throw new ApiFailure(room.status === 'waiting' ? 'room_full' : 'room_locked');
    }
    this.seatEvents.roomChanged(roomId);
    return { seatIndex, credentials };
  }

  // --- seated players ------------------------------------------------------------

  async lobby(roomId: string, credentials: string): Promise<LobbyResponse> {
    const lobby = await this.lobbyFor(roomId, hashSecret(credentials));
    if (!lobby) throw new ApiFailure('not_found');
    return lobby;
  }

  /**
   * The lobby as seen by the seat with this credentials hash, or undefined if that seat (or the
   * room) is gone. The room connection uses this, as it only keeps the hash.
   */
  async lobbyFor(roomId: string, credentialsHash: string): Promise<LobbyResponse | undefined> {
    const you = await this.repo.findSeatByCredentialsHash(roomId, credentialsHash);
    const room = you && (await this.repo.findRoom(roomId));
    if (!you || !room) return undefined;
    return {
      roomId,
      gameId: room.gameId,
      status: room.status,
      maxSeats: room.maxSeats,
      seats: (await this.repo.listSeats(roomId)).map((seat) => this.toSeatInfo(room, seat)),
      you: {
        seatIndex: you.seatIndex,
        isHost: you.userId === room.hostUserId,
        ...(room.status === 'playing' && { playerID: String(you.seatIndex) }),
      },
    };
  }

  /** Leave your own seat. The host hands the room over first (or the room is deleted). */
  async leave(roomId: string, credentials: string): Promise<void> {
    const seat = await this.repo.findSeatByCredentialsHash(roomId, hashSecret(credentials));
    const room = seat && (await this.repo.findRoom(roomId));
    if (!seat || !room) throw new ApiFailure('not_found');
    if (seat.userId === room.hostUserId && !(await this.handOver(room))) return; // room deleted
    await this.removeSeat(roomId, seat.seatIndex);
  }

  // --- presence (called by the room connection) -------------------------------------

  /**
   * A seat has had no connection for the grace period. Everyone sees it as away; if it is the
   * host of a waiting room, the room goes to someone else right away (or is deleted).
   */
  async seatAway(roomId: string, seatKey: string): Promise<void> {
    const seat = await this.repo.findSeatByCredentialsHash(roomId, seatKey);
    const room = seat && (await this.repo.findRoom(roomId));
    if (!seat || !room) return;
    if (room.status === 'waiting' && seat.userId === room.hostUserId) {
      await this.handOver(room);
      return;
    }
    this.seatEvents.roomChanged(roomId);
  }

  /** An away seat is connected again. */
  seatBack(roomId: string): void {
    this.seatEvents.roomChanged(roomId);
  }

  /** Away for the free-seat period: a guest's seat in a waiting room is freed. */
  async seatExpired(roomId: string, seatKey: string): Promise<void> {
    const seat = await this.repo.findSeatByCredentialsHash(roomId, seatKey);
    const room = seat && (await this.repo.findRoom(roomId));
    if (!seat || !room || room.status !== 'waiting' || seat.userId === room.hostUserId) return;
    await this.removeSeat(roomId, seat.seatIndex);
  }

  // --- helpers -------------------------------------------------------------------

  /**
   * Gives the room to the first present account holder (lowest seat, so usually whoever joined
   * first). Returns false if nobody could take it and the room was deleted.
   */
  private async handOver(room: RoomRecord): Promise<boolean> {
    const candidates = (await this.repo.listSeats(room.id)).flatMap((s) =>
      s.userId !== null &&
      s.userId !== room.hostUserId &&
      !this.presence.isAway(room.id, s.credentialsHash)
        ? [s.userId]
        : [],
    );
    const result = await this.repo.handOverHost(
      room.id,
      room.hostUserId,
      candidates,
      LIMITS.maxActiveRoomsPerHost,
    );
    if (result.outcome === 'deleted') {
      this.seatEvents.roomClosed(room.id);
      return false;
    }
    this.seatEvents.roomChanged(room.id);
    return true;
  }

  /** Frees a seat and tells everyone. */
  private async removeSeat(roomId: string, seatIndex: number): Promise<boolean> {
    if (!(await this.repo.freeSeat(roomId, seatIndex))) return false;
    // In a started game seat index = playerID; the removed player stops receiving the game.
    this.seatEvents.revoked(roomId, String(seatIndex));
    this.seatEvents.roomChanged(roomId);
    return true;
  }

  /** Fresh credentials for the account's seat; the old device stops receiving the game. */
  private async reissueAccountSeat(
    roomId: string,
    userId: string,
  ): Promise<SeatCredentials | undefined> {
    const credentials = newSecret();
    const replaced = await this.repo.replaceAccountSeatCredentials(
      roomId,
      userId,
      hashSecret(credentials),
    );
    if (!replaced) return undefined;
    this.seatEvents.revoked(roomId, String(replaced.seatIndex));
    this.seatEvents.roomChanged(roomId);
    return { seatIndex: replaced.seatIndex, credentials };
  }

  private async hostSeat(room: RoomRecord): Promise<SeatRecord | undefined> {
    return (await this.repo.listSeats(room.id)).find((s) => s.userId === room.hostUserId);
  }

  private toSeatInfo(room: RoomRecord, seat: SeatRecord): SeatInfo {
    return {
      seatIndex: seat.seatIndex,
      name: seat.name,
      isHost: seat.userId === room.hostUserId,
      away: this.presence.isAway(room.id, seat.credentialsHash),
    };
  }

  /** The game, if it exists and `maxSeats` is within its player range. */
  private validGame({ gameId, maxSeats }: { gameId: string; maxSeats: number }) {
    const game = this.findGame(gameId);
    if (!game || maxSeats < game.minPlayers || maxSeats > game.maxPlayers) {
      throw new ApiFailure('validation_error');
    }
    return game;
  }

  private async summary(room: RoomRecord): Promise<RoomSummary> {
    return {
      roomId: room.id,
      gameId: room.gameId,
      status: room.status,
      maxSeats: room.maxSeats,
      seats: (await this.repo.listSeats(room.id)).map((seat) => this.toSeatInfo(room, seat)),
      createdAt: room.createdAt.toISOString(),
    };
  }

  /** The room if `userId` hosts it; otherwise not_found (no probing of other hosts' rooms). */
  private async hostedRoom(userId: string, roomId: string): Promise<RoomRecord> {
    const room = await this.repo.findRoom(roomId);
    if (!room || room.hostUserId !== userId) throw new ApiFailure('not_found');
    return room;
  }

  /** The room if `token` is its current invite token; otherwise not_found. */
  private async invitedRoom(roomId: string, token: string): Promise<RoomRecord> {
    const room = await this.repo.findRoom(roomId);
    if (!room || room.inviteTokenHash !== hashSecret(token)) throw new ApiFailure('not_found');
    return room;
  }

  private inviteUrl(roomId: string, token: string): string {
    return `${this.publicOrigin}/join/${roomId}#t=${token}`;
  }
}

/** Profile display names may be longer than seat names; cut by characters, not UTF-16 units. */
const seatName = (displayName: string) =>
  [...displayName.trim()].slice(0, LIMITS.playerNameMaxLength).join('') || 'Host';
