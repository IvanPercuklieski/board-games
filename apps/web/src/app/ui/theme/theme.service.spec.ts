import { TestBed } from '@angular/core/testing';
import { THEME_STORAGE_KEY, ThemeService } from './theme.service';

describe('ThemeService', () => {
  const root = document.documentElement;

  beforeEach(() => {
    localStorage.clear();
    delete root.dataset['theme'];
    TestBed.resetTestingModule();
  });

  afterEach(() => vi.restoreAllMocks());

  it('follows the system by default (no data-theme attribute)', () => {
    const theme = TestBed.inject(ThemeService);
    expect(theme.mode()).toBe('system');
    expect(root.dataset['theme']).toBeUndefined();
  });

  it('applies and remembers an explicit choice', () => {
    const theme = TestBed.inject(ThemeService);
    theme.setMode('dark');
    expect(theme.mode()).toBe('dark');
    expect(root.dataset['theme']).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    theme.setMode('system');
    expect(root.dataset['theme']).toBeUndefined();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('restores the saved choice on start', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    const theme = TestBed.inject(ThemeService);
    expect(theme.mode()).toBe('light');
    expect(root.dataset['theme']).toBe('light');
  });

  it('ignores unknown saved values', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'neon');
    expect(TestBed.inject(ThemeService).mode()).toBe('system');
  });

  it('still works when storage is unavailable (e.g. blocked site data)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const theme = TestBed.inject(ThemeService);
    expect(theme.mode()).toBe('system');
    theme.setMode('dark');
    expect(root.dataset['theme']).toBe('dark');
  });
});
