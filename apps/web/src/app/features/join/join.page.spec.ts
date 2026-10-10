import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { PreviewResponse } from '@board-table/shared';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { ApiClient, ApiError } from '../../core/api-client';
import { AuthService, type AuthUser } from '../../core/auth.service';
import { SeatStore } from '../../core/seat-store';
import { ToastService } from '../../ui/toast/toast.service';
import { JoinPage, tokenFromFragment } from './join.page';

const roomId = 'AbCdEfGhIjKlMnOpQrSt_-';
const token = 'T'.repeat(43);
const credentials = 'C'.repeat(43);

const preview = (over: Partial<PreviewResponse> = {}): PreviewResponse => ({
  gameId: 'tictactoe',
  gameName: 'Tic-tac-toe',
  hostName: 'Ivan',
  status: 'waiting',
  maxSeats: 2,
  freeSeats: 1,
  ...over,
});

interface Setup {
  fragment?: string | null;
  /** Signed in as this user (default: signed out). */
  user?: AuthUser | null;
  previewResult?: () => Promise<PreviewResponse>;
  joinResult?: () => Promise<unknown>;
}

async function setup({
  fragment = `t=${token}`,
  previewResult = async () => preview(),
  joinResult = async () => ({ seatIndex: 1, credentials }),
  user = null,
}: Setup = {}) {
  const api = { preview: vi.fn(previewResult), join: vi.fn(joinResult) };
  // spy before rendering: an existing seat redirects during the first render
  const navigate = vi.spyOn(Router.prototype, 'navigateByUrl').mockResolvedValue(true);
  const auth = { isSignedIn: signal(user !== null), user: signal(user) };
  const view = await render(JoinPage, {
    providers: [
      provideRouter([]),
      { provide: ApiClient, useValue: api },
      { provide: AuthService, useValue: auth },
    ],
    componentInputs: { roomId, fragment },
  });
  const injector = view.fixture.debugElement.injector;
  return { api, navigate, seats: injector.get(SeatStore) };
}

