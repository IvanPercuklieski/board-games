import { provideHttpClient, withFetch } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { initializeApp } from './core/app-init';
import { ThemeService } from './ui/theme/theme.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withFetch()),
    // route params and query params (e.g. ?next=) arrive as component inputs
    provideRouter(routes, withComponentInputBinding()),
    // Apply the saved light/dark choice before the first render.
    provideAppInitializer(() => void inject(ThemeService)),
    // Public config (Supabase URL/key) first, then restore any saved host session.
    provideAppInitializer(initializeApp),
  ],
};
