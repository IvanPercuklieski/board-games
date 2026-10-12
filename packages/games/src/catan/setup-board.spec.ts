import { describe, expect, it } from 'vitest';
import { BOARD_CONFIG, boardSizeFor } from './config';
import { getGeometry, type BoardSize } from './geometry';
import { setupBoard, type Shuffle } from './setup-board';

/** Deterministic Fisher-Yates driven by a small seeded generator (mulberry32). */
function seededShuffle(seed: number): Shuffle {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return <T>(items: readonly T[]) => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  };
}

const countBy = (items: readonly (string | number)[]) =>
  items.reduce<Record<string, number>>(
    (acc, x) => ({ ...acc, [x]: (acc[String(x)] ?? 0) + 1 }),
    {},
  );

describe('boardSizeFor', () => {
  it('uses the standard board for 3-4 players and the large one for 5-6', () => {
    expect(boardSizeFor(3)).toBe('standard');
    expect(boardSizeFor(4)).toBe('standard');
    expect(boardSizeFor(5)).toBe('large');
    expect(boardSizeFor(6)).toBe('large');
  });
});

describe.each<BoardSize>(['standard', 'large'])('setupBoard (%s)', (size) => {
  const config = BOARD_CONFIG[size];
  const geo = getGeometry(size);

  it('lays out every terrain the configured number of times', () => {
    const board = setupBoard(size, seededShuffle(1));
    expect(board.hexes).toHaveLength(geo.hexes.length);
    expect(countBy(board.hexes.map((h) => h.terrain))).toEqual(config.terrains);
  });

  it('puts a number on every hex except deserts, using each number token once', () => {
    const board = setupBoard(size, seededShuffle(2));
    for (const hex of board.hexes) {
      if (hex.terrain === 'desert') expect(hex.token).toBeNull();
      else expect(hex.token).not.toBeNull();
    }
    const tokens = board.hexes.flatMap((h) => (h.token === null ? [] : [h.token]));
    expect(countBy(tokens)).toEqual(countBy(config.tokens));
  });

  it('never puts a 6 or 8 next to another 6 or 8', () => {
    for (let seed = 0; seed < 200; seed++) {
      const board = setupBoard(size, seededShuffle(seed));
      const hot = (id: number) => [6, 8].includes(board.hexes[id]!.token ?? 0);
      for (const hex of geo.hexes) {
        if (!hot(hex.id)) continue;
        expect(hex.neighbours.filter(hot), `seed ${seed}, hex ${hex.id}`).toEqual([]);
      }
    }
  });

  it('starts the bandit on a desert', () => {
    const board = setupBoard(size, seededShuffle(3));
    expect(board.hexes[board.bandit]!.terrain).toBe('desert');
  });

  it('fills every harbour slot with the configured harbour kinds', () => {
    const board = setupBoard(size, seededShuffle(4));
    expect(board.harbours).toHaveLength(geo.harbourSlots.length);
    expect(countBy(board.harbours)).toEqual(countBy(config.harbours));
  });

  it('is fully determined by the shuffle', () => {
    expect(setupBoard(size, seededShuffle(5))).toEqual(setupBoard(size, seededShuffle(5)));
    expect(setupBoard(size, seededShuffle(5))).not.toEqual(setupBoard(size, seededShuffle(6)));
  });

  it('works with a shuffle that keeps the order', () => {
    const board = setupBoard(size, (items) => [...items]);
    expect(countBy(board.hexes.map((h) => h.terrain))).toEqual(config.terrains);
  });
});
