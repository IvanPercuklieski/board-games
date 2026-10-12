import type { Ctx, Game } from 'boardgame.io';
import { BOARD_CONFIG, boardSizeFor, type DevCard } from './config';
import { getGeometry } from './geometry';
import { noResources, total } from './resources';
import { setupBoard } from './setup-board';
import { placeRoad, placeSettlement } from './setup-moves';
import type { CatanState, Hand, PlayerBoard, TurnState } from './state';
import {
  discard,
  endTurn,
  makeRollDice,
  moveBandit,
  rollTwoDice,
  type DiceRoller,
} from './turn-moves';

/** Test seams; the real game uses the defaults. */
export interface CatanOptions {
  dice?: DiceRoller;
}

export function freshTurn(): TurnState {
  return {
    rolled: false,
    cardPlayed: false,
    discards: {},
    resume: 'roll',
    freeRoads: 0,
    trade: null,
    specialBuilders: [],
  };
}

function emptyHand(): Hand {
  return { resources: noResources(), cards: [], newCards: [] };
}

function fullSupply(): PlayerBoard {
  return { roads: 15, settlements: 5, cities: 4, guards: 0 };
}

const byPlayer = <T>(ctx: Ctx, make: (id: string) => T): Record<string, T> =>
  Object.fromEntries(ctx.playOrder.map((id) => [id, make(id)]));

/** Setup phase order: around the table, then back the other way (0..n-1, n-1..0). */
function snakeNext({ ctx }: { ctx: Ctx }): number | undefined {
  const done = ctx.turn; // setup is the first phase, so this counts finished setup turns
  const n = ctx.numPlayers;
  if (done >= 2 * n) return undefined;
  return done < n ? done : 2 * n - 1 - done;
}

/**
 * Hides what other players can't see: everyone else's hand (replaced by an empty one, with
 * the sizes in `counts`) and the order of the development deck.
 */
export function catanPlayerView({
  G,
  playerID,
}: {
  G: CatanState;
  playerID: string | null;
}): CatanState {
  return {
    ...G,
    hands: Object.fromEntries(
      Object.entries(G.hands).map(([id, hand]) => [id, id === playerID ? hand : emptyHand()]),
    ),
    secret: { devDeck: [] },
    counts: {
      handSizes: Object.fromEntries(
        Object.entries(G.hands).map(([id, hand]) => [
          id,
          { resources: total(hand.resources), cards: hand.cards.length + hand.newCards.length },
        ]),
      ),
      deckSize: G.secret.devDeck.length,
    },
  };
}

export function makeCatan({ dice = rollTwoDice }: CatanOptions = {}): Game<CatanState> {
  return {
    name: 'catan',
    minPlayers: 3,
    maxPlayers: 6,

    setup: ({ ctx, random }) => {
      const size = boardSizeFor(ctx.numPlayers);
      const config = BOARD_CONFIG[size];
      const geo = getGeometry(size);
      const { bandit, ...board } = setupBoard(size, (items) => random.Shuffle([...items]));
      const deck = (Object.keys(config.devCards) as DevCard[]).flatMap((card) =>
        Array<DevCard>(config.devCards[card]).fill(card),
      );
      const bank = noResources();
      for (const r of Object.keys(bank) as (keyof typeof bank)[]) bank[r] = config.bankPerResource;
      return {
        board,
        bandit,
        buildings: Array(geo.vertices.length).fill(null),
        roads: Array(geo.edges.length).fill(null),
        hands: byPlayer(ctx, emptyHand),
        players: byPlayer(ctx, fullSupply),
        bank,
        awards: { longestTrail: null, strongestGuard: null },
        setupSettlement: null,
        lastRoll: null,
        turn: freshTurn(),
        secret: { devDeck: random.Shuffle(deck) },
      };
    },

    playerView: catanPlayerView,

    phases: {
      setup: {
        start: true,
        next: 'main',
        turn: {
          order: {
            // random first player, then seat order around the table
            playOrder: ({ ctx, random }) => {
              const start = random.Die(ctx.numPlayers) - 1;
              return ctx.playOrder.map((_, i) => ctx.playOrder[(start + i) % ctx.numPlayers]!);
            },
            first: () => 0,
            next: snakeNext,
          },
        },
        moves: { placeSettlement, placeRoad },
      },
      main: {
        turn: {
          order: {
            first: () => 0,
            next: ({ ctx }) => (ctx.playOrderPos + 1) % ctx.numPlayers,
          },
          activePlayers: { currentPlayer: 'roll' },
          onBegin: ({ G }) => {
            G.turn = freshTurn();
          },
          stages: {
            roll: { moves: { rollDice: makeRollDice(dice) } },
            discard: { moves: { discard } },
            bandit: { moves: { moveBandit } },
            actions: { moves: { endTurn } },
          },
        },
      },
    },
  };
}

export const Catan = makeCatan();
