import type { GameCatalogEntry } from '@board-table/games/catalog';
import type { SegmentedOption } from '../../ui/segmented/segmented.component';

export interface GameFilter {
  query: string;
  /** Show only games playable with this many players; null = any. */
  players: number | null;
}

/** Lower-case and strip accents so "Cafe" finds "Café". */
const normalize = (text: string) =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

/** Games matching the search text (name, tags, tagline) and player count, sorted by name. */
export function filterGames(
  games: readonly GameCatalogEntry[],
  { query, players }: GameFilter,
): GameCatalogEntry[] {
  const needle = normalize(query);
  return games
    .filter((game) => {
      const matchesQuery =
        !needle ||
        [game.displayName, game.tagline, ...game.tags].some((text) =>
          normalize(text).includes(needle),
        );
      const fitsPlayers =
        players === null || (players >= game.minPlayers && players <= game.maxPlayers);
      return matchesQuery && fitsPlayers;
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** "Any" plus each player count that at least one game supports. */
export function playerCountOptions(
  games: readonly GameCatalogEntry[],
): SegmentedOption<number | null>[] {
  const counts = new Set<number>();
  for (const game of games) {
    for (let n = game.minPlayers; n <= game.maxPlayers; n++) counts.add(n);
  }
  return [
    { value: null, label: 'Any' },
    ...[...counts].sort((a, b) => a - b).map((n) => ({ value: n, label: String(n) })),
  ];
}
