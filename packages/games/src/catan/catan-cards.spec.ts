import { describe, expect, it } from 'vitest';
import type { DevCard } from './config';
import { getGeometry } from './geometry';
import { noResources, total } from './resources';
import { publicPoints, victoryPoints } from './scoring';
import type { CatanState } from './state';
import { openTable, scriptedDice } from './testing';

const geo = getGeometry('standard');
const QUIET: [number, number] = [1, 1];

/** Nothing produces; player 0 has a settlement on a coastal corner with a road. */
function table(prepare: (G: CatanState) => void = () => {}, rolls = 6) {
  const start = geo.edges[geo.coast[2]!]!;
  const t = openTable({
    numPlayers: 3,
    skipSetup: true,
    dice: scriptedDice(...Array<[number, number]>(rolls).fill(QUIET)),
    prepare: (G) => {
      for (const tile of G.board.hexes) tile.token = null;
      G.buildings[start.vertices[0]] = { owner: '0', kind: 'settlement' };
      G.roads[start.id] = '0';
      prepare(G);
    },
  });
  return t;
}

const holding =
  (...cards: DevCard[]) =>
  (G: CatanState) => {
    G.hands['0']!.cards.push(...cards);
  };

/** Ends turns until it is player 0's turn again (each player rolls first). */
function backToPlayer0(t: ReturnType<typeof table>) {
  do {
    if (t.stageOf(t.ctx.currentPlayer) === 'roll') t.moves['rollDice']!();
    t.moves['endTurn']!();
  } while (t.ctx.currentPlayer !== '0');
}

describe('Buying development cards', () => {
  it('takes the top card for wool, grain and ore; it waits until the next turn', () => {
    const t = table((G) => {
      G.hands['0']!.resources = { ...noResources(), wool: 1, grain: 1, ore: 1 };
      G.secret.devDeck = ['landmark', 'guard'];
    });
    t.moves['rollDice']!();
    t.moves['buyCard']!();
    expect(t.G.hands['0']!.newCards).toEqual(['guard']);
    expect(t.G.secret.devDeck).toEqual(['landmark']);
    expect(total(t.G.hands['0']!.resources)).toBe(0);
    expect(t.G.bank).toMatchObject({ wool: 20, grain: 20, ore: 20 });

    t.moves['playGuard']!();
    expect(t.G.players['0']!.guards).toBe(0);

    backToPlayer0(t);
    expect(t.G.hands['0']!.cards).toEqual(['guard']);
    expect(t.G.hands['0']!.newCards).toEqual([]);
  });

  it('needs the resources and a card left in the deck', () => {
    const poor = table();
    poor.moves['rollDice']!();
    poor.moves['buyCard']!();
    expect(poor.G.hands['0']!.newCards).toEqual([]);

    const empty = table((G) => {
      G.hands['0']!.resources = { ...noResources(), wool: 1, grain: 1, ore: 1 };
      G.secret.devDeck = [];
    });
    empty.moves['rollDice']!();
    empty.moves['buyCard']!();
    expect(empty.G.hands['0']!.resources.ore).toBe(1);
  });
});

