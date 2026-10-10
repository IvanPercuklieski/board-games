import type { ActivatedRouteSnapshot, Routes } from '@angular/router';
import { hostOnly, signedOutOnly } from './core/guards';

/** Every page is lazy-loaded so the start bundle stays small. */
export const routes: Routes = [
  {
    path: 'login',
    title: 'Log in · board·table',
    canActivate: [signedOutOnly],
    loadComponent: () => import('./features/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: '',
    pathMatch: 'full',
    title: 'Games · board·table',
    canActivate: [hostOnly],
    loadComponent: () => import('./features/catalog/catalog.page').then((m) => m.CatalogPage),
  },
  {
    path: 'games/:gameId',
    title: 'Game · board·table',
    canActivate: [hostOnly],
    loadComponent: () =>
      import('./features/game-detail/game-detail.page').then((m) => m.GameDetailPage),
  },
  {
    path: 'rooms',
    pathMatch: 'full',
    title: 'My rooms · board·table',
    canActivate: [hostOnly],
    loadComponent: () => import('./features/my-rooms/my-rooms.page').then((m) => m.MyRoomsPage),
  },
  {
    // Guests: no login. The invite token travels in the URL fragment (#t=...).
    path: 'join/:roomId',
    title: 'Join a table · board·table',
    resolve: { fragment: (route: ActivatedRouteSnapshot) => route.fragment },
    loadComponent: () => import('./features/join/join.page').then((m) => m.JoinPage),
  },
  {
    path: '**',
    title: 'Not found · board·table',
    loadComponent: () => import('./features/not-found/not-found.page').then((m) => m.NotFoundPage),
  },
];
