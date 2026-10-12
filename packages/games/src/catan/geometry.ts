// Hex board geometry: hexes, their corners (vertices) and sides (edges), with adjacency.
//
// Pointy-top hexes on an integer lattice: x counts half hex widths, y counts quarter hex
// heights. A hex in row r centred at x has its corners at
// (x, 3r) top, (x+1, 3r+1), (x+1, 3r+3), (x, 3r+4) bottom, (x-1, 3r+3), (x-1, 3r+1),
// so neighbouring hexes share corners exactly. Ids are indexes, numbered top to bottom,
// left to right, and never change for a board size.

export type BoardSize = 'standard' | 'large';

export interface HexGeo {
  id: number;
  /** Centre on the lattice (see above). */
  x: number;
  y: number;
  /** Corners clockwise from the top. */
  vertices: readonly number[];
  /** Sides clockwise from the upper right one (between corner i and i+1). */
  edges: readonly number[];
  neighbours: readonly number[];
}

export interface VertexGeo {
  id: number;
  x: number;
  y: number;
  hexes: readonly number[];
  edges: readonly number[];
  /** Corners one side away, in the same order as `edges`. */
  neighbours: readonly number[];
}

export interface EdgeGeo {
  id: number;
  vertices: readonly [number, number];
  hexes: readonly number[];
}

export interface BoardGeometry {
  size: BoardSize;
  hexes: readonly HexGeo[];
  vertices: readonly VertexGeo[];
  edges: readonly EdgeGeo[];
  /** Coastal sides (on one hex only) in order around the island. */
  coast: readonly number[];
  /** Coastal sides that hold a harbour, spread evenly around the coast. */
  harbourSlots: readonly number[];
}

const ROWS: Record<BoardSize, readonly number[]> = {
  standard: [3, 4, 5, 4, 3],
  large: [3, 4, 5, 6, 5, 4, 3],
};

const HARBOUR_COUNT: Record<BoardSize, number> = { standard: 9, large: 11 };

const CORNER_OFFSETS: readonly (readonly [number, number])[] = [
  [0, 0],
  [1, 1],
  [1, 3],
  [0, 4],
  [-1, 3],
  [-1, 1],
];

const cache = new Map<BoardSize, BoardGeometry>();

export function getGeometry(size: BoardSize): BoardGeometry {
  let geo = cache.get(size);
  if (!geo) {
    geo = buildGeometry(size);
    cache.set(size, geo);
  }
  return geo;
}

function buildGeometry(size: BoardSize): BoardGeometry {
  const rows = ROWS[size];
  const widest = Math.max(...rows);
  const centres = rows.flatMap((length, r) =>
    Array.from({ length }, (_, i) => ({ x: widest - length + 1 + 2 * i, row: r })),
  );

  const corners = centres.map(({ x, row }) =>
    CORNER_OFFSETS.map(([dx, dy]) => ({ x: x + dx, y: 3 * row + dy })),
  );
  const vertexKeys = uniqueSorted(corners.flat());
  const vertexId = new Map(vertexKeys.map((p, i) => [key(p), i]));
  const hexVertices = corners.map((cs) => cs.map((p) => vertexId.get(key(p))!));

  const sidePairs = hexVertices.map((vs) => vs.map((a, i) => sortedPair(a, vs[(i + 1) % 6]!)));
  const edgeKeys = [...new Set(sidePairs.flat().map(([a, b]) => `${a}-${b}`))]
    .map((k) => k.split('-').map(Number) as [number, number])
    .sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const edgeId = new Map(edgeKeys.map(([a, b], i) => [`${a}-${b}`, i]));
  const hexEdges = sidePairs.map((pairs) => pairs.map(([a, b]) => edgeId.get(`${a}-${b}`)!));

  const hexesOfVertex = vertexKeys.map((): number[] => []);
  hexVertices.forEach((vs, h) => vs.forEach((v) => hexesOfVertex[v]!.push(h)));
  const hexesOfEdge = edgeKeys.map((): number[] => []);
  hexEdges.forEach((es, h) => es.forEach((e) => hexesOfEdge[e]!.push(h)));
  const edgesOfVertex = vertexKeys.map((): number[] => []);
  edgeKeys.forEach(([a, b], e) => {
    edgesOfVertex[a]!.push(e);
    edgesOfVertex[b]!.push(e);
  });

  const edges: EdgeGeo[] = edgeKeys.map((vertices, id) => ({
    id,
    vertices,
    hexes: hexesOfEdge[id]!,
  }));
  const vertices: VertexGeo[] = vertexKeys.map(({ x, y }, id) => ({
    id,
    x,
    y,
    hexes: hexesOfVertex[id]!,
    edges: edgesOfVertex[id]!,
    neighbours: edgesOfVertex[id]!.map((e) => otherEnd(edges[e]!, id)),
  }));
  const hexes: HexGeo[] = centres.map(({ x, row }, id) => ({
    id,
    x,
    y: 3 * row + 2,
    vertices: hexVertices[id]!,
    edges: hexEdges[id]!,
    neighbours: [...new Set(hexEdges[id]!.flatMap((e) => hexesOfEdge[e]!).filter((h) => h !== id))],
  }));

  const coast = walkCoast(edges, vertices);
  const count = HARBOUR_COUNT[size];
  const harbourSlots = Array.from(
    { length: count },
    (_, i) => coast[Math.floor((i * coast.length) / count)]!,
  );
  return { size, hexes, vertices, edges, coast, harbourSlots };
}

/** Follows the sides that belong to one hex only, starting at the lowest id. */
function walkCoast(edges: readonly EdgeGeo[], vertices: readonly VertexGeo[]): number[] {
  const isCoast = (e: number) => edges[e]!.hexes.length === 1;
  const start = edges.find((e) => isCoast(e.id))!;
  const ring = [start.id];
  let at = start.vertices[1];
  for (;;) {
    const previous = ring[ring.length - 1]!;
    const next = vertices[at]!.edges.find((e) => e !== previous && isCoast(e))!;
    if (next === start.id) return ring;
    ring.push(next);
    at = otherEnd(edges[next]!, at);
  }
}

function otherEnd(edge: EdgeGeo, vertex: number): number {
  return edge.vertices[0] === vertex ? edge.vertices[1] : edge.vertices[0];
}

function sortedPair(a: number, b: number): [number, number] {
  return a < b ? [a, b] : [b, a];
}

function key(p: { x: number; y: number }): string {
  return `${p.x},${p.y}`;
}

function uniqueSorted(points: { x: number; y: number }[]): { x: number; y: number }[] {
  const byKey = new Map(points.map((p) => [key(p), p]));
  return [...byKey.values()].sort((p, q) => p.y - q.y || p.x - q.x);
}
