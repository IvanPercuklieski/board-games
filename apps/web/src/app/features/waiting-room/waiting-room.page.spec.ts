import { Clipboard } from '@angular/cdk/clipboard';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { LobbyResponse } from '@board-table/shared';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { ApiClient, ApiError } from '../../core/api-client';
import { AuthService } from '../../core/auth.service';
import { SeatStore } from '../../core/seat-store';
import { ConfirmService } from '../../ui/dialog/confirm.service';
import { ToastService } from '../../ui/toast/toast.service';
import { WaitingRoomPage } from './waiting-room.page';

const roomId = 'AbCdEfGhIjKlMnOpQrSt_-';
const hostSecret = 'H'.repeat(43);
const guestSecret = 'G'.repeat(43);
const inviteUrl = `https://x.test/join/${roomId}#t=${'T'.repeat(43)}`;

const lobby = (over: Partial<LobbyResponse> = {}): LobbyResponse => ({
  roomId,
  gameId: 'tictactoe',
  status: 'waiting',
  maxSeats: 2,
  seats: [{ seatIndex: 0, name: 'Ivan', isHost: true }],
  you: { seatIndex: 0 },
  ...over,
});

const bothSeated = (over: Partial<LobbyResponse> = {}) =>
  lobby({
    seats: [
      { seatIndex: 0, name: 'Ivan', isHost: true },
      { seatIndex: 1, name: 'Mara', isHost: false },
    ],
    ...over,
  });

interface Options {
  seat?: { seatIndex: number; credentials: string } | null;
  signedIn?: boolean;
  invite?: string | null;
  lobbyResult?: () => Promise<LobbyResponse>;
  confirm?: boolean;
  played?: boolean;
}

async function setup({
  seat = { seatIndex: 0, credentials: hostSecret },
  signedIn = true,
  invite = inviteUrl,
  lobbyResult = async () => lobby(),
  confirm = true,
  played,
}: Options = {}) {
  localStorage.clear();
  if (seat) localStorage.setItem(`bt-seat:${roomId}`, JSON.stringify(seat));
  if (invite) localStorage.setItem(`bt-invite:${roomId}`, invite);

  const api = {
    lobby: vi.fn(lobbyResult),
    reclaimHostSeat: vi.fn(async () => ({ seatIndex: 0, credentials: hostSecret })),
    regenerateInvite: vi.fn(async () => ({ inviteUrl: `https://x.test/join/${roomId}#t=new` })),
    startRoom: vi.fn(async () => undefined),
    freeSeat: vi.fn(async () => undefined),
    closeRoom: vi.fn(async () => undefined),
  };
  const clipboard = { copy: vi.fn(() => true) };
  const navigate = vi.spyOn(Router.prototype, 'navigateByUrl').mockResolvedValue(true);
  const view = await render(WaitingRoomPage, {
    providers: [
      provideRouter([]),
      { provide: ApiClient, useValue: api },
      { provide: AuthService, useValue: { isSignedIn: signal(signedIn) } },
      { provide: ConfirmService, useValue: { confirm: vi.fn(async () => confirm) } },
      { provide: Clipboard, useValue: clipboard },
    ],
    componentInputs: { roomId, ...(played !== undefined && { played }) },
  });
  return { api, clipboard, navigate, view };
}

