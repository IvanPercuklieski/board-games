import type { Meta, StoryObj } from '@storybook/angular-vite';
import { moduleMetadata } from '@storybook/angular-vite';
import { settlementSpots } from '@board-table/games';
import { CatanMapComponent } from './catan-map.component';
import { sampleState as midGame } from './catan-sample';

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
