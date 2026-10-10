import { render } from '@testing-library/angular';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { AuthService } from './core/auth.service';

describe('App', () => {
  it('renders the shell', async () => {
    const { container } = await render(App, {
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { user: signal(null), isSignedIn: signal(false) } },
      ],
    });
    expect(container.querySelector('bt-shell')).toBeTruthy();
  });
});