describe('JoinPage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined));
  afterEach(() => {
    TestBed.inject(ToastService).clear();
    vi.restoreAllMocks();
  });

  it('previews the table the invite is for', async () => {
    const { api } = await setup();
    expect(await screen.findByRole('heading', { level: 1, name: /Ivan invited you/ })).toBeTruthy();
    expect(screen.getByText('Tic-tac-toe')).toBeTruthy();
    expect(screen.getByText('1 seat free')).toBeTruthy();
    expect(api.preview).toHaveBeenCalledWith(roomId, token);
  });

  it('joins with a name, keeps the seat and opens the waiting room', async () => {
    const { api, navigate, seats } = await setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Continue as guest' }));
    await userEvent.type(await screen.findByLabelText('Your name'), '  Mara ');
    await userEvent.click(screen.getByRole('button', { name: 'Take a seat' }));
    expect(api.join).toHaveBeenCalledWith(roomId, { token, name: 'Mara' }, { withAccount: false });
    expect(seats.seat(roomId)).toEqual({ seatIndex: 1, credentials });
    expect(navigate).toHaveBeenCalledWith(`/rooms/${roomId}`);
  });

  it('lets a signed-out player log in first and keeps the token out of the URL', async () => {
    const { navigate, api } = await setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Log in to join' }));
    expect(navigate).toHaveBeenCalledWith(`/login?next=${encodeURIComponent(`/join/${roomId}`)}`);
    expect(JSON.stringify(navigate.mock.calls)).not.toContain(token);
    expect(sessionStorage.getItem(`bt-join-token:${roomId}`)).toBe(token);
    expect(api.join).not.toHaveBeenCalled();
  });

  it('after logging in, joins with the account and the display name', async () => {
    sessionStorage.setItem(`bt-join-token:${roomId}`, token);
    const { api, navigate } = await setup({
      fragment: null, // back from the login page: the token was kept for this tab
      user: { id: 'u1', email: 'bob@example.test', displayName: 'Bob Builder' },
    });
    const field = (await screen.findByLabelText('Your name')) as HTMLInputElement;
    expect(field.value).toBe('Bob Builder');
    expect(screen.getByText(/You join with your account/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Continue as guest' })).toBeNull();
    expect(api.preview).toHaveBeenCalledWith(roomId, token);
    expect(sessionStorage.getItem(`bt-join-token:${roomId}`)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Take a seat' }));
    expect(api.join).toHaveBeenCalledWith(
      roomId,
      { token, name: 'Bob Builder' },
      { withAccount: true },
    );
    expect(navigate).toHaveBeenCalledWith(`/rooms/${roomId}`);
  });

  it('prefers the token from the link and drops an older stashed one', async () => {
    sessionStorage.setItem(`bt-join-token:${roomId}`, 'O'.repeat(43));
    const { api } = await setup();
    await screen.findByRole('button', { name: 'Continue as guest' });
    expect(api.preview).toHaveBeenCalledWith(roomId, token);
    expect(sessionStorage.getItem(`bt-join-token:${roomId}`)).toBeNull();
  });

  it('cuts a long display name to the name limit', async () => {
    await setup({ user: { id: 'u1', email: 'b@x.test', displayName: 'B'.repeat(40) } });
    const field = (await screen.findByLabelText('Your name')) as HTMLInputElement;
    expect(field.value).toBe('B'.repeat(24));
  });

  it('asks for a name first', async () => {
    const { api } = await setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Continue as guest' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Take a seat' }));
    expect(api.join).not.toHaveBeenCalled();
    expect(screen.getByText('Enter the name the others will see')).toBeTruthy();
  });

  it('goes straight to the waiting room when this browser already has a seat', async () => {
    localStorage.setItem(`bt-seat:${roomId}`, JSON.stringify({ seatIndex: 1, credentials }));
    const { api, navigate } = await setup();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith(`/rooms/${roomId}`));
    expect(api.preview).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing token', { fragment: null }],
    [
      'a wrong or old token',
      { previewResult: async () => Promise.reject(new ApiError('not_found', 404)) },
    ],
  ])('explains that the link does not work for %s', async (_case, over) => {
    await setup(over as Setup);
    expect(
      await screen.findByRole('heading', { name: 'This invite link doesn’t work' }),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Continue as guest' })).toBeNull();
  });

  it('explains a full table', async () => {
    await setup({ previewResult: async () => preview({ freeSeats: 0 }) });
    expect(await screen.findByRole('heading', { name: 'This table is full' })).toBeTruthy();
  });

  it('explains a game that already started', async () => {
    await setup({ previewResult: async () => preview({ status: 'playing', freeSeats: 0 }) });
    expect(
      await screen.findByRole('heading', { name: 'This game has already started' }),
    ).toBeTruthy();
  });

  it('handles the last seat being taken while typing', async () => {
    await setup({ joinResult: async () => Promise.reject(new ApiError('room_full', 409)) });
    await userEvent.click(await screen.findByRole('button', { name: 'Continue as guest' }));
    await userEvent.type(await screen.findByLabelText('Your name'), 'Mara');
    await userEvent.click(screen.getByRole('button', { name: 'Take a seat' }));
    expect(await screen.findByRole('heading', { name: 'This table is full' })).toBeTruthy();
    expect(
      TestBed.inject(ToastService)
        .toasts()
        .map((t) => t.message),
    ).toEqual(['You couldn’t take a seat. Every seat at this table is taken.']);
  });

  it('offers a retry when the server cannot be reached', async () => {
    let calls = 0;
    const { api } = await setup({
      previewResult: async () => {
        calls++;
        if (calls === 1) throw new ApiError('network', 0);
        return preview();
      },
    });
    const retry = await screen.findByRole('button', { name: 'Try again' });
    expect(
      TestBed.inject(ToastService)
        .toasts()
        .map((t) => t.message),
    ).toEqual([expect.stringMatching(/^The table couldn’t be loaded\. Can’t reach/)]);
    await userEvent.click(retry);
    expect(await screen.findByRole('button', { name: 'Continue as guest' })).toBeTruthy();
    expect(api.preview).toHaveBeenCalledTimes(2);
  });
});

describe('tokenFromFragment', () => {
  it.each([
    ['t=abc', 'abc'],
    ['x=1&t=abc', 'abc'],
    ['', null],
    [null, null],
    ['abc', null],
  ])('%j -> %j', (fragment, token) => {
    expect(tokenFromFragment(fragment)).toBe(token);
  });
});
