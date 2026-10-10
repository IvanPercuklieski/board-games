import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { AuthService, type AuthUser } from '../core/auth.service';
import { ThemeService } from '../ui/theme/theme.service';
import { ShellComponent } from './shell.component';

async function setup(user: AuthUser | null) {
  localStorage.clear();
  const signOut = vi.fn(async () => undefined);
  await render(ShellComponent, {
    providers: [
      provideRouter([]),
      {
        provide: AuthService,
        useValue: { user: signal(user), isSignedIn: signal(user !== null), signOut },
      },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  return { signOut, navigate };
}

const ivan: AuthUser = { id: 'u1', email: 'ivan@example.com', displayName: 'Ivan' };

describe('ShellComponent', () => {
  it('starts with a skip link to the main content', async () => {
    await setup(null);
    const skip = screen.getByRole('link', { name: 'Skip to content' });
    expect(skip.getAttribute('href')).toBe('#main');
  });

  it('shows the wordmark as a home link', async () => {
    await setup(null);
    expect(screen.getByRole('link', { name: 'board·table home' })).toBeTruthy();
  });

  it('hides host navigation from signed-out visitors and guests', async () => {
    await setup(null);
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Log out' })).toBeNull();
  });

  it('shows navigation and the user for signed-in hosts', async () => {
    await setup(ivan);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(nav.textContent).toContain('Games');
    expect(nav.textContent).toContain('My rooms');
    expect(screen.getByText('Ivan')).toBeTruthy();
  });

  it('logs out and returns to the login page', async () => {
    const { signOut, navigate } = await setup(ivan);
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(signOut).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/login');
  });

  it('cycles the colour mode: system, light, dark', async () => {
    await setup(null);
    const theme = TestBed.inject(ThemeService);
    const toggle = screen.getByRole('button', { name: 'Colour mode: system' });
    await userEvent.click(toggle);
    expect(theme.mode()).toBe('light');
    expect(screen.getByRole('button', { name: 'Colour mode: light' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Colour mode: light' }));
    expect(theme.mode()).toBe('dark');
    await userEvent.click(screen.getByRole('button', { name: 'Colour mode: dark' }));
    expect(theme.mode()).toBe('system');
  });
});
