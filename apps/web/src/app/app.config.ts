import { provideHttpClient, withFetch } from '@angular/common/http';
import {
  ApplicationConfig,
  ErrorHandler,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
  provideRouter,
  withComponentInputBinding,
  withNavigationErrorHandler,
  withRouterConfig,
} from '@angular/router';
import { routes } from './app.routes';
import { AppErrorHandler, reportNavigationError } from './core/app-error-handler';
import { initializeApp } from './core/app-init';
import { ThemeService } from './ui/theme/theme.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withFetch()),
    // Errors nothing else handled: logged and shown as one toast (core/app-error-handler.ts).
    { provide: ErrorHandler, useClass: AppErrorHandler },
    provideRouter(
      routes,
      // route params and query params (e.g. ?next=) arrive as component inputs
      withComponentInputBinding(),
      // a page that can't be opened is reported once; navigation then resolves to false
      withNavigationErrorHandler(reportNavigationError),
      withRouterConfig({ resolveNavigationPromiseOnError: true }),
    ),
    // Apply the saved light/dark choice before the first render.
    provideAppInitializer(() => void inject(ThemeService)),
    // Public config (Supabase URL/key) first, then restore any saved host session.
    provideAppInitializer(initializeApp),
  ],
};
