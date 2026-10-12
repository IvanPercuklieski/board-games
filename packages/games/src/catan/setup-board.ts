import { BOARD_CONFIG, TERRAINS, type HarbourKind, type Terrain } from './config';
import { getGeometry, type BoardSize, type HexGeo } from './geometry';

/** Returns a shuffled copy (boardgame.io's `random.Shuffle` in the game, seeded in tests). */
export type Shuffle = <T>(items: readonly T[]) => T[];

export interface HexTile {
  terrain: Terrain;
  /** Dice number that makes this hex produce; null for deserts. */
  token: number | null;
}

export interface BoardLayout {
  size: BoardSize;
  /** Indexed by hex id of the board geometry. */
  hexes: HexTile[];
  /** Indexed like the geometry's `harbourSlots`. */
  harbours: HarbourKind[];
  /** Hex the bandit starts on (a desert). */
  bandit: number;
}

const isHot = (token: number) => token === 6 || token === 8;

/**
 * Random island: shuffled terrains and harbours, and number tokens placed so that no two
 * 6s or 8s are neighbours (the hot numbers are placed first by a search that always succeeds,
 * then the rest are shuffled onto the remaining hexes).
 */
export function setupBoard(size: BoardSize, shuffle: Shuffle): BoardLayout {
  const config = BOARD_CONFIG[size];
  const geo = getGeometry(size);

  const terrains = shuffle(TERRAINS.flatMap((t) => Array<Terrain>(config.terrains[t]).fill(t)));
  const producing = geo.hexes.filter((h) => terrains[h.id] !== 'desert');
  const hot = config.tokens.filter(isHot);
  const hotHexes = pickApart(shuffle(producing), hot.length);
  const others = shuffle(producing.filter((h) => !hotHexes.includes(h.id)));
  const rest = shuffle(config.tokens.filter((t) => !isHot(t)));

  const tokens = new Map<number, number>();
  hotHexes.forEach((h, i) => tokens.set(h, hot[i]!));
  others.forEach((h, i) => tokens.set(h.id, rest[i]!));

  const hexes = geo.hexes.map((h) => ({
    terrain: terrains[h.id]!,
    token: tokens.get(h.id) ?? null,
  }));
  return {
    size,
    hexes,
    harbours: shuffle(config.harbours),
    bandit: hexes.findIndex((h) => h.terrain === 'desert'),
  };
}

/** First `count` hexes in the given order where no two are neighbours (depth-first search). */
function pickApart(candidates: readonly HexGeo[], count: number): number[] {
  const chosen: number[] = [];
  const search = (from: number): boolean => {
    if (chosen.length === count) return true;
    for (let i = from; i < candidates.length; i++) {
      const hex = candidates[i]!;
      if (hex.neighbours.some((n) => chosen.includes(n))) continue;
      chosen.push(hex.id);
      if (search(i + 1)) return true;
      chosen.pop();
    }
    return false;
  };
  if (!search(0)) throw new Error(`No room for ${count} hexes apart`);
  return chosen;
}
