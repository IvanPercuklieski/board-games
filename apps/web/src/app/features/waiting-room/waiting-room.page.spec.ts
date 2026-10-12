import { Clipboard } from '@angular/cdk/clipboard';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { LobbyResponse, RoomSocketAuth } from '@board-table/shared';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { ApiClient, ApiError } from '../../core/api-client';
import { AuthService } from '../../core/auth.service';
import { ROOM_CONNECTION_FACTORY, type RoomConnection } from '../../core/room-connection';
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
  seats: [{ seatIndex: 0, name: 'Ivan', isHost: true, away: false }],
  you: { seatIndex: 0, isHost: true },
  ...over,
});

const bothSeated = (over: Partial<LobbyResponse> = {}) =>
  lobby({
    seats: [
      { seatIndex: 0, name: 'Ivan', isHost: true, away: false },
      { seatIndex: 1, name: 'Mara', isHost: false, away: false },
    ],
    ...over,
  });

/** The room connection as the page sees it; tests push server snapshots by hand. */
function fakeConnection(initial?: LobbyResponse) {
  return {
    lobby: signal<LobbyResponse | undefined>(initial),
    connected: signal(true),
    closed: signal(false),
    stop: vi.fn(),
  };
}
type FakeConnection = ReturnType<typeof fakeConnection>;

interface Options {
  seat?: { seatIndex: number; credentials: string } | null;
  signedIn?: boolean;
  invite?: string | null;
  /** null: no snapshot yet. */
  initial?: LobbyResponse | null;
  confirm?: boolean;
  played?: boolean;
  reclaimResult?: () => Promise<{ seatIndex: number; credentials: string }>;
}

async function setup({
  seat = { seatIndex: 0, credentials: hostSecret },
  signedIn = true,
  invite = inviteUrl,
  initial = lobby(),
  confirm = true,
  played,
  reclaimResult = async () => ({ seatIndex: 0, credentials: hostSecret }),
}: Options = {}) {
  localStorage.clear();
  sessionStorage.clear(); // seats are kept per window too (SeatStore)
  if (seat) localStorage.setItem(`bt-seat:${roomId}`, JSON.stringify(seat));
  if (invite) localStorage.setItem(`bt-invite:${roomId}`, invite);

  const api = {
    reclaimHostSeat: vi.fn(reclaimResult),
    regenerateInvite: vi.fn(async () => ({ inviteUrl: `https://x.test/join/${roomId}#t=new` })),
    startRoom: vi.fn(async () => undefined),
    freeSeat: vi.fn(async () => undefined),
    closeRoom: vi.fn(async () => undefined),
    leave: vi.fn(async () => undefined),
    updateRoom: vi.fn(),
  };
  const connection: FakeConnection = fakeConnection(initial ?? undefined);
  const factory = vi.fn((_auth: RoomSocketAuth) => connection as unknown as RoomConnection);
  const clipboard = { copy: vi.fn(() => true) };
  const navigate = vi.spyOn(Router.prototype, 'navigateByUrl').mockResolvedValue(true);
  const view = await render(WaitingRoomPage, {
    providers: [
      provideRouter([]),
      { provide: ApiClient, useValue: api },
      { provide: AuthService, useValue: { isSignedIn: signal(signedIn) } },
      { provide: ConfirmService, useValue: { confirm: vi.fn(async () => confirm) } },
      { provide: Clipboard, useValue: clipboard },
      { provide: ROOM_CONNECTION_FACTORY, useValue: factory },
    ],
    componentInputs: { roomId, ...(played !== undefined && { played }) },
  });
  return { api, clipboard, navigate, view, connection, factory };
}

