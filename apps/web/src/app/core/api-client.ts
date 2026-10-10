import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  apiErrorSchema,
  createRoomResponseSchema,
  inviteResponseSchema,
  joinResponseSchema,
  listRoomsResponseSchema,
  lobbyResponseSchema,
  previewResponseSchema,
  seatCredentialsSchema,
  SEAT_CREDENTIALS_HEADER,
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
  type Infer,
  type Schema,
} from '@board-table/shared';
import { firstValueFrom, type Observable } from 'rxjs';
import { AuthService } from './auth.service';

/** A failed API call. `network` means the server could not be reached. */
export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode | 'network',
    readonly status: number,
  ) {
    super(code);
  }
}

/** Typed client for our rooms & invites API. Every response is validated. */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  // --- hosts (Supabase login) ---
  async createRoom(body: CreateRoomRequest): Promise<CreateRoomResponse> {
    return this.call(createRoomResponseSchema, (headers) =>
      this.http.post('/api/rooms', body, { headers }),
    );
  }

  async listRooms(): Promise<ListRoomsResponse> {
    return this.call(listRoomsResponseSchema, (headers) =>
      this.http.get('/api/rooms', { headers }),
    );
  }

  async regenerateInvite(roomId: string): Promise<InviteResponse> {
    return this.call(inviteResponseSchema, (headers) =>
      this.http.post(`/api/rooms/${roomId}/invite`, null, { headers }),
    );
  }

  /** Fresh credentials for the host's seat (e.g. the room was created on another device). */
  async reclaimHostSeat(roomId: string): Promise<SeatCredentials> {
    return this.call(seatCredentialsSchema, (headers) =>
      this.http.post(`/api/rooms/${roomId}/host-seat`, null, { headers }),
    );
  }

  async startRoom(roomId: string): Promise<void> {
    await this.call(null, (headers) =>
      this.http.post(`/api/rooms/${roomId}/start`, null, { headers }),
    );
  }

  async freeSeat(roomId: string, seatIndex: number): Promise<void> {
    await this.call(null, (headers) =>
      this.http.delete(`/api/rooms/${roomId}/seats/${seatIndex}`, { headers }),
    );
  }

  async closeRoom(roomId: string): Promise<void> {
    await this.call(null, (headers) => this.http.delete(`/api/rooms/${roomId}`, { headers }));
  }

  // --- guests (invite token) ---
  async preview(roomId: string, token: string): Promise<PreviewResponse> {
    return this.call(
      previewResponseSchema,
      () => this.http.post(`/api/rooms/${roomId}/preview`, { token }),
      { auth: 'none' },
    );
  }

  async join(roomId: string, body: JoinRequest): Promise<JoinResponse> {
    return this.call(joinResponseSchema, () => this.http.post(`/api/rooms/${roomId}/join`, body), {
      auth: 'none',
    });
  }

  // --- seated players (seat credentials) ---
  async lobby(roomId: string, credentials: string): Promise<LobbyResponse> {
    return this.call(
      lobbyResponseSchema,
      () =>
        this.http.get(`/api/rooms/${roomId}/lobby`, {
          headers: new HttpHeaders({ [SEAT_CREDENTIALS_HEADER]: credentials }),
        }),
      { auth: 'none' },
    );
  }

  private async call<S extends Schema | null>(
    schema: S,
    request: (headers: HttpHeaders) => Observable<unknown>,
    { auth = 'host' }: { auth?: 'host' | 'none' } = {},
  ): Promise<S extends Schema ? Infer<S> : void> {
    let headers = new HttpHeaders();
    if (auth === 'host') {
      const token = await this.auth.accessToken();
      if (!token) throw new ApiError('unauthorized', 401);
      headers = headers.set('Authorization', `Bearer ${token}`);
    }

    let body: unknown;
    try {
      body = await firstValueFrom(request(headers), { defaultValue: null });
    } catch (e) {
      throw toApiError(e);
    }
    if (schema === null) return undefined as never;
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new ApiError('internal_error', 200);
    return parsed.data as never;
  }
}

function toApiError(e: unknown): ApiError {
  if (!(e instanceof HttpErrorResponse)) return new ApiError('internal_error', 0);
  if (e.status === 0) return new ApiError('network', 0);
  const parsed = apiErrorSchema.safeParse(e.error);
  return new ApiError(parsed.success ? parsed.data.error : 'internal_error', e.status);
}
