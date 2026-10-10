import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { LobbyResponse } from '@board-table/shared';
import { render, screen } from '@testing-library/angular';
import { ApiClient, ApiError } from '../../core/api-client';
import { AuthService } from '../../core/auth.service';
import { SeatStore } from '../../core/seat-store';
import type { GameSession, SessionPlayer } from '../../game-client/game-session';
import { GAME_BOARDS, GAME_SESSION_FACTORY } from '../../games/boards';
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
    { seatIndex: 0, name: 'Ivan', isHost: true },
    { seatIndex: 1, name: 'Mara', isHost: false },
  ],
  you: { seatIndex: 1, playerID: '1' },
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

async function setup({
  seat = { seatIndex: 1, credentials: secret } as { seatIndex: number; credentials: string } | null,
  lobbyResult = async () => lobby(),
  signedIn = false,
} = {}) {
  localStorage.clear();
  if (seat) localStorage.setItem(`bt-seat:${roomId}`, JSON.stringify(seat));
  const sessions: ReturnType<typeof fakeSession>[] = [];
  const factory = vi.fn((options: { playerID: string; playerNames: readonly string[] }) => {
    const session = fakeSession(options.playerID);
    sessions.push(session);
    // only the members the page uses are faked
    return session as unknown as GameSession<unknown>;
  });
  const navigate = vi.spyOn(Router.prototype, 'navigateByUrl').mockResolvedValue(true);
  const view = await render(PlayPage, {
    providers: [
      provideRouter([]),
      { provide: ApiClient, useValue: { lobby: vi.fn(lobbyResult) } },
      { provide: AuthService, useValue: { isSignedIn: signal(signedIn) } },
      { provide: GAME_BOARDS, useValue: { tictactoe: async () => StubBoardComponent } },
      { provide: GAME_SESSION_FACTORY, useValue: factory },
    ],
    componentInputs: { roomId },
  });
  return { factory, sessions, navigate, view };
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

  it('shows the result and forgets the seat when the game ends', async () => {
    const { sessions } = await setup();
    await screen.findByText('Stub board for player 1');
    sessions[0]!.gameover.set({ winner: '1' });
    expect(await screen.findByRole('heading', { name: 'You won!' })).toBeTruthy();
    expect(screen.getByText(/Ask Ivan for a new invite/)).toBeTruthy();
    expect(TestBed.inject(SeatStore).seat(roomId)).toBeUndefined();
  });

  it('offers the host to play again', async () => {
    const { sessions } = await setup({
      seat: { seatIndex: 0, credentials: secret },
      lobbyResult: async () => lobby({ you: { seatIndex: 0, playerID: '0' } }),
      signedIn: true,
    });
    await screen.findByText('Stub board for player 0');
    sessions[0]!.gameover.set({ winner: '1' });
    const again = await screen.findByRole('link', { name: 'Host again' });
    expect(again.getAttribute('href')).toBe('/games/tictactoe');
  });

  it('tells you when the connection drops', async () => {
    const { sessions } = await setup();
    await screen.findByText('Stub board for player 1');
    sessions[0]!.isConnected.set(false);
    expect(await screen.findByText('Reconnecting…')).toBeTruthy();
  });

  it('closes the connection when leaving the page', async () => {
    const { sessions, view } = await setup();
    await screen.findByText('Stub board for player 1');
    view.fixture.destroy();
    expect(sessions[0]!.stop).toHaveBeenCalled();
  });

  it('sends players back to the waiting room before the game starts', async () => {
    const { navigate } = await setup({
      lobbyResult: async () => lobby({ status: 'waiting', you: { seatIndex: 1 } }),
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
