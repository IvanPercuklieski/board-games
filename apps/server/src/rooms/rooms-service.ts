import { getGameDefinition } from '@board-table/games';
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
  type SeatCredentials,
  type SeatInfo,
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

/**
 * Room and invite rules (see CLAUDE.md "API design"). Callers pass an already-authenticated
 * user id (hosts) or the raw secrets from the request (guests); inputs are already
 * schema-validated by the routes.
 */
export class RoomsService {
  private readonly repo: RoomsRepository;
  private readonly publicOrigin: string;
  private readonly seatEvents: SeatEvents;

  constructor({
    repo,
    publicOrigin,
    seatEvents = new SeatEvents(),
  }: {
    repo: RoomsRepository;
    publicOrigin: string;
    seatEvents?: SeatEvents;
  }) {
    this.repo = repo;
    this.publicOrigin = publicOrigin;
    this.seatEvents = seatEvents;
  }

  // --- hosts ---------------------------------------------------------------------

  async createRoom(userId: string, req: CreateRoomRequest): Promise<CreateRoomResponse> {
    const profile = await this.repo.findProfile(userId);
    if (!profile) throw new ApiFailure('forbidden');
    const game = getGameDefinition(req.gameId);
    if (!game || req.maxSeats < game.minPlayers || req.maxSeats > game.maxPlayers) {
      throw new ApiFailure('validation_error');
    }
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
    return {
      rooms: await Promise.all(
        rooms.map(async (room) => ({
          roomId: room.id,
          gameId: room.gameId,
          status: room.status,
          maxSeats: room.maxSeats,
          seats: (await this.repo.listSeats(room.id)).map(toSeatInfo),
          createdAt: room.createdAt.toISOString(),
        })),
      ),
    };
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
    let result;
    try {
      result = await this.repo.startRoom(roomId, (seats) => buildMatch(room.gameId, seats));
    } catch (e) {
      if (e instanceof MatchError) throw new ApiFailure('validation_error'); // too few players
      throw e;
    }
    if (result === 'not_waiting') throw new ApiFailure('room_locked');
  }

  async freeSeat(userId: string, roomId: string, seatIndex: number): Promise<void> {
    await this.hostedRoom(userId, roomId);
    if (seatIndex === 0) throw new ApiFailure('forbidden'); // the host closes the room instead
    if (!(await this.repo.freeSeat(roomId, seatIndex))) throw new ApiFailure('not_found');
    // In a started game seat index = playerID; the removed player stops receiving the game.
    this.seatEvents.revoked(roomId, String(seatIndex));
  }

  /**
   * The host opened the room on another device (seat secrets live only in the browser):
   * issue fresh credentials for seat 0. The old device's credentials stop working.
   */
  async reclaimHostSeat(userId: string, roomId: string): Promise<SeatCredentials> {
    await this.hostedRoom(userId, roomId);
    const credentials = newSecret();
    if (!(await this.repo.replaceSeatCredentials(roomId, 0, hashSecret(credentials)))) {
      throw new ApiFailure('not_found');
    }
    this.seatEvents.revoked(roomId, '0'); // the old device stops receiving the game
    return { seatIndex: 0, credentials };
  }

  async closeRoom(userId: string, roomId: string): Promise<void> {
    await this.hostedRoom(userId, roomId);
    await this.repo.deleteRoom(roomId);
  }

  // --- guests ----------------------------------------------------------------------

  async preview(roomId: string, token: string): Promise<PreviewResponse> {
    const room = await this.invitedRoom(roomId, token);
    const seats = await this.repo.listSeats(roomId);
    return {
      gameId: room.gameId,
      gameName: getGameDefinition(room.gameId)?.displayName ?? room.gameId,
      hostName: seats.find((s) => s.seatIndex === 0)?.name ?? '',
      status: room.status,
      maxSeats: room.maxSeats,
      freeSeats: Math.max(0, room.maxSeats - seats.length),
    };
  }

  async join(roomId: string, req: JoinRequest): Promise<JoinResponse> {
    const room = await this.invitedRoom(roomId, req.token);
    const credentials = newSecret();
    const seatIndex = await this.repo.takeFreeSeat(roomId, {
      name: req.name,
      credentialsHash: hashSecret(credentials),
    });
    if (seatIndex === undefined) {
      throw new ApiFailure(room.status === 'waiting' ? 'room_full' : 'room_locked');
    }
    return { seatIndex, credentials };
  }

  // --- seated players ------------------------------------------------------------

  async lobby(roomId: string, credentials: string): Promise<LobbyResponse> {
    const you = await this.repo.findSeatByCredentialsHash(roomId, hashSecret(credentials));
    const room = you && (await this.repo.findRoom(roomId));
    if (!you || !room) throw new ApiFailure('not_found');
    return {
      roomId,
      gameId: room.gameId,
      status: room.status,
      maxSeats: room.maxSeats,
      seats: (await this.repo.listSeats(roomId)).map(toSeatInfo),
      you: {
        seatIndex: you.seatIndex,
        ...(room.status === 'playing' && { playerID: String(you.seatIndex) }),
      },
    };
  }

  // --- helpers -------------------------------------------------------------------

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

const toSeatInfo = (seat: SeatRecord): SeatInfo => ({
  seatIndex: seat.seatIndex,
  name: seat.name,
  isHost: seat.userId !== null,
});

/** Profile display names may be longer than seat names; cut by characters, not UTF-16 units. */
const seatName = (displayName: string) =>
  [...displayName.trim()].slice(0, LIMITS.playerNameMaxLength).join('') || 'Host';
