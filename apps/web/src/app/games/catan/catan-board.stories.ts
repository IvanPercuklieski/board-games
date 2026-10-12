import type { Meta, StoryObj } from '@storybook/angular-vite';
import { moduleMetadata } from '@storybook/angular-vite';
import type { CatanState } from '@board-table/games';
import type { GameSession } from '../../game-client/game-session';
import { CatanBoardComponent } from './catan-board.component';
import { CatanHandComponent } from './catan-hand.component';
import { placeSamplePieces } from './catan-sample';
import { catanTable, dice, type CatanTableOptions } from './catan-test-table';
import { CatanTradeComponent } from './catan-trade.component';

/**
 * Each board story is a real local table (rules running in the browser). `act` makes moves
 * for the other seats once the table is connected; `seat` is the player you look at.
 */
function boardStory(
  options: CatanTableOptions,
  seat: number,
  act: (seats: GameSession<CatanState>[]) => void = () => {},
): StoryObj<CatanBoardComponent> {
  return {
    render: () => {
      const seats = catanTable(options);
      // let the local master answer each seat's sync before acting
      setTimeout(() => act(seats), 50);
      return {
        props: { session: seats[seat] },
        template: `<bt-catan-board [session]="session" />`,
      };
    },
  };
}

const midGame =
  (numPlayers: number, extra: (G: CatanState) => void = () => {}) =>
  (G: CatanState) => {
    placeSamplePieces(G, numPlayers);
    G.hands['0']!.resources = { timber: 2, clay: 1, wool: 3, grain: 2, ore: 1 };
    G.hands['0']!.cards = ['guard', 'windfall', 'landmark'];
    G.hands['0']!.newCards = ['roadCrew'];
    G.hands['1']!.resources = { timber: 0, clay: 2, wool: 0, grain: 1, ore: 4 };
    G.players['1']!.guards = 3;
    G.awards.strongestGuard = '1';
    G.lastRoll = [4, 4];
    extra(G);
  };

const meta: Meta<CatanBoardComponent> = {
  title: 'Games/Catan/Board',
  component: CatanBoardComponent,
  decorators: [moduleMetadata({ imports: [CatanBoardComponent] })],
  parameters: { layout: 'fullscreen' },
};
export default meta;

export const Setup = {
  name: 'Setup: first settlement',
  // with this seed Cy (seat 3) starts
  ...boardStory({ numPlayers: 4, seed: 'story-setup' }, 3),
};

export const YourTurn = {
  name: 'Your turn: build, trade, play a card',
  ...boardStory({ skipSetup: true, dice: dice([3, 3]), prepare: midGame(3) }, 0, ([ivan]) =>
    ivan!.move('rollDice'),
  ),
};

export const Waiting = {
  name: 'Waiting for another player',
  ...boardStory({ skipSetup: true, prepare: midGame(3) }, 1),
};

export const Discard = {
  name: 'A seven: give back cards',
  ...boardStory(
    {
      skipSetup: true,
      dice: dice([5, 2]),
      prepare: midGame(3, (G) => {
        G.hands['1']!.resources = { timber: 3, clay: 2, wool: 2, grain: 1, ore: 1 };
      }),
    },
    1,
    ([ivan]) => ivan!.move('rollDice'),
  ),
};

export const TradeOffer = {
  name: 'Answering a trade offer',
  ...boardStory({ skipSetup: true, dice: dice([3, 3]), prepare: midGame(3) }, 1, ([ivan]) => {
    ivan!.move('rollDice');
    setTimeout(() => ivan!.move('offerTrade', { wool: 2 }, { ore: 1 }), 50);
  }),
};

export const CounterOffer = {
  name: 'Your offer, with suggested terms',
  ...boardStory({ skipSetup: true, dice: dice([3, 3]), prepare: midGame(3) }, 0, ([ivan, mara]) => {
    ivan!.move('rollDice');
    setTimeout(() => ivan!.move('offerTrade', { wool: 2 }, { ore: 1 }), 50);
    setTimeout(() => mara!.move('counterTrade', { ore: 1 }, { wool: 3 }), 100);
  }),
};

export const SixPlayers = {
  name: '5-6 players: building between turns',
  ...boardStory(
    {
      numPlayers: 6,
      skipSetup: true,
      dice: dice([2, 4]),
      prepare: midGame(6, (G) => {
        G.hands['1']!.resources = { timber: 2, clay: 2, wool: 1, grain: 1, ore: 0 };
      }),
    },
    1,
    ([ivan]) => {
      ivan!.move('rollDice');
      setTimeout(() => ivan!.move('endTurn'), 50);
    },
  ),
};

export const Hand: StoryObj<CatanHandComponent> = {
  name: 'Hand panel',
  render: () => ({
    moduleMetadata: { imports: [CatanHandComponent] },
    props: {
      hand: {
        resources: { timber: 2, clay: 0, wool: 3, grain: 1, ore: 4 },
        cards: ['guard', 'guard', 'market', 'landmark'],
        newCards: ['windfall'],
      },
      bank: { timber: 19, clay: 19, wool: 19, grain: 19, ore: 19 },
    },
    template: `<div style="max-width:24rem"><bt-catan-hand [hand]="hand" [bank]="bank" [canPlay]="true" /></div>`,
  }),
};

export const Trade: StoryObj<CatanTradeComponent> = {
  name: 'Trade panel',
  render: () => {
    const [ivan] = catanTable({ skipSetup: true, prepare: midGame(3) });
    return {
      moduleMetadata: { imports: [CatanTradeComponent] },
      props: { ivan },
      template: `
        @if (ivan.G(); as G) {
          <div style="max-width:36rem"><bt-catan-trade [state]="G" me="0" /></div>
        }`,
    };
  },
};
