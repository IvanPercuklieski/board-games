import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gameCatalog, getCatalogEntry } from './catalog';
import { gameRegistry } from './registry';

describe('game catalog', () => {
  it('has exactly one entry per registered game', () => {
    expect(gameCatalog.map((e) => e.id).sort()).toEqual(gameRegistry.map((d) => d.id).sort());
  });

  it('is the source of names and player counts for the registry', () => {
    for (const def of gameRegistry) {
      const entry = getCatalogEntry(def.id)!;
      expect(def).toMatchObject({
        displayName: entry.displayName,
        minPlayers: entry.minPlayers,
        maxPlayers: entry.maxPlayers,
      });
    }
  });

  it('describes every game completely', () => {
    for (const entry of gameCatalog) {
      expect(entry.displayName.trim()).not.toBe('');
      expect(entry.tagline.length).toBeGreaterThan(0);
      expect(entry.tagline.length).toBeLessThanOrEqual(80);
      expect(entry.description.length).toBeGreaterThan(entry.tagline.length);
      expect(entry.tags.length).toBeGreaterThan(0);
      expect(entry.minPlayers).toBeGreaterThanOrEqual(1);
      expect(entry.maxPlayers).toBeGreaterThanOrEqual(entry.minPlayers);
      expect(entry.playTimeMinutes.min).toBeLessThanOrEqual(entry.playTimeMinutes.max);
      expect(['light', 'medium', 'heavy']).toContain(entry.complexity);
    }
  });

  it('does not import game rules, so the browser catalog stays small', () => {
    const source = readFileSync(new URL('./catalog.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/from ['"]boardgame\.io/);
    expect(source).not.toMatch(/from ['"]\.\/(registry|tictactoe)/);
  });

  it('returns undefined for unknown games', () => {
    expect(getCatalogEntry('nope')).toBeUndefined();
  });
});
