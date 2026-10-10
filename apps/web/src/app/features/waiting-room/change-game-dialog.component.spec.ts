import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { GameCatalogEntry } from '@board-table/games/catalog';
import type { RoomSummary } from '@board-table/shared';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { ApiClient, ApiError } from '../../core/api-client';
import { ToastService } from '../../ui/toast/toast.service';
import {
  ChangeGameDialogComponent,
  gameChoices,
  seatChoices,
  type ChangeGameData,
} from './change-game-dialog.component';

const roomId = 'AbCdEfGhIjKlMnOpQrSt_-';

const entry = (id: string, displayName: string, min: number, max: number): GameCatalogEntry => ({
  id,
  displayName,
  minPlayers: min,
  maxPlayers: max,
  tagline: '',
  description: '',
  tags: [],
  playTimeMinutes: { min: 5, max: 10 },
  complexity: 'light',
});

const games = [
  entry('tictactoe', 'Tic-tac-toe', 2, 2),
  entry('party', 'Party', 3, 6),
  entry('solo', 'Solo', 1, 1),
];

const summary = (over: Partial<RoomSummary> = {}): RoomSummary => ({
  roomId,
  gameId: 'party',
  status: 'waiting',
  maxSeats: 3,
  seats: [],
  createdAt: new Date().toISOString(),
  ...over,
});

async function setup(updateRoom = vi.fn(async () => summary())) {
  const close = vi.fn();
  const data: ChangeGameData = { roomId, gameId: 'tictactoe', maxSeats: 2, seated: 2, games };
  await render(ChangeGameDialogComponent, {
    providers: [
      provideRouter([]),
      { provide: DIALOG_DATA, useValue: data },
      { provide: DialogRef, useValue: { close } },
      { provide: ApiClient, useValue: { updateRoom } },
    ],
  });
  return { close, updateRoom };
}

const toastMessages = () =>
  TestBed.inject(ToastService)
    .toasts()
    .map((t) => t.message);

describe('gameChoices', () => {
  it('disables games that cannot seat everyone, with the reason', () => {
    expect(gameChoices(games, 2)).toEqual([
      { game: games[0], disabledReason: null },
      { game: games[1], disabledReason: null },
      { game: games[2], disabledReason: 'Needs at most 1 player; 2 are seated' },
    ]);
  });
});

describe('seatChoices', () => {
  it('runs from the larger of the game minimum and the seated players to the game maximum', () => {
    expect(seatChoices(games[1]!, 2)).toEqual([3, 4, 5, 6]);
    expect(seatChoices(games[1]!, 4)).toEqual([4, 5, 6]);
    expect(seatChoices(games[0]!, 2)).toEqual([2]);
  });
});

describe('ChangeGameDialogComponent', () => {
  afterEach(() => TestBed.inject(ToastService).clear());

  it('lists the games with their player range and the current game selected', async () => {
    await setup();
    const list = screen.getByRole('radiogroup', { name: 'Game' });
    const current = within(list).getByRole('radio', { name: /Tic-tac-toe/ }) as HTMLInputElement;
    expect(current.checked).toBe(true);
    expect(within(list).getByText('2 players')).toBeTruthy();
    expect(within(list).getByText('3–6 players')).toBeTruthy();
  });

  it('shows games the seated players do not fit as disabled, with the reason', async () => {
    await setup();
    const solo = screen.getByRole('radio', { name: /Solo/ }) as HTMLInputElement;
    expect(solo.disabled).toBe(true);
    expect(solo.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByText('Needs at most 1 player; 2 are seated')).toBeTruthy();
  });

  it('saves the chosen game and seat count and closes with the updated room', async () => {
    const { updateRoom, close } = await setup();
    await userEvent.click(screen.getByRole('radio', { name: /Party/ }));
    const seats = screen.getByRole('radiogroup', { name: 'Seats' });
    expect(
      within(seats)
        .getAllByRole('radio')
        .map((r) => r.parentElement!.textContent!.trim()),
    ).toEqual(['3', '4', '5', '6']);
    await userEvent.click(within(seats).getByRole('radio', { name: '4' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(updateRoom).toHaveBeenCalledWith(roomId, { gameId: 'party', maxSeats: 4 });
    expect(close).toHaveBeenCalledWith(expect.objectContaining({ gameId: 'party', maxSeats: 3 }));
  });

  it('explains when the players no longer fit and stays open', async () => {
    const { close } = await setup(
      vi.fn(async () => Promise.reject(new ApiError('too_many_players', 409))),
    );
    await userEvent.click(screen.getByRole('radio', { name: /Party/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(toastMessages()).toContain(
      'The game couldn’t be changed. Too many players are seated for that game. Free a seat first.',
    );
    expect(close).not.toHaveBeenCalled();
  });

  it('closes without changes on cancel', async () => {
    const { updateRoom, close } = await setup();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(close).toHaveBeenCalledWith(undefined);
    expect(updateRoom).not.toHaveBeenCalled();
  });
});