const toastMessages = () =>
  TestBed.inject(ToastService)
    .toasts()
    .map((t) => t.message);

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
      initial: bothSeated({ you: { seatIndex: 1, isHost: false } }),
    };

    it('connects with its seat and waits for the host', async () => {
      const { factory } = await setup(guest);
      expect(await screen.findByRole('heading', { level: 1, name: 'Tic-tac-toe' })).toBeTruthy();
      expect(factory).toHaveBeenCalledWith({ roomId, credentials: guestSecret });
      const seats = screen.getByRole('list', { name: 'Seats' });
      expect(within(seats).getByRole('img', { name: 'Seat 2: Mara (you)' })).toBeTruthy();
      expect(screen.getByText('Waiting for Ivan to start the game')).toBeTruthy();
      expect(screen.queryByRole('button', { name: /Start game/ })).toBeNull();
      expect(screen.queryByText(/Invite link/)).toBeNull();
    });

    it('leaves the table after confirming', async () => {
      const { api, navigate, connection } = await setup(guest);
      await userEvent.click(await screen.findByRole('button', { name: /Leave table/ }));
      expect(TestBed.inject(ConfirmService).confirm).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Leave this table?' }),
      );
      expect(api.leave).toHaveBeenCalledWith(roomId, guestSecret);
      connection.closed.set(true); // the server closes our connection after we left
      // guests have no other page to go to (the games are for hosts): say goodbye here
      expect(await screen.findByRole('heading', { name: 'You left the table' })).toBeTruthy();
      expect(navigate).not.toHaveBeenCalled();
      expect(TestBed.inject(SeatStore).seat(roomId)).toBeUndefined();
      expect(toastMessages()).toEqual([]); // leaving is not an error
    });

    it('becomes the host when the room is handed over', async () => {
      const { connection } = await setup({ ...guest, signedIn: true });
      await screen.findByText('Waiting for Ivan to start the game');
      connection.lobby.set(
        bothSeated({
          seats: [
            { seatIndex: 0, name: 'Ivan', isHost: false, away: true },
            { seatIndex: 1, name: 'Mara', isHost: true, away: false },
          ],
          you: { seatIndex: 1, isHost: true },
        }),
      );
      expect(await screen.findByRole('button', { name: /Start game/ })).toBeTruthy();
      expect(toastMessages()).toContain('You’re the host now');
      expect(
        screen.getByText(/Only the device that made the invite link can show it/),
      ).toBeTruthy();
    });
  });

  describe('as the host', () => {
    it('shares the invite link', async () => {
      const { clipboard } = await setup();
      const link = await screen.findByRole('textbox', { name: 'Invite link' });
      expect((link as HTMLInputElement).value).toBe(inviteUrl);
      await userEvent.click(screen.getByRole('button', { name: /Copy link/ }));
      expect(clipboard.copy).toHaveBeenCalledWith(inviteUrl);
      expect(toastMessages()).toContain('Invite link copied');
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
      expect(await screen.findByText(/Only the device that made the invite link/)).toBeTruthy();
      expect(screen.getByRole('button', { name: /New link/ })).toBeTruthy();
    });

    it('can start only once enough players are seated', async () => {
      await setup();
      const start = await screen.findByRole('button', { name: /Start game/ });
      expect((start as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByText('Waiting for at least 2 players')).toBeTruthy();
    });

    it('shows who is away and waits for them before starting', async () => {
      const { connection } = await setup({ initial: bothSeated() });
      const start = await screen.findByRole('button', { name: /Start game/ });
      expect((start as HTMLButtonElement).disabled).toBe(false);
      connection.lobby.set(
        bothSeated({
          seats: [
            { seatIndex: 0, name: 'Ivan', isHost: true, away: false },
            { seatIndex: 1, name: 'Mara', isHost: false, away: true },
          ],
        }),
      );
      await vi.waitFor(() => expect((start as HTMLButtonElement).disabled).toBe(true));
      const seats = screen.getByRole('list', { name: 'Seats' });
      expect(within(seats).getByRole('img', { name: 'Seat 2: Mara (away)' })).toBeTruthy();
      expect(within(seats).getByText('Away')).toBeTruthy();
      expect(screen.getByText('Waiting for Mara to come back, or free their seat')).toBeTruthy();
    });

    it('starts the game and moves to the table once the server says so', async () => {
      const { api, navigate, connection } = await setup({ initial: bothSeated() });
      await userEvent.click(await screen.findByRole('button', { name: /Start game/ }));
      expect(api.startRoom).toHaveBeenCalledWith(roomId);
      connection.lobby.set(
        bothSeated({ status: 'playing', you: { seatIndex: 0, isHost: true, playerID: '0' } }),
      );
      await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith(`/rooms/${roomId}/play`));
    });

    it('shows the current game and opens the change-game dialog', async () => {
      await setup({ initial: bothSeated() });
      const card = await screen.findByRole('region', { name: 'Game' });
      expect(within(card).getByText('Tic-tac-toe · up to 2 players')).toBeTruthy();
      await userEvent.click(within(card).getByRole('button', { name: /Change game/ }));
      const dialog = await screen.findByRole('dialog', { name: 'Change game' });
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('offers to play again after a game at this table', async () => {
      await setup({ initial: bothSeated(), played: true });
      expect(await screen.findByRole('button', { name: /Play again/ })).toBeTruthy();
      expect(screen.queryByRole('button', { name: /Start game/ })).toBeNull();
    });

    it('disables freeing seats while one is being freed', async () => {
      const { api } = await setup({ initial: bothSeated() });
      let finish!: () => void;
      api.freeSeat.mockImplementation(
        () => new Promise<undefined>((r) => (finish = () => r(undefined))),
      );
      const button = await screen.findByRole('button', { name: 'Free seat 2 (Mara)' });
      await userEvent.click(button);
      expect((button as HTMLButtonElement).disabled).toBe(true);
      finish();
      await vi.waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    });

    it('frees a guest seat after confirming', async () => {
      const { api } = await setup({ initial: bothSeated() });
      await userEvent.click(await screen.findByRole('button', { name: 'Free seat 2 (Mara)' }));
      expect(api.freeSeat).toHaveBeenCalledWith(roomId, 1);
    });

    it('shows the close button as busy while closing', async () => {
      const { api } = await setup();
      let finish!: () => void;
      api.closeRoom.mockImplementation(
        () => new Promise<undefined>((r) => (finish = () => r(undefined))),
      );
      const close = await screen.findByRole('button', { name: /Close room/ });
      await userEvent.click(close);
      expect(close.getAttribute('aria-busy')).toBe('true');
      finish();
    });

    it('closes the room after confirming, without calling it an error', async () => {
      const { api, navigate, connection } = await setup();
      api.closeRoom.mockImplementation(async () => {
        connection.closed.set(true); // the server's "closed" may arrive before the response
      });
      await userEvent.click(await screen.findByRole('button', { name: /Close room/ }));
      expect(api.closeRoom).toHaveBeenCalledWith(roomId);
      expect(TestBed.inject(SeatStore).seat(roomId)).toBeUndefined();
      expect(navigate).toHaveBeenCalledWith('/rooms');
      expect(toastMessages()).toEqual([]);
    });

    it('keeps the room when closing fails', async () => {
      const { api, navigate } = await setup();
      await screen.findByRole('heading', { level: 1 });
      api.closeRoom.mockRejectedValue(new ApiError('network', 0));
      await userEvent.click(screen.getByRole('button', { name: /Close room/ }));
      expect(navigate).not.toHaveBeenCalledWith('/rooms');
      expect(TestBed.inject(SeatStore).seat(roomId)).toBeDefined();
      expect(toastMessages()).toContain(
        'The room couldn’t be closed. Can’t reach board·table. Check your connection; if the site was asleep it can take a minute to wake up.',
      );
    });

    it('leaving explains that someone else takes over', async () => {
      const { api, navigate } = await setup({ initial: bothSeated() });
      await userEvent.click(await screen.findByRole('button', { name: /Leave table/ }));
      expect(TestBed.inject(ConfirmService).confirm).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Leave this table?',
          message: expect.stringMatching(/takes over as host/),
        }),
      );
      expect(api.leave).toHaveBeenCalledWith(roomId, hostSecret);
      await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/rooms'));
    });

    it('offers a retry when the server can’t be reached on another device', async () => {
      let fail = true;
      const { api } = await setup({
        seat: null,
        reclaimResult: async () => {
          if (fail) throw new ApiError('network', 0);
          return { seatIndex: 0, credentials: hostSecret };
        },
      });
      expect(
        await screen.findByRole('heading', { name: 'Can’t reach the table right now' }),
      ).toBeTruthy();
      fail = false;
      await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(await screen.findByRole('heading', { level: 1, name: 'Tic-tac-toe' })).toBeTruthy();
      expect(api.reclaimHostSeat).toHaveBeenCalledTimes(2);
    });

    it('reclaims the host seat when the room was created on another device', async () => {
      const { api, factory } = await setup({ seat: null });
      expect(await screen.findByRole('heading', { level: 1, name: 'Tic-tac-toe' })).toBeTruthy();
      expect(api.reclaimHostSeat).toHaveBeenCalledWith(roomId);
      expect(TestBed.inject(SeatStore).seat(roomId)).toEqual({
        seatIndex: 0,
        credentials: hostSecret,
      });
      expect(factory).toHaveBeenCalledWith({ roomId, credentials: hostSecret });
    });
  });

  it('waits for the first snapshot before showing the table', async () => {
    const { connection } = await setup({ initial: null });
    expect(screen.getByText('Finding your seat')).toBeTruthy();
    connection.lobby.set(lobby());
    expect(await screen.findByRole('heading', { level: 1, name: 'Tic-tac-toe' })).toBeTruthy();
  });

  it('shows Reconnecting while the connection is down (no toast)', async () => {
    const { connection } = await setup();
    await screen.findByRole('heading', { level: 1 });
    connection.connected.set(false);
    expect(await screen.findByText('Reconnecting…')).toBeTruthy();
    connection.connected.set(true);
    await vi.waitFor(() => expect(screen.queryByText('Reconnecting…')).toBeNull());
    expect(toastMessages()).toEqual([]);
  });

  it('explains when this browser has no seat here', async () => {
    const { factory } = await setup({ seat: null, signedIn: false });
    expect(
      await screen.findByRole('heading', { name: 'You don’t have a seat at this table' }),
    ).toBeTruthy();
    expect(factory).not.toHaveBeenCalled();
  });

  it('explains when the room is gone or the seat was given away', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { connection } = await setup();
    await screen.findByRole('heading', { level: 1 });
    connection.closed.set(true);
    expect(
      await screen.findByRole('heading', { name: 'This table has been cleared' }),
    ).toBeTruthy();
    expect(TestBed.inject(SeatStore).seat(roomId)).toBeUndefined();
    expect(toastMessages()).toEqual(['This table no longer exists, or the link stopped working.']);
    expect(console.error).toHaveBeenCalledTimes(1); // reported once
  });

  it('closes the connection when leaving the page', async () => {
    const { view, connection } = await setup();
    await screen.findByRole('heading', { level: 1 });
    view.fixture.destroy();
    expect(connection.stop).toHaveBeenCalled();
  });
});
