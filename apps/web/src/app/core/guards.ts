import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from './auth.service';

// Note: inject() only works before the first await, so dependencies are read up front.

/** Host pages: signed-out visitors go to /login and come back afterwards. */
export const hostOnly: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready;
  if (auth.isSignedIn()) return true;
  return router.createUrlTree(['/login'], { queryParams: { next: state.url } });
};

/** The login page is only for signed-out visitors. */
export const signedOutOnly: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready;
  return auth.isSignedIn() ? router.createUrlTree(['/']) : true;
};