describe('Playing development cards', () => {
  it('plays a Guard before rolling, moves the bandit, then rolls', () => {
    const t = table(holding('guard'));
    t.moves['playGuard']!();
    expect(t.stageOf('0')).toBe('bandit');
    expect(t.G.players['0']!.guards).toBe(1);
    expect(t.G.hands['0']!.cards).toEqual([]);
    t.moves['moveBandit']!(t.G.bandit === 0 ? 1 : 0);
    expect(t.stageOf('0')).toBe('roll');
  });

  it('plays a Guard after rolling and returns to building', () => {
    const t = table(holding('guard'));
    t.moves['rollDice']!();
    t.moves['playGuard']!();
    t.moves['moveBandit']!(t.G.bandit === 0 ? 1 : 0);
    expect(t.stageOf('0')).toBe('actions');
  });

  it('allows only one card per turn', () => {
    const t = table(holding('guard', 'windfall'));
    t.moves['rollDice']!();
    t.moves['playWindfall']!('ore', 'ore');
    t.moves['playGuard']!();
    expect(t.stageOf('0')).toBe('actions');
    expect(t.G.hands['0']!.cards).toEqual(['guard']);
  });

  it('cannot play a card the player does not hold, or a Landmark', () => {
    const t = table(holding('landmark'));
    t.moves['rollDice']!();
    t.moves['playGuard']!();
    t.moves['playRoadCrew']!();
    t.moves['playMarket']!('ore');
    t.moves['playWindfall']!('ore', 'ore');
    expect(t.G.turn.cardPlayed).toBe(false);
    expect(t.G.hands['0']!.cards).toEqual(['landmark']);
  });

  it('Road Crew places two free roads, then returns', () => {
    const t = table(holding('roadCrew'));
    t.moves['rollDice']!();
    t.moves['playRoadCrew']!();
    expect(t.stageOf('0')).toBe('roadCrew');
    expect(t.G.turn.freeRoads).toBe(2);
    t.moves['placeFreeRoad']!(geo.coast[3]);
    t.moves['placeFreeRoad']!(geo.coast[10]); // not connected
    t.moves['placeFreeRoad']!(geo.coast[4]);
    expect(t.G.roads[geo.coast[3]!]).toBe('0');
    expect(t.G.roads[geo.coast[4]!]).toBe('0');
    expect(t.G.players['0']!.roads).toBe(13);
    expect(total(t.G.hands['0']!.resources)).toBe(0);
    expect(t.stageOf('0')).toBe('actions');
  });

  it('Road Crew places only the roads left in the supply', () => {
    const t = table((G) => {
      holding('roadCrew')(G);
      G.players['0']!.roads = 1;
    });
    t.moves['rollDice']!();
    t.moves['playRoadCrew']!();
    t.moves['placeFreeRoad']!(geo.coast[3]);
    expect(t.G.players['0']!.roads).toBe(0);
    expect(t.stageOf('0')).toBe('actions');

    const none = table((G) => {
      holding('roadCrew')(G);
      G.players['0']!.roads = 0;
    });
    none.moves['rollDice']!();
    none.moves['playRoadCrew']!();
    expect(none.G.hands['0']!.cards).toEqual(['roadCrew']);
  });

  it('Windfall takes any two resources from the bank', () => {
    const t = table(holding('windfall'));
    t.moves['rollDice']!();
    t.moves['playWindfall']!('ore', 'gold');
    t.moves['playWindfall']!('ore', 'clay');
    expect(t.G.hands['0']!.resources).toMatchObject({ ore: 1, clay: 1 });
    expect(t.G.bank).toMatchObject({ ore: 18, clay: 18 });
  });

  it('Windfall needs the bank to have both cards', () => {
    const t = table((G) => {
      holding('windfall')(G);
      G.bank.ore = 1;
    });
    t.moves['rollDice']!();
    t.moves['playWindfall']!('ore', 'ore');
    expect(t.G.hands['0']!.resources.ore).toBe(0);
    t.moves['playWindfall']!('ore', 'wool');
    expect(t.G.hands['0']!.resources).toMatchObject({ ore: 1, wool: 1 });
  });

  it('Corner the Market takes every card of one resource from all other players', () => {
    const t = table((G) => {
      holding('market')(G);
      G.hands['1']!.resources = { ...noResources(), wool: 3, ore: 1 };
      G.hands['2']!.resources = { ...noResources(), wool: 2 };
    });
    t.moves['rollDice']!();
    t.moves['playMarket']!('sand');
    t.moves['playMarket']!('wool');
    expect(t.G.hands['0']!.resources.wool).toBe(5);
    expect(t.G.hands['1']!.resources).toMatchObject({ wool: 0, ore: 1 });
    expect(t.G.hands['2']!.resources.wool).toBe(0);
  });
});

describe('Strongest Guard', () => {
  const guards = (counts: Record<string, number>, holder: string | null) => (G: CatanState) => {
    for (const [id, n] of Object.entries(counts)) G.players[id]!.guards = n;
    G.awards.strongestGuard = holder;
    G.hands['0']!.cards.push('guard');
  };

  it('goes to the first player to play three Guards', () => {
    const t = table(guards({ '0': 2 }, null));
    t.moves['playGuard']!();
    expect(t.G.awards.strongestGuard).toBe('0');
  });

  it('stays with the holder on a tie and moves to more Guards', () => {
    const tie = table(guards({ '0': 2, '1': 3 }, '1'));
    tie.moves['playGuard']!();
    expect(tie.G.awards.strongestGuard).toBe('1');

    const more = table(guards({ '0': 3, '1': 3 }, '1'));
    more.moves['playGuard']!();
    expect(more.G.awards.strongestGuard).toBe('0');
  });
});

describe('Victory points and winning', () => {
  it('counts buildings, awards and hidden Landmarks', () => {
    const t = table((G) => {
      G.buildings[geo.vertices[20]!.id] = { owner: '0', kind: 'city' };
      G.awards = { longestTrail: '0', strongestGuard: '1' };
      G.hands['0']!.cards.push('landmark');
      G.hands['0']!.newCards.push('landmark', 'guard');
    });
    expect(publicPoints(t.G, '0')).toBe(1 + 2 + 2);
    expect(victoryPoints(t.G, '0')).toBe(5 + 2);
    expect(victoryPoints(t.G, '1')).toBe(2);
  });

  /** Player 0 on 9 points: four cities and a settlement (as set up, with no real roads). */
  const nine = (G: CatanState) => {
    for (const v of [20, 24, 28, 40]) G.buildings[v] = { owner: '0', kind: 'city' };
  };

  it('wins on reaching ten points during their turn', () => {
    const t = table((G) => {
      nine(G);
      G.hands['0']!.resources = { ...noResources(), grain: 2, ore: 3 };
    });
    const corner = t.G.buildings.findIndex((b) => b?.kind === 'settlement');
    t.moves['rollDice']!();
    expect(t.ctx.gameover).toBeUndefined();
    t.moves['buildCity']!(corner);
    expect(t.ctx.gameover).toEqual({ winner: '0' });
  });

  it('wins with a Landmark bought this turn', () => {
    const t = table((G) => {
      nine(G);
      G.hands['0']!.resources = { ...noResources(), wool: 1, grain: 1, ore: 1 };
      G.secret.devDeck = ['landmark'];
    });
    t.moves['rollDice']!();
    t.moves['buyCard']!();
    expect(t.ctx.gameover).toEqual({ winner: '0' });
  });
});
