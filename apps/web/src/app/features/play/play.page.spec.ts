import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { LobbyResponse } from '@board-table/shared';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { ApiClient, ApiError } from '../../core/api-client';
import { AuthService } from '../../core/auth.service';
import { ROOM_CONNECTION_FACTORY, type RoomConnection } from '../../core/room-connection';
import { SeatStore } from '../../core/seat-store';
import type { GameSession, SessionPlayer } from '../../game-client/game-session';
import { GAME_BOARDS, GAME_SESSION_FACTORY } from '../../games/boards';
import { ToastService } from '../../ui/toast/toast.service';
import { PlayPage } from './play.page';

const roomId = 'AbCdEfGhIjKlMnOpQrSt_-';
const secret = 'S'.repeat(43);

@Component({
  selector: 'bt-stub-board',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p>Stub board for player {{ session().playerID }}</p>`,
})
class StubBoardComponent {
  readonly session = input.required<{ playerID: string }>();
}

const lobby = (over: Partial<LobbyResponse> = {}): LobbyResponse => ({
  roomId,
  gameId: 'tictactoe',
  status: 'playing',
  maxSeats: 2,
  seats: [
    { seatIndex: 0, name: 'Ivan', isHost: true, away: false },
    { seatIndex: 1, name: 'Mara', isHost: false, away: false },
  ],
  you: { seatIndex: 1, isHost: false, playerID: '1' },
  ...over,
});

function fakeSession(playerID: string) {
  const players: SessionPlayer[] = [
    { playerID: '0', seatIndex: 0, name: 'Ivan', isYou: playerID === '0', isCurrent: true },
    { playerID: '1', seatIndex: 1, name: 'Mara', isYou: playerID === '1', isCurrent: false },
  ];
  return {
    playerID,
    isConnected: signal(true),
    players: signal(players),
    gameover: signal<unknown>(undefined),
    start: vi.fn(),
    stop: vi.fn(),
  };
}

/** The room connection as the page sees it; tests push server snapshots by hand. */
function fakeConnection(initial: LobbyResponse) {
  return {
    lobby: signal<LobbyResponse | undefined>(initial),
    connected: signal(true),
    closed: signal(false),
    stop: vi.fn(),
  };
}

async function setup({
  seat = { seatIndex: 1, credentials: secret } as { seatIndex: number; credentials: string } | null,
  lobbyResult = async () => lobby(),
  signedIn = false,
} = {}) {
  localStorage.clear();
  sessionStorage.clear(); // seats are kept per window too (SeatStore)
  if (seat) localStorage.setItem(`bt-seat:${roomId}`, JSON.stringify(seat));
  const sessions: ReturnType<typeof fakeSession>[] = [];
  const factory = vi.fn((options: { playerID: string; playerNames: readonly string[] }) => {
    const session = fakeSession(options.playerID);
    sessions.push(session);
    // only the members the page uses are faked
    return session as unknown as GameSession<unknown>;
  });
  const navigate = vi.spyOn(Router.prototype, 'navigateByUrl').mockResolvedValue(true);
  const connections: ReturnType<typeof fakeConnection>[] = [];
  // the room connection starts from the same room the page loaded
  const first = await lobbyResult().catch(() => lobby());
  const connect = vi.fn(() => {
    const connection = fakeConnection(first);
    connections.push(connection);
    return connection as unknown as RoomConnection;
  });
  const view = await render(PlayPage, {
    providers: [
      provideRouter([]),
      { provide: ApiClient, useValue: { lobby: vi.fn(lobbyResult) } },
      { provide: AuthService, useValue: { isSignedIn: signal(signedIn) } },
      { provide: GAME_BOARDS, useValue: { tictactoe: async () => StubBoardComponent } },
      { provide: GAME_SESSION_FACTORY, useValue: factory },
      { provide: ROOM_CONNECTION_FACTORY, useValue: connect },
    ],
    componentInputs: { roomId },
  });
  return { factory, sessions, navigate, view, connect, connections };
}

describe('PlayPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('connects your seat to the match and shows the game board', async () => {
    const { factory } = await setup();
    expect(await screen.findByText('Stub board for player 1')).toBeTruthy();
    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({
        matchID: roomId,
        playerID: '1',
        credentials: secret,
        playerNames: ['Ivan', 'Mara'],
      }),
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Tic-tac-toe' })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Players' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Ivan’s turn');
  });

  it('shows the result and leads back to the same table, keeping the seat', async () => {
    const { sessions } = await setup();
    await screen.findByText('Stub board for player 1');
    sessions[0]!.gameover.set({ winner: '1' });
    expect(await screen.findByRole('heading', { name: 'You won!' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back to the table' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Back to games' })).toBeNull();
    expect(TestBed.inject(SeatStore).seat(roomId)).toEqual({ seatIndex: 1, credentials: secret });
  });

  it('keeps the room connection open while playing (presence)', async () => {
    const { connect } = await setup();
    await screen.findByText('Stub board for player 1');
    expect(connect).toHaveBeenCalledWith({ roomId, credentials: secret });
  });

  it('goes back to the table once the server has reopened the room', async () => {
    const { sessions, navigate, connections } = await setup();
    await screen.findByText('Stub board for player 1');
    sessions[0]!.gameover.set({ winner: '1' });
    await userEvent.click(await screen.findByRole('button', { name: 'Back to the table' }));
    expect(navigate).not.toHaveBeenCalled(); // the room is still "playing" for a moment
    connections[0]!.lobby.set(lobby({ status: 'waiting', you: { seatIndex: 1, isHost: false } }));
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith(`/rooms/${roomId}?played=true`));
  });

  it('still goes back to the table if the room stays busy', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { sessions, navigate } = await setup();
    await screen.findByText('Stub board for player 1');
    sessions[0]!.gameover.set({ winner: '1' });
    (await screen.findByRole('button', { name: 'Back to the table' })).click();
    await vi.advanceTimersByTimeAsync(3000);
    expect(navigate).toHaveBeenCalledWith(`/rooms/${roomId}?played=true`);
    vi.useRealTimers();
  });

  it('also offers the host a way back to the games', async () => {
    const { sessions } = await setup({
      seat: { seatIndex: 0, credentials: secret },
      lobbyResult: async () => lobby({ you: { seatIndex: 0, isHost: true, playerID: '0' } }),
    });
    await screen.findByText('Stub board for player 0');
    sessions[0]!.gameover.set({ winner: '1' });
    expect(await screen.findByRole('button', { name: 'Back to the table' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to games' }).getAttribute('href')).toBe('/');
  });

  it('does not show reconnecting once the game is over', async () => {
    const { sessions } = await setup();
    await screen.findByText('Stub board for player 1');
    sessions[0]!.gameover.set({ winner: '0' });
    sessions[0]!.isConnected.set(false); // the server disconnects everyone at game end
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText('Reconnecting…')).toBeNull();
  });

  it('tells you when the connection drops', async () => {
    const { sessions } = await setup();
    await screen.findByText('Stub board for player 1');
    sessions[0]!.isConnected.set(false);
    expect(await screen.findByText('Reconnecting…')).toBeTruthy();
  });

  it('stops when the room says the seat was given away or the table closed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { sessions, connections } = await setup();
    await screen.findByText('Stub board for player 1');
    connections[0]!.closed.set(true);
    expect(
      await screen.findByRole('heading', { name: 'This table has been cleared' }),
    ).toBeTruthy();
    expect(sessions[0]!.stop).toHaveBeenCalled();
    expect(TestBed.inject(SeatStore).seat(roomId)).toBeUndefined();
    expect(
      TestBed.inject(ToastService)
        .toasts()
        .map((t) => t.message),
    ).toEqual(['This table no longer exists, or the link stopped working.']);
    expect(console.error).toHaveBeenCalledTimes(1); // reported once
    TestBed.inject(ToastService).clear();
  });

  it('offers a retry and starts no session when the board can’t be loaded', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    localStorage.setItem(
      `bt-seat:${roomId}`,
      JSON.stringify({ seatIndex: 1, credentials: secret }),
    );
    const factory = vi.fn();
    await render(PlayPage, {
      providers: [
        provideRouter([]),
        { provide: ApiClient, useValue: { lobby: vi.fn(async () => lobby()) } },
        { provide: AuthService, useValue: { isSignedIn: signal(false) } },
        {
          provide: GAME_BOARDS,
          useValue: {
            tictactoe: () =>
              Promise.reject(new TypeError('Failed to fetch dynamically imported module: /b.js')),
          },
        },
        { provide: GAME_SESSION_FACTORY, useValue: factory },
        { provide: ROOM_CONNECTION_FACTORY, useValue: vi.fn() },
      ],
      componentInputs: { roomId },
    });
    expect(
      await screen.findByRole('heading', { name: 'Can’t reach the table right now' }),
    ).toBeTruthy();
    expect(factory).not.toHaveBeenCalled();
    const [toast] = TestBed.inject(ToastService).toasts();
    expect(toast!.action?.label).toBe('Reload');
    TestBed.inject(ToastService).clear();
  });

  it('closes both connections when leaving the page', async () => {
    const { sessions, view, connections } = await setup();
    await screen.findByText('Stub board for player 1');
    view.fixture.destroy();
    expect(sessions[0]!.stop).toHaveBeenCalled();
    expect(connections[0]!.stop).toHaveBeenCalled();
  });

  it('sends players back to the waiting room before the game starts', async () => {
    const { navigate } = await setup({
      lobbyResult: async () => lobby({ status: 'waiting', you: { seatIndex: 1, isHost: false } }),
    });
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith(`/rooms/${roomId}`));
  });

  it('explains a missing seat and a cleared table', async () => {
    await setup({ seat: null });
    expect(
      await screen.findByRole('heading', { name: 'You don’t have a seat at this table' }),
    ).toBeTruthy();
  });

  it('explains a table that was cleared', async () => {
    await setup({ lobbyResult: async () => Promise.reject(new ApiError('not_found', 404)) });
    expect(
      await screen.findByRole('heading', { name: 'This table has been cleared' }),
    ).toBeTruthy();
  });
});
