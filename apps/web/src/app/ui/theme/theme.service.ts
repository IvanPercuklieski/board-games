import { DOCUMENT, Injectable, inject, signal } from '@angular/core';

export type ThemeMode = 'system' | 'light' | 'dark';

export const THEME_STORAGE_KEY = 'bt-theme';

const MODES: readonly ThemeMode[] = ['system', 'light', 'dark'];

/**
 * Light/dark mode. "system" follows prefers-color-scheme (handled purely in CSS); an explicit
 * choice sets `data-theme` on <html> and is remembered in this browser only.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly root = inject(DOCUMENT).documentElement;
  private readonly current = signal<ThemeMode>(readStoredMode());
  readonly mode = this.current.asReadonly();

  constructor() {
    this.apply(this.current());
  }

  setMode(mode: ThemeMode) {
    this.current.set(mode);
    this.apply(mode);
    storeMode(mode);
  }

  private apply(mode: ThemeMode) {
    if (mode === 'system') delete this.root.dataset['theme'];
    else this.root.dataset['theme'] = mode;
  }
}

// Storage can throw (private mode, blocked site data); the theme then just isn't remembered.
function readStoredMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return MODES.find((m) => m === stored) ?? 'system';
  } catch {
    return 'system'; // storage blocked: follow the system setting
  }
}

function storeMode(mode: ThemeMode) {
  try {
    if (mode === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // not remembered; still applied for this visit
  }
}
