// Sample positions for stories (not used by the app).
import { Catan, roadSpots, settlementSpots, type CatanState } from '@board-table/games';
import { Client } from 'boardgame.io/client';

/** Two buildings and a few roads per player, spread over the island (deterministic). */
export function placeSamplePieces(G: CatanState, numPlayers: number) {
  for (let round = 0; round < 2; round++) {
    for (let p = 0; p < numPlayers; p++) {
      const id = String(p);
      const spots = settlementSpots(G, id, false);
      const vertex = spots[(p * 7 + round * 13) % spots.length]!;
      G.buildings[vertex] = { owner: id, kind: round === 1 && p % 2 === 0 ? 'city' : 'settlement' };
      G.roads[roadSpots(G, id, vertex)[0]!] = id;
      G.roads[roadSpots(G, id)[0]!] = id;
      G.players[id]!.roads -= 2;
    }
  }
}

/** A start state from the real rules with sample pieces. */
export function sampleState(numPlayers: number, seed: string): CatanState {
  const client = Client({ game: { ...Catan, seed }, numPlayers, debug: false });
  client.start();
  const G = structuredClone(client.getState()!.G) as CatanState;
  client.stop();
  placeSamplePieces(G, numPlayers);
  return G;
}
