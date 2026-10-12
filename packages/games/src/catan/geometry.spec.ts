import { describe, expect, it } from 'vitest';
import { getGeometry, type BoardSize } from './geometry';

const SIZES: { size: BoardSize; hexes: number; vertices: number; edges: number; coast: number }[] =
  [
    { size: 'standard', hexes: 19, vertices: 54, edges: 72, coast: 30 },
    { size: 'large', hexes: 30, vertices: 80, edges: 109, coast: 38 },
  ];

describe.each(SIZES)('$size board geometry', ({ size, hexes, vertices, edges, coast }) => {
  const geo = getGeometry(size);

  it('has the expected number of hexes, corners and sides', () => {
    expect(geo.hexes).toHaveLength(hexes);
    expect(geo.vertices).toHaveLength(vertices);
    expect(geo.edges).toHaveLength(edges);
  });

  it('uses each id as the index into its list', () => {
    geo.hexes.forEach((h, i) => expect(h.id).toBe(i));
    geo.vertices.forEach((v, i) => expect(v.id).toBe(i));
    geo.edges.forEach((e, i) => expect(e.id).toBe(i));
  });

  it('gives every hex six distinct corners and six distinct sides', () => {
    for (const hex of geo.hexes) {
      expect(new Set(hex.vertices).size).toBe(6);
      expect(new Set(hex.edges).size).toBe(6);
    }
  });

  it('links corners, sides and hexes both ways', () => {
    for (const hex of geo.hexes) {
      for (const v of hex.vertices) expect(geo.vertices[v]!.hexes).toContain(hex.id);
      for (const e of hex.edges) expect(geo.edges[e]!.hexes).toContain(hex.id);
      for (const n of hex.neighbours) expect(geo.hexes[n]!.neighbours).toContain(hex.id);
    }
    for (const edge of geo.edges) {
      const [a, b] = edge.vertices;
      expect(geo.vertices[a]!.edges).toContain(edge.id);
      expect(geo.vertices[b]!.edges).toContain(edge.id);
      expect(geo.vertices[a]!.neighbours).toContain(b);
      expect(geo.vertices[b]!.neighbours).toContain(a);
    }
  });

  it('has corners on 1-3 hexes with 2-3 sides, and sides on 1-2 hexes', () => {
    for (const v of geo.vertices) {
      expect(v.hexes.length).toBeGreaterThanOrEqual(1);
      expect(v.hexes.length).toBeLessThanOrEqual(3);
      expect([2, 3]).toContain(v.edges.length);
      expect(v.neighbours).toHaveLength(v.edges.length);
    }
    for (const e of geo.edges) expect([1, 2]).toContain(e.hexes.length);
  });

  it('walks the coast as a closed ring of sides on one hex each', () => {
    expect(geo.coast).toHaveLength(coast);
    expect(new Set(geo.coast).size).toBe(coast);
    geo.coast.forEach((id, i) => {
      expect(geo.edges[id]!.hexes).toHaveLength(1);
      const next = geo.edges[geo.coast[(i + 1) % coast]!]!;
      const shared = geo.edges[id]!.vertices.filter((v) => next.vertices.includes(v));
      expect(shared).toHaveLength(1);
    });
  });

  it('places harbour slots on the coast without sharing a corner', () => {
    expect(geo.harbourSlots).toHaveLength(size === 'standard' ? 9 : 11);
    const corners = geo.harbourSlots.flatMap((e) => geo.edges[e]!.vertices);
    expect(new Set(corners).size).toBe(corners.length);
    for (const e of geo.harbourSlots) expect(geo.coast).toContain(e);
  });

  it('returns the same cached geometry each time', () => {
    expect(getGeometry(size)).toBe(geo);
  });
});

describe('hex positions', () => {
  it('numbers hexes row by row, left to right, starting at the top', () => {
    const { hexes } = getGeometry('standard');
    const ys = hexes.map((h) => h.y);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
    expect(hexes.slice(0, 3).map((h) => h.x)).toEqual([3, 5, 7]);
    const { vertices } = getGeometry('standard');
    expect(Math.min(...vertices.map((v) => v.x))).toBe(0);
    expect(Math.min(...vertices.map((v) => v.y))).toBe(0);
    expect(hexes[9]!.neighbours).toHaveLength(6); // the middle hex
  });
});
