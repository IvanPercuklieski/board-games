import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { AuthService, type SignInResult } from '../../core/auth.service';
import { ToastService } from '../../ui/toast/toast.service';
import { LoginPage } from './login.page';

async function setup(result: SignInResult = 'ok', next?: string) {
  const signIn = vi.fn(async () => result);
  const view = await render(LoginPage, {
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { signIn, isSignedIn: signal(false) } },
    ],
    componentInputs: next ? { next } : {},
  });
  const router = view.fixture.debugElement.injector.get(Router);
  const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  return { signIn, navigate };
}

describe('LoginPage', () => {
  it('has a labelled email and password form and explains how accounts work', async () => {
    await setup();
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(screen.getByText(/created by the admin/i)).toBeTruthy();
  });

  it('validates before submitting', async () => {
    const { signIn } = await setup();
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(signIn).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Enter your email address')).toBeTruthy();
    expect(screen.getByText('Enter your password')).toBeTruthy();
  });

  it('signs in and continues to the page the user wanted', async () => {
    const { signIn, navigate } = await setup('ok', '/games/tictactoe');
    await userEvent.type(screen.getByLabelText('Email'), 'ivan@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'right');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(signIn).toHaveBeenCalledWith('ivan@example.com', 'right');
    expect(navigate).toHaveBeenCalledWith('/games/tictactoe');
  });

  it('never redirects to another site after login', async () => {
    const { navigate } = await setup('ok', 'https://evil.example/phish');
    await userEvent.type(screen.getByLabelText('Email'), 'ivan@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'right');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('shows a clear message for wrong credentials', async () => {
    const { navigate } = await setup('invalid_credentials');
    await userEvent.type(screen.getByLabelText('Email'), 'ivan@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/email or password is wrong/i);
    expect(navigate).not.toHaveBeenCalled();
    expect(TestBed.inject(ToastService).toasts()).toEqual([]); // the form explains it
  });

  it('explains a network failure in the form and as a toast', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await setup('network');
    await userEvent.type(screen.getByLabelText('Email'), 'ivan@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'right');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/didn’t work just now/);
    expect(
      TestBed.inject(ToastService)
        .toasts()
        .map((t) => t.message),
    ).toEqual([expect.stringMatching(/^Logging in didn’t work\. Can’t reach board·table/)]);
    TestBed.inject(ToastService).clear();
    vi.restoreAllMocks();
  });
});
