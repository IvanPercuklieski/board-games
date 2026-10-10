// Catalog metadata for the game browser. Kept free of game rules (no boardgame.io import)
// so the web catalog page doesn't load any game code.
// All text here is our own; never copy third-party rules or descriptions (public repo).

export type Complexity = 'light' | 'medium' | 'heavy';

export interface GameCatalogEntry {
  /** Registry key and boardgame.io game name. */
  id: string;
  displayName: string;
  minPlayers: number;
  maxPlayers: number;
  /** One line, shown on cards (max 80 characters). */
  tagline: string;
  /** A few sentences for the game page. */
  description: string;
  tags: readonly string[];
  playTimeMinutes: { min: number; max: number };
  complexity: Complexity;
}

export const gameCatalog: readonly GameCatalogEntry[] = [
  {
    id: 'tictactoe',
    displayName: 'Tic-tac-toe',
    minPlayers: 2,
    maxPlayers: 2,
    tagline: 'Three in a row wins. Quick to learn, quicker to lose.',
    description:
      'Take turns marking a square on a three-by-three grid. The first player to line up three ' +
      'marks across, down or diagonally wins; a full grid without a line is a draw. A good ' +
      'warm-up while everyone finds their seat.',
    tags: ['classic', 'abstract', 'quick'],
    playTimeMinutes: { min: 1, max: 5 },
    complexity: 'light',
  },
];

export function getCatalogEntry(id: string): GameCatalogEntry | undefined {
  return gameCatalog.find((entry) => entry.id === id);
}
