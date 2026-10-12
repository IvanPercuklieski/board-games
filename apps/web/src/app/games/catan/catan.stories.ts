import type { Meta, StoryObj } from '@storybook/angular-vite';
import { moduleMetadata } from '@storybook/angular-vite';
import { Catan, settlementSpots, roadSpots, type CatanState } from '@board-table/games';
import { Client } from 'boardgame.io/client';
import { CatanMapComponent } from './catan-map.component';

/** A start state from the real rules, with a few pieces placed by each player. */
function midGame(numPlayers: number, seed: string): CatanState {
  const client = Client({ game: { ...Catan, seed }, numPlayers, debug: false });
  client.start();
  const G = structuredClone(client.getState()!.G) as CatanState;
  client.stop();
  for (let round = 0; round < 2; round++) {
    for (let p = 0; p < numPlayers; p++) {
      const id = String(p);
      const spots = settlementSpots(G, id, false);
      const vertex = spots[(p * 7 + round * 13) % spots.length]!;
      G.buildings[vertex] = { owner: id, kind: round === 1 && p % 2 === 0 ? 'city' : 'settlement' };
      const edge = roadSpots(G, id, vertex)[0]!;
      G.roads[edge] = id;
      G.roads[roadSpots(G, id)[0]!] = id;
    }
  }
  return G;
}

const meta: Meta<CatanMapComponent> = {
  title: 'Games/Catan/Map',
  component: CatanMapComponent,
  decorators: [moduleMetadata({ imports: [CatanMapComponent] })],
  render: (args) => ({
    props: args,
    template: `<div style="max-width:52rem"><bt-catan-map [state]="state" [targets]="targets" /></div>`,
  }),
};
export default meta;

type Story = StoryObj<CatanMapComponent>;

export const FourPlayers: Story = {
  name: '3-4 players',
  args: { state: midGame(4, 'story-4'), targets: null },
};

export const SixPlayers: Story = {
  name: '5-6 players (large island)',
  args: { state: midGame(6, 'story-6'), targets: null },
};

const placing = midGame(3, 'story-3');
export const PlacingASettlement: Story = {
  name: 'Picking a corner',
  args: {
    state: placing,
    targets: {
      kind: 'vertex',
      ids: settlementSpots(placing, '0', false),
      verb: 'Build a settlement',
    },
  },
};

export const MovingTheBandit: Story = {
  name: 'Moving the Bandit',
  args: {
    state: placing,
    targets: {
      kind: 'hex',
      ids: placing.board.hexes.flatMap((_, i) => (i === placing.bandit ? [] : [i])),
      verb: 'Move the Bandit',
    },
  },
};
