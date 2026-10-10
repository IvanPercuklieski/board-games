import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { ListRoomsResponse } from '@board-table/shared';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { ApiClient } from '../../core/api-client';
import { ConfirmService } from '../../ui/dialog/confirm.service';
import { MyRoomsPage, relativeTime } from './my-rooms.page';

const roomA = 'AbCdEfGhIjKlMnOpQrSt_-';
const roomB = 'BbCdEfGhIjKlMnOpQrSt_-';

const rooms: ListRoomsResponse = {
  rooms: [
    {
      roomId: roomA,
      gameId: 'tictactoe',
      status: 'waiting',
      maxSeats: 2,
      seats: [{ seatIndex: 0, name: 'Ivan', isHost: true }],
      createdAt: new Date().toISOString(),
    },
    {
      roomId: roomB,
      gameId: 'tictactoe',
      status: 'playing',
      maxSeats: 2,
      seats: [
        { seatIndex: 0, name: 'Ivan', isHost: true },
        { seatIndex: 1, name: 'Mara', isHost: false },
      ],
      createdAt: new Date().toISOString(),
    },
  ],
};

async function setup(list: ListRoomsResponse, confirmed = true) {
  const api = {
    listRooms: vi.fn(async () => structuredClone(list)),
    closeRoom: vi.fn(async () => undefined),
  };
  await render(MyRoomsPage, {
    providers: [
      provideRouter([]),
      { provide: ApiClient, useValue: api },
      { provide: ConfirmService, useValue: { confirm: vi.fn(async () => confirmed) } },
    ],
  });
  return { api };
}

describe('MyRoomsPage', () => {
  it('lists open rooms with game, status and players', async () => {
    await setup(rooms);
    const list = await screen.findByRole('list', { name: 'Your rooms' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText('Tic-tac-toe')).toBeTruthy();
    expect(within(items[0]!).getByText('Waiting for players')).toBeTruthy();
    expect(within(items[1]!).getByText('In progress')).toBeTruthy();
    expect(within(items[1]!).getByRole('img', { name: 'Seat 2: Mara' })).toBeTruthy();
    expect(within(items[0]!).getByRole('link', { name: /Open/ }).getAttribute('href')).toBe(
      `/rooms/${roomA}`,
    );
  });

  it('closes a room after confirmation', async () => {
    const { api } = await setup(rooms);
    const list = await screen.findByRole('list', { name: 'Your rooms' });
    const first = within(list).getAllByRole('listitem')[0]!;
    await userEvent.click(within(first).getByRole('button', { name: /Close room/ }));
    expect(TestBed.inject(ConfirmService).confirm).toHaveBeenCalled();
    expect(api.closeRoom).toHaveBeenCalledWith(roomA);
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
  });

  it('keeps the room when the host cancels', async () => {
    const { api } = await setup(rooms, false);
    const list = await screen.findByRole('list', { name: 'Your rooms' });
    await userEvent.click(within(list).getAllByRole('button', { name: /Close room/ })[0]!);
    expect(api.closeRoom).not.toHaveBeenCalled();
  });

  it('invites to host a game when there are no rooms', async () => {
    await setup({ rooms: [] });
    expect(await screen.findByRole('heading', { name: 'No open rooms' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Browse games' }).getAttribute('href')).toBe('/');
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-10-10T12:00:00Z');
  const ago = (ms: number) => relativeTime(new Date(now.getTime() - ms), now);
  it.each([
    [10_000, 'just now'],
    [5 * 60_000, '5 minutes ago'],
    [2 * 3_600_000, '2 hours ago'],
    [26 * 3_600_000, 'yesterday'],
  ])('%s ms ago -> %s', (ms, text) => {
    expect(ago(ms)).toBe(text);
  });
});
