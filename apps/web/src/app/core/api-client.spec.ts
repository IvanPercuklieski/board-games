import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SEAT_CREDENTIALS_HEADER } from '@board-table/shared';
import { ApiClient, ApiError } from './api-client';
import { AuthService } from './auth.service';

const roomId = 'AbCdEfGhIjKlMnOpQrSt_-';
const secret = 'A'.repeat(43);

describe('ApiClient', () => {
  let http: HttpTestingController;
  let api: ApiClient;
  const accessToken = vi.fn(async (): Promise<string | null> => 'host-token');

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { accessToken } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(ApiClient);
  });
  afterEach(() => http.verify());

  it('creates a room as the logged-in host and validates the response', async () => {
    const result = api.createRoom({ gameId: 'tictactoe', maxSeats: 2 });
    const req = await pending('POST', '/api/rooms');
    expect(req.request.headers.get('Authorization')).toBe('Bearer host-token');
    expect(req.request.body).toEqual({ gameId: 'tictactoe', maxSeats: 2 });
    req.flush({
      roomId,
      inviteUrl: `https://x.test/join/${roomId}#t=${secret}`,
      seat: { seatIndex: 0, credentials: secret },
    });
    await expect(result).resolves.toMatchObject({ roomId });
  });

  it('reclaims the host seat with the host login', async () => {
    const result = api.reclaimHostSeat(roomId);
    const req = await pending('POST', `/api/rooms/${roomId}/host-seat`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer host-token');
    req.flush({ seatIndex: 0, credentials: secret });
    await expect(result).resolves.toEqual({ seatIndex: 0, credentials: secret });
  });

  it('refuses host calls when signed out', async () => {
    accessToken.mockResolvedValueOnce(null);
    await expect(api.listRooms()).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('sends seat credentials in a header (not the URL) for the lobby', async () => {
    const result = api.lobby(roomId, secret);
    const req = await pending('GET', `/api/rooms/${roomId}/lobby`);
    expect(req.request.headers.get(SEAT_CREDENTIALS_HEADER)).toBe(secret);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({
      roomId,
      gameId: 'tictactoe',
      status: 'waiting',
      maxSeats: 2,
      seats: [{ seatIndex: 0, name: 'Ivan', isHost: true }],
      you: { seatIndex: 0 },
    });
    await expect(result).resolves.toMatchObject({ status: 'waiting' });
  });

  it('joins without any login', async () => {
    const result = api.join(roomId, { token: secret, name: 'Bob' });
    const req = await pending('POST', `/api/rooms/${roomId}/join`);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({ seatIndex: 1, credentials: secret });
    await expect(result).resolves.toEqual({ seatIndex: 1, credentials: secret });
  });

  it('turns API errors into ApiError with the server code and status', async () => {
    const result = api.join(roomId, { token: secret, name: 'Bob' });
    (await pending('POST', `/api/rooms/${roomId}/join`)).flush(
      { error: 'room_full' },
      { status: 409, statusText: 'Conflict' },
    );
    const error = await result.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'room_full', status: 409 });
  });

  it('treats an unexpected response shape as an internal error', async () => {
    const result = api.preview(roomId, secret);
    (await pending('POST', `/api/rooms/${roomId}/preview`)).flush({ surprise: true });
    await expect(result).rejects.toMatchObject({ code: 'internal_error' });
  });

  it('reports network failures', async () => {
    const result = api.preview(roomId, secret);
    (await pending('POST', `/api/rooms/${roomId}/preview`)).error(new ProgressEvent('error'));
    await expect(result).rejects.toMatchObject({ code: 'network' });
  });

  it('host actions without a body resolve on 204', async () => {
    const result = api.startRoom(roomId);
    (await pending('POST', `/api/rooms/${roomId}/start`)).flush(null, {
      status: 204,
      statusText: 'No Content',
    });
    await expect(result).resolves.toBeUndefined();
  });

  /** The client awaits the token first, so requests appear asynchronously. */
  async function pending(method: string, url: string) {
    let found;
    await vi.waitFor(() => {
      found = http.expectOne({ method, url });
    });
    return found!;
  }
});
