import type { GameCatalogEntry } from '@board-table/games/catalog';
import { filterGames, playerCountOptions } from './filter-games';

const game = (over: Partial<GameCatalogEntry>): GameCatalogEntry => ({
  id: 'g',
  displayName: 'Game',
  minPlayers: 2,
  maxPlayers: 2,
  tagline: 'A game.',
  description: 'A longer description.',
  tags: [],
  playTimeMinutes: { min: 5, max: 10 },
  complexity: 'light',
  ...over,
});

const games = [
  game({ id: 'tictactoe', displayName: 'Tic-tac-toe', tags: ['classic', 'quick'] }),
  game({ id: 'cafe', displayName: 'Café Rush', minPlayers: 2, maxPlayers: 5, tags: ['party'] }),
  game({
    id: 'solo',
    displayName: 'Lone Tower',
    minPlayers: 1,
    maxPlayers: 1,
    tagline: 'Build alone.',
  }),
];

const ids = (list: readonly GameCatalogEntry[]) => list.map((g) => g.id);

describe('filterGames', () => {
  it('returns everything without filters, sorted by name', () => {
    expect(ids(filterGames(games, { query: '', players: null }))).toEqual([
      'cafe',
      'solo',
      'tictactoe',
    ]);
  });

  it('matches name, tags and tagline, ignoring case and accents', () => {
    expect(ids(filterGames(games, { query: 'cafe', players: null }))).toEqual(['cafe']);
    expect(ids(filterGames(games, { query: 'CLASSIC', players: null }))).toEqual(['tictactoe']);
    expect(ids(filterGames(games, { query: 'alone', players: null }))).toEqual(['solo']);
    expect(ids(filterGames(games, { query: '  tic  ', players: null }))).toEqual(['tictactoe']);
  });

  it('keeps games that support the chosen player count', () => {
    expect(ids(filterGames(games, { query: '', players: 4 }))).toEqual(['cafe']);
    expect(ids(filterGames(games, { query: '', players: 1 }))).toEqual(['solo']);
  });

  it('combines both filters', () => {
    expect(filterGames(games, { query: 'tic', players: 4 })).toEqual([]);
  });
});

describe('playerCountOptions', () => {
  it('offers "Any" plus every player count some game supports', () => {
    expect(playerCountOptions(games)).toEqual([
      { value: null, label: 'Any' },
      { value: 1, label: '1' },
      { value: 2, label: '2' },
      { value: 3, label: '3' },
      { value: 4, label: '4' },
      { value: 5, label: '5' },
    ]);
  });
});