describe('WaitingRoomPage', () => {
  afterEach(() => {
    TestBed.inject(ToastService).clear();
    vi.restoreAllMocks();
  });

  describe('as a guest', () => {
    const guest = {
      seat: { seatIndex: 1, credentials: guestSecret },
      signedIn: false,
      invite: null,
      lobbyResult: async () => bothSeated({ you: { seatIndex: 1 } }),
    };

    it('shows the table and waits for the host', async () => {
      const { api } = await setup(guest);
      expect(await screen.findByRole('heading', { level: 1, name: 'Tic-tac-toe' })).toBeTruthy();
      expect(api.lobby).toHaveBeenCalledWith(roomId, guestSecret);
      const seats = screen.getByRole('list', { name: 'Seats' });
      expect(within(seats).getByRole('img', { name: 'Seat 2: Mara (you)' })).toBeTruthy();
      expect(screen.getByText('Waiting for Ivan to start the game')).toBeTruthy();
      expect(screen.queryByRole('button', { name: /Start game/ })).toBeNull();
      expect(screen.queryByText(/Invite link/)).toBeNull();
    });
  });

  describe('as the host', () => {
    it('shares the invite link', async () => {
      const { clipboard } = await setup();
      const link = await screen.findByRole('textbox', { name: 'Invite link' });
      expect((link as HTMLInputElement).value).toBe(inviteUrl);
      await userEvent.click(screen.getByRole('button', { name: /Copy link/ }));
      expect(clipboard.copy).toHaveBeenCalledWith(inviteUrl);
      // toasts render in the app shell; here we check the message was sent
      expect(
        TestBed.inject(ToastService)
          .toasts()
          .map((t) => t.message),
      ).toContain('Invite link copied');
    });

    it('makes a new link after confirming (the old one stops working)', async () => {
      const { api } = await setup();
      await userEvent.click(await screen.findByRole('button', { name: /New link/ }));
      expect(TestBed.inject(ConfirmService).confirm).toHaveBeenCalled();
      expect(api.regenerateInvite).toHaveBeenCalledWith(roomId);
      const link = screen.getByRole('textbox', { name: 'Invite link' }) as HTMLInputElement;
      expect(link.value).toBe(`https://x.test/join/${roomId}#t=new`);
    });

    it('offers a new link when this browser has none', async () => {
      await setup({ invite: null });
      expect(await screen.findByText(/created on another device/)).toBeTruthy();
      expect(screen.getByRole('button', { name: /New link/ })).toBeTruthy();
    });

    it('can start only once enough players are seated', async () => {
      await setup();
      const start = await screen.findByRole('button', { name: /Start game/ });
      expect((start as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByText('Waiting for at least 2 players')).toBeTruthy();
    });

    it('starts the game and moves everyone to the table', async () => {
      let status: 'waiting' | 'playing' = 'waiting';
      const { api, navigate } = await setup({
        lobbyResult: async () =>
          bothSeated({
            status,
            you: { seatIndex: 0, ...(status === 'playing' && { playerID: '0' }) },
          }),
      });
      api.startRoom.mockImplementation(async () => {
        status = 'playing';
      });
      const start = await screen.findByRole('button', { name: /Start game/ });
      expect((start as HTMLButtonElement).disabled).toBe(false);
      await userEvent.click(start);
      expect(api.startRoom).toHaveBeenCalledWith(roomId);
      await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith(`/rooms/${roomId}/play`));
    });

    it('offers to play again after a game at this table', async () => {
      await setup({ lobbyResult: async () => bothSeated(), played: true });
      expect(await screen.findByRole('button', { name: /Play again/ })).toBeTruthy();
      expect(screen.queryByRole('button', { name: /Start game/ })).toBeNull();
    });

    it('frees a guest seat after confirming', async () => {
      const { api } = await setup({ lobbyResult: async () => bothSeated() });
      await userEvent.click(await screen.findByRole('button', { name: 'Free seat 2 (Mara)' }));
      expect(api.freeSeat).toHaveBeenCalledWith(roomId, 1);
    });

    it('closes the room after confirming', async () => {
      const { api, navigate } = await setup();
      await userEvent.click(await screen.findByRole('button', { name: /Close room/ }));
      expect(api.closeRoom).toHaveBeenCalledWith(roomId);
      expect(TestBed.inject(SeatStore).seat(roomId)).toBeUndefined();
      expect(navigate).toHaveBeenCalledWith('/rooms');
    });

    it('stops polling before closing, so no lobby poll races the close', async () => {
      const { api } = await setup();
      await screen.findByRole('heading', { level: 1 });
      let pollsDuringClose = -1;
      api.closeRoom.mockImplementation(async () => {
        const before = api.lobby.mock.calls.length;
        document.dispatchEvent(new Event('visibilitychange')); // would poll right away if running
        pollsDuringClose = api.lobby.mock.calls.length - before;
      });
      await userEvent.click(screen.getByRole('button', { name: /Close room/ }));
      expect(api.closeRoom).toHaveBeenCalled();
      expect(pollsDuringClose).toBe(0);
    });

    it('keeps the room and polling when closing fails', async () => {
      const { api, navigate } = await setup();
      await screen.findByRole('heading', { level: 1 });
      api.closeRoom.mockRejectedValue(new ApiError('network', 0));
      await userEvent.click(screen.getByRole('button', { name: /Close room/ }));
      expect(navigate).not.toHaveBeenCalledWith('/rooms');
      expect(TestBed.inject(SeatStore).seat(roomId)).toBeDefined();
      expect(
        TestBed.inject(ToastService)
          .toasts()
          .map((t) => t.message),
      ).toContain('The room couldn’t be closed. Try again.');
      const calls = api.lobby.mock.calls.length;
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.waitFor(() => expect(api.lobby.mock.calls.length).toBeGreaterThan(calls));
    });

    it('reclaims the host seat when the room was created on another device', async () => {
      const { api } = await setup({ seat: null });
      expect(await screen.findByRole('heading', { level: 1, name: 'Tic-tac-toe' })).toBeTruthy();
      expect(api.reclaimHostSeat).toHaveBeenCalledWith(roomId);
      expect(TestBed.inject(SeatStore).seat(roomId)).toEqual({
        seatIndex: 0,
        credentials: hostSecret,
      });
    });
  });

  it('goes to the table once the game has started', async () => {
    const { navigate } = await setup({
      lobbyResult: async () =>
        bothSeated({ status: 'playing', you: { seatIndex: 0, playerID: '0' } }),
    });
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith(`/rooms/${roomId}/play`));
  });

  it('explains when this browser has no seat here', async () => {
    await setup({ seat: null, signedIn: false });
    expect(
      await screen.findByRole('heading', { name: 'You don’t have a seat at this table' }),
    ).toBeTruthy();
  });

  it('explains when the room is gone or the seat was given away', async () => {
    await setup({ lobbyResult: async () => Promise.reject(new ApiError('not_found', 404)) });
    expect(
      await screen.findByRole('heading', { name: 'This table has been cleared' }),
    ).toBeTruthy();
    expect(TestBed.inject(SeatStore).seat(roomId)).toBeUndefined();
  });

  it('stops polling when leaving the page', async () => {
    const { api, view } = await setup();
    await screen.findByRole('heading', { level: 1 });
    const calls = api.lobby.mock.calls.length;
    view.fixture.destroy();
    await new Promise((r) => setTimeout(r, 50));
    expect(api.lobby.mock.calls.length).toBe(calls);
  });
});
