import { describe, expect, it } from 'vitest';
import { noResources } from './resources';
import type { CatanState } from './state';
import { openTable, scriptedDice } from './testing';

function table(prepare: (G: CatanState) => void = () => {}) {
  const t = openTable({
    numPlayers: 3,
    skipSetup: true,
    dice: scriptedDice([1, 1]),
    prepare: (G) => {
      for (const tile of G.board.hexes) tile.token = null;
      G.hands['0']!.resources = { ...noResources(), wool: 3 };
      G.hands['1']!.resources = { ...noResources(), ore: 2 };
      G.hands['2']!.resources = { ...noResources(), ore: 1 };
      prepare(G);
    },
  });
  t.moves['rollDice']!();
  return t;
}

const OFFER = { give: { wool: 2 }, want: { ore: 1 } };

describe('Trading with other players', () => {
  it('opens an offer that every other player can answer', () => {
    const t = table();
    t.moves['offerTrade']!(OFFER.give, OFFER.want);
    expect(t.G.turn.trade).toEqual({
      give: { ...noResources(), wool: 2 },
      want: { ...noResources(), ore: 1 },
      responses: {},
    });
    expect(t.stageOf('0')).toBe('trading');
    expect(t.stageOf('1')).toBe('tradeResponse');
    expect(t.stageOf('2')).toBe('tradeResponse');
  });

  it('rejects offers the player cannot cover or that make no sense', () => {
    const t = table();
    t.moves['offerTrade']!({ wool: 4 }, { ore: 1 });
    t.moves['offerTrade']!({}, { ore: 1 });
    t.moves['offerTrade']!({ wool: 1 }, {});
    t.moves['offerTrade']!({ wool: 1 }, { wool: 1, ore: 1 });
    t.moves['offerTrade']!('wool', { ore: 1 });
    expect(t.G.turn.trade).toBeNull();
    expect(t.stageOf('0')).toBe('actions');
  });

  it('cannot offer before rolling', () => {
    const t = openTable({ numPlayers: 3, skipSetup: true });
    t.moves['offerTrade']!(OFFER.give, OFFER.want);
    expect(t.G.turn.trade).toBeNull();
  });

  it('lets players accept only what they can pay, and change their answer', () => {
    const t = table((G) => {
      G.hands['2']!.resources = noResources();
    });
    t.moves['offerTrade']!(OFFER.give, OFFER.want);
    t.as('2')['respondTrade']!(true);
    t.as('2')['respondTrade']!(false);
    t.as('1')['respondTrade']!(true);
    t.as('1')['respondTrade']!('yes');
    expect(t.G.turn.trade!.responses).toEqual({ '1': true, '2': false });
    t.as('1')['respondTrade']!(false);
    expect(t.G.turn.trade!.responses['1']).toBe(false);
  });

  it('swaps the cards with a player who accepted', () => {
    const t = table();
    t.moves['offerTrade']!(OFFER.give, OFFER.want);
    t.as('1')['respondTrade']!(true);
    t.moves['confirmTrade']!('2'); // has not accepted
    expect(t.G.turn.trade).not.toBeNull();
    t.moves['confirmTrade']!('1');
    expect(t.G.hands['0']!.resources).toMatchObject({ wool: 1, ore: 1 });
    expect(t.G.hands['1']!.resources).toMatchObject({ wool: 2, ore: 1 });
    expect(t.G.turn.trade).toBeNull();
    expect(t.stageOf('0')).toBe('actions');
    expect(t.stageOf('1')).toBeUndefined();
  });

  it('does not let a responder confirm, or the current player answer', () => {
    const t = table();
    t.moves['offerTrade']!(OFFER.give, OFFER.want);
    t.as('0')['respondTrade']!(true);
    t.as('1')['respondTrade']!(true);
    t.as('1')['confirmTrade']!('1');
    expect(t.G.turn.trade!.responses).toEqual({ '1': true });
    expect(t.G.hands['1']!.resources.ore).toBe(2);
  });

  it('cancels the offer and returns to building', () => {
    const t = table();
    t.moves['offerTrade']!(OFFER.give, OFFER.want);
    t.moves['cancelTrade']!();
    expect(t.G.turn.trade).toBeNull();
    expect(t.stageOf('0')).toBe('actions');
    expect(t.stageOf('1')).toBeUndefined();
    t.moves['endTurn']!();
    expect(t.ctx.currentPlayer).toBe('1');
  });
});
