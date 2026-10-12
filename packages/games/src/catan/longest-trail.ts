import { getGeometry } from './geometry';
import type { CatanState } from './state';

const MIN_TRAIL = 5;

/**
 * Length of the player's longest road path that uses no side twice. A rival building on a
 * corner ends the path there (it can reach the corner but not continue through it).
 */
export function trailLength(G: CatanState, playerID: string): number {
  const geo = getGeometry(G.board.size);
  const used = new Set<number>();

  const walk = (vertex: number): number => {
    let best = 0;
    for (const edge of geo.vertices[vertex]!.edges) {
      if (G.roads[edge] !== playerID || used.has(edge)) continue;
      const [a, b] = geo.edges[edge]!.vertices;
      const next = a === vertex ? b : a;
      const building = G.buildings[next];
      used.add(edge);
      best = Math.max(best, 1 + (building && building.owner !== playerID ? 0 : walk(next)));
      used.delete(edge);
    }
    return best;
  };

  const starts = new Set(
    G.roads.flatMap((owner, e) => (owner === playerID ? geo.edges[e]!.vertices : [])),
  );
  return Math.max(0, ...[...starts].map(walk));
}

/**
 * Re-awards Longest Trail: it needs at least five roads. The holder keeps it while tied for the
 * longest; otherwise it goes to the single longest trail, or to nobody if that is a tie.
 */
export function updateLongestTrail(G: CatanState) {
  const lengths = Object.fromEntries(Object.keys(G.players).map((id) => [id, trailLength(G, id)]));
  const best = Math.max(...Object.values(lengths));
  const holder = G.awards.longestTrail;
  if (best < MIN_TRAIL) {
    G.awards.longestTrail = null;
  } else if (holder === null || lengths[holder] !== best) {
    const leaders = Object.keys(lengths).filter((id) => lengths[id] === best);
    G.awards.longestTrail = leaders.length === 1 ? leaders[0]! : null;
  }
}
