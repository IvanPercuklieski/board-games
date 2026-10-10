import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  provideRouter,
  Router,
  UrlTree,
  type ActivatedRouteSnapshot,
  type RouterStateSnapshot,
} from '@angular/router';
import { AuthService } from './auth.service';
import { hostOnly, signedOutOnly } from './guards';

function setup(signedIn: boolean) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: AuthService,
        useValue: { ready: Promise.resolve(), isSignedIn: signal(signedIn) },
      },
    ],
  });
  const run = (guard: typeof hostOnly, url: string) =>
    TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
    ) as Promise<boolean | UrlTree>;
  return { run, router: TestBed.inject(Router) };
}

describe('hostOnly', () => {
  it('lets signed-in hosts through', async () => {
    const { run } = setup(true);
    expect(await run(hostOnly, '/rooms')).toBe(true);
  });

  it('sends everyone else to the login page, remembering where they wanted to go', async () => {
    const { run, router } = setup(false);
    const result = await run(hostOnly, '/games/tictactoe');
    expect(router.serializeUrl(result as UrlTree)).toBe('/login?next=%2Fgames%2Ftictactoe');
  });
});

describe('signedOutOnly', () => {
  it('sends signed-in users away from the login page', async () => {
    const { run, router } = setup(true);
    expect(router.serializeUrl((await run(signedOutOnly, '/login')) as UrlTree)).toBe('/');
  });

  it('shows the login page to signed-out users', async () => {
    const { run } = setup(false);
    expect(await run(signedOutOnly, '/login')).toBe(true);
  });
});
