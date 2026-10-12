import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { ApiClient, ApiError } from '../../core/api-client';
import { SeatStore } from '../../core/seat-store';
import { ToastService } from '../../ui/toast/toast.service';
import { GameDetailPage } from './game-detail.page';

const roomId = 'AbCdEfGhIjKlMnOpQrSt_-';
const secret = 'A'.repeat(43);
const inviteUrl = `https://x.test/join/${roomId}#t=${secret}`;

async function setup(gameId: string, createRoom: () => Promise<unknown>) {
  const api = { createRoom: vi.fn(createRoom) };
  const view = await render(GameDetailPage, {
    providers: [provideRouter([]), { provide: ApiClient, useValue: api }],
    componentInputs: { gameId },
  });
  const injector = view.fixture.debugElement.injector;
  const navigate = vi.spyOn(injector.get(Router), 'navigateByUrl').mockResolvedValue(true);
  return { api, navigate, seats: injector.get(SeatStore) };
}

describe('GameDetailPage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear(); // seats are kept per window too (SeatStore)
  });

  it('describes the game', async () => {
    await setup('tictactoe', async () => ({}));
    expect(screen.getByRole('heading', { level: 1, name: 'Tic-tac-toe' })).toBeTruthy();
    expect(screen.getByText(/three-by-three grid/)).toBeTruthy();
    expect(screen.getByText('2 players')).toBeTruthy();
  });

  it('hosts a game: creates the room, keeps the seat and invite link, opens the waiting room', async () => {
    const { api, navigate, seats } = await setup('tictactoe', async () => ({
      roomId,
      inviteUrl,
      seat: { seatIndex: 0, credentials: secret },
    }));
    await userEvent.click(screen.getByRole('button', { name: 'Host a game' }));
    expect(api.createRoom).toHaveBeenCalledWith({ gameId: 'tictactoe' });
    expect(seats.seat(roomId)).toEqual({ seatIndex: 0, credentials: secret });
    expect(seats.inviteUrl(roomId)).toBe(inviteUrl);
    expect(navigate).toHaveBeenCalledWith(`/rooms/${roomId}`);
  });

  it('opens the room up to the game’s maximum: no seat count to choose', async () => {
    const { api } = await setup('catan', async () => ({
      roomId,
      inviteUrl,
      seat: { seatIndex: 0, credentials: secret },
    }));
    expect(screen.getByText('Up to 6 players can join (at least 3 to start)')).toBeTruthy();
    expect(screen.queryByRole('radiogroup')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Host a game' }));
    expect(api.createRoom).toHaveBeenCalledWith({ gameId: 'catan' });
  });

  it('explains the room limit and links to My rooms', async () => {
    const { navigate } = await setup('tictactoe', async () => {
      throw new ApiError('limit_reached', 409);
    });
    await userEvent.click(screen.getByRole('button', { name: 'Host a game' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/3 open rooms/);
    expect(screen.getByRole('link', { name: 'My rooms' }).getAttribute('href')).toBe('/rooms');
    expect(navigate).not.toHaveBeenCalled();
    expect(TestBed.inject(ToastService).toasts()).toEqual([]); // shown inline only
  });

  it('shows other failures as a toast', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await setup('tictactoe', async () => {
      throw new ApiError('rate_limited', 429);
    });
    await userEvent.click(screen.getByRole('button', { name: 'Host a game' }));
    await vi.waitFor(() =>
      expect(
        TestBed.inject(ToastService)
          .toasts()
          .map((t) => t.message),
      ).toEqual([expect.stringMatching(/^The table couldn’t be set up\. That was a lot of tries/)]),
    );
    expect(screen.queryByRole('alert')).toBeNull();
    TestBed.inject(ToastService).clear();
  });

  it('shows a friendly message for an unknown game', async () => {
    await setup('chess', async () => ({}));
    expect(screen.getByRole('heading', { name: /isn’t in the cupboard/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Host a game' })).toBeNull();
  });
});
