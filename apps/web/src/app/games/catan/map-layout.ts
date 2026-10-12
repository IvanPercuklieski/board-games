import { getGeometry, type BoardSize } from '@board-table/games';

/** Hex corner radius in SVG units. */
export const HEX_RADIUS = 10;
const X_UNIT = (HEX_RADIUS * Math.sqrt(3)) / 2; // lattice x = half a hex width
const Y_UNIT = HEX_RADIUS / 2; // lattice y = a quarter of a hex height
/** Sea around the island, with room for the harbour labels. */
const MARGIN = 14;
const HARBOUR_OFFSET = 7.8;

export interface Point {
  x: number;
  y: number;
}

export interface MapLayout {
  width: number;
  height: number;
  hexes: (Point & { id: number; points: string })[];
  vertices: (Point & { id: number })[];
  edges: { id: number; a: Point; b: Point; mid: Point }[];
  /** Harbour slots in geometry order: label position and the two corners it serves. */
  harbours: { slot: number; label: Point; corners: [Point, Point] }[];
}

const cache = new Map<BoardSize, MapLayout>();

/** SVG coordinates for every hex, corner, side and harbour of the board (cached per size). */
export function mapLayout(size: BoardSize): MapLayout {
  let layout = cache.get(size);
  if (!layout) {
    layout = buildLayout(size);
    cache.set(size, layout);
  }
  return layout;
}

function buildLayout(size: BoardSize): MapLayout {
  const geo = getGeometry(size);
  const at = (p: { x: number; y: number }): Point => ({
    x: round(MARGIN + p.x * X_UNIT),
    y: round(MARGIN + p.y * Y_UNIT),
  });
  const vertices = geo.vertices.map((v) => ({ id: v.id, ...at(v) }));
  const hexes = geo.hexes.map((h) => ({
    id: h.id,
    ...at(h),
    points: h.vertices.map((v) => `${vertices[v]!.x},${vertices[v]!.y}`).join(' '),
  }));
  const edges = geo.edges.map((e) => {
    const a = vertices[e.vertices[0]]!;
    const b = vertices[e.vertices[1]]!;
    return { id: e.id, a, b, mid: { x: round((a.x + b.x) / 2), y: round((a.y + b.y) / 2) } };
  });
  const harbours = geo.harbourSlots.map((edgeId, slot) => {
    const edge = edges[edgeId]!;
    const hex = hexes[geo.edges[edgeId]!.hexes[0]!]!;
    const dx = edge.mid.x - hex.x;
    const dy = edge.mid.y - hex.y;
    const len = Math.hypot(dx, dy);
    return {
      slot,
      label: {
        x: round(edge.mid.x + (dx / len) * HARBOUR_OFFSET),
        y: round(edge.mid.y + (dy / len) * HARBOUR_OFFSET),
      },
      corners: [edge.a, edge.b] as [Point, Point],
    };
  });
  const maxX = Math.max(...geo.vertices.map((v) => v.x));
  const maxY = Math.max(...geo.vertices.map((v) => v.y));
  return {
    width: round(2 * MARGIN + maxX * X_UNIT),
    height: round(2 * MARGIN + maxY * Y_UNIT),
    hexes,
    vertices,
    edges,
    harbours,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** A point `from` -> `to` moved `fraction` of the way (used to shorten roads at the corners). */
export function towards(from: Point, to: Point, fraction: number): Point {
  return {
    x: round(from.x + (to.x - from.x) * fraction),
    y: round(from.y + (to.y - from.y) * fraction),
  };
}
