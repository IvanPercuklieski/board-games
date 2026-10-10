import type { Routes } from '@angular/router';
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
    path: '**',
    title: 'Not found · board·table',
    loadComponent: () => import('./features/not-found/not-found.page').then((m) => m.NotFoundPage),
  },
];
