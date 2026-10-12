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
      counters: {},
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

describe('Counter-offers', () => {
  // Ivan (0) offers 2 wool for 1 ore; Mara (1) has 2 ore, Ben (2) has 1 ore.
  function offered(prepare: (G: CatanState) => void = () => {}) {
    const t = table(prepare);
    t.moves['offerTrade']!(OFFER.give, OFFER.want);
    return t;
  }

  it('lets another player suggest different terms (from their side)', () => {
    const t = offered();
    t.as('1')['counterTrade']!({ ore: 1 }, { wool: 3 });
    expect(t.G.turn.trade!.counters['1']).toEqual({
      give: { ...noResources(), ore: 1 },
      want: { ...noResources(), wool: 3 },
    });
  });

  it('replaces an earlier answer, and an answer replaces the counter', () => {
    const t = offered();
    t.as('1')['respondTrade']!(false);
    t.as('1')['counterTrade']!({ ore: 1 }, { wool: 3 });
    expect(t.G.turn.trade!.responses).toEqual({});
    t.as('1')['counterTrade']!({ ore: 2 }, { wool: 3 });
    expect(t.G.turn.trade!.counters['1']!.give.ore).toBe(2);
    t.as('1')['respondTrade']!(true);
    expect(t.G.turn.trade!.counters).toEqual({});
    expect(t.G.turn.trade!.responses).toEqual({ '1': true });
  });

  it('rejects counters the player cannot cover or that make no sense', () => {
    const t = offered();
    t.as('2')['counterTrade']!({ ore: 2 }, { wool: 1 }); // Ben has 1 ore
    t.as('1')['counterTrade']!({}, { wool: 1 });
    t.as('1')['counterTrade']!({ ore: 1 }, {});
    t.as('1')['counterTrade']!({ ore: 1 }, { ore: 1, wool: 1 });
    t.as('1')['counterTrade']!('ore', { wool: 1 });
    t.as('0')['counterTrade']!({ wool: 1 }, { ore: 1 }); // not for the player who offered
    expect(t.G.turn.trade!.counters).toEqual({});
  });

  it('lets the player who offered accept a counter, trading on its terms', () => {
    const t = offered();
    t.as('1')['counterTrade']!({ ore: 2 }, { wool: 3 });
    t.moves['acceptCounter']!('2'); // Ben made no counter
    expect(t.G.turn.trade).not.toBeNull();
    t.moves['acceptCounter']!('1');
    expect(t.G.hands['0']!.resources).toMatchObject({ wool: 0, ore: 2 });
    expect(t.G.hands['1']!.resources).toMatchObject({ wool: 3, ore: 0 });
    expect(t.G.turn.trade).toBeNull();
    expect(t.stageOf('0')).toBe('actions');
    expect(t.G.events.at(-1)).toMatchObject({
      kind: 'trade',
      from: '0',
      to: '1',
      give: { wool: 3 },
      want: { ore: 2 },
    });
  });

  it('does not accept a counter the player who offered cannot pay', () => {
    const t = offered();
    t.as('1')['counterTrade']!({ ore: 1 }, { wool: 3, grain: 1 });
    t.moves['acceptCounter']!('1');
    expect(t.G.turn.trade!.counters['1']).toBeDefined();
    expect(t.G.hands['1']!.resources.ore).toBe(2);
  });

  it('only the player who offered can accept a counter', () => {
    const t = offered();
    t.as('1')['counterTrade']!({ ore: 1 }, { wool: 2 });
    t.as('1')['acceptCounter']!('1');
    t.as('2')['acceptCounter']!('1');
    expect(t.G.turn.trade!.counters['1']).toBeDefined();
  });
});
