import { Catan, type CatanState, type Hand } from '@board-table/games';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import type { Ctx } from 'boardgame.io';
import { Client } from 'boardgame.io/client';
import type { SessionPlayer } from '../../game-client/game-session';
import { CatanDiceComponent } from './catan-dice.component';
import { CatanHandComponent } from './catan-hand.component';
import { CatanPlayersComponent } from './catan-players.component';
import { situation } from './catan-turn';

function start(numPlayers = 3): { G: CatanState; ctx: Ctx } {
  const client = Client({ game: { ...Catan, seed: 'panels' }, numPlayers, debug: false });
  client.start();
  const { G, ctx } = structuredClone(client.getState()!) as { G: CatanState; ctx: Ctx };
  client.stop();
  return { G, ctx };
}

const names: Record<string, string> = { '0': 'Ivan', '1': 'Mara', '2': 'Ben' };
const nameOf = (id: string) => names[id]!;

describe('situation', () => {
  it('asks the active setup player for a settlement, then a road', () => {
    const { G, ctx } = start();
    const me = ctx.currentPlayer;
    expect(situation(G, ctx, me, true, nameOf)).toEqual({ kind: 'setupSettlement', second: false });
    G.setupSettlement = 0;
    expect(situation(G, ctx, me, true, nameOf)).toEqual({ kind: 'setupRoad' });
    expect(situation(G, ctx, me, false, nameOf)).toEqual({
      kind: 'waiting',
      text: `${nameOf(me)} is placing a road`,
    });
  });

  it('says whom the table waits for in the main phase', () => {
    const { G, ctx } = start();
    const main = { ...ctx, phase: 'main', currentPlayer: '0' } as Ctx;
    expect(situation(G, { ...main, activePlayers: { '0': 'roll' } }, '1', false, nameOf)).toEqual({
      kind: 'waiting',
      text: 'Waiting for Ivan to roll',
    });
    G.turn.discards = { '1': 4, '2': 5 };
    const discarding = { ...main, activePlayers: { '1': 'discard', '2': 'discard' } };
    expect(situation(G, discarding, '0', false, nameOf)).toEqual({
      kind: 'waiting',
      text: 'Waiting for Mara and Ben to give back cards',
    });
    expect(situation(G, discarding, '1', true, nameOf)).toEqual({ kind: 'discard', count: 4 });
    G.turn.discards = {};
    const building = { ...main, activePlayers: { '2': 'specialBuild' } };
    expect(situation(G, building, '1', false, nameOf)).toEqual({
      kind: 'waiting',
      text: 'Ben is building between turns',
    });
  });

  it('reports the end of the game', () => {
    const { G, ctx } = start();
    expect(situation(G, { ...ctx, gameover: { winner: '0' } }, '0', false, nameOf)).toEqual({
      kind: 'over',
    });
  });
});

describe('CatanDiceComponent', () => {
  it('names the last roll', async () => {
    await render(CatanDiceComponent, { inputs: { roll: [6, 2] } });
    expect(screen.getByRole('img', { name: 'Last roll: 6 and 2, 8' })).toBeTruthy();
  });

  it('says when nobody has rolled yet', async () => {
    await render(CatanDiceComponent, { inputs: { roll: null } });
    expect(screen.getByRole('img', { name: 'No roll yet' })).toBeTruthy();
  });
});

describe('CatanHandComponent', () => {
  const bank = { timber: 19, clay: 19, wool: 19, grain: 19, ore: 19 };
  const hand = (cards: Hand['cards'], newCards: Hand['newCards'] = []): Hand => ({
    resources: { timber: 1, clay: 0, wool: 2, grain: 0, ore: 0 },
    cards,
    newCards,
  });

  it('lists resources and cards, with no Play button for Landmarks', async () => {
    await render(CatanHandComponent, {
      inputs: { hand: hand(['guard', 'landmark']), bank, canPlay: true },
    });
    const cards = within(screen.getByRole('list', { name: 'Your cards' })).getAllByRole('listitem');
    // only resources held, as cards with a count when more than one
    expect(cards.slice(0, 2).map((li) => li.textContent!.replace(/\s+/g, ' ').trim())).toEqual([
      'Timber',
      'Wool ×2',
    ]);
    expect(screen.getByRole('button', { name: 'Play Guard' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Play Landmark' })).toBeNull();
  });

  it('does not let a card bought this turn be played', async () => {
    await render(CatanHandComponent, {
      inputs: { hand: hand([], ['guard']), bank, canPlay: true },
    });
    expect(screen.getByText('1 new, playable next turn')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play Guard' }).hasAttribute('disabled')).toBe(true);
  });

  it('disables playing when it is not allowed now', async () => {
    await render(CatanHandComponent, { inputs: { hand: hand(['guard']), bank, canPlay: false } });
    expect(screen.getByRole('button', { name: 'Play Guard' }).hasAttribute('disabled')).toBe(true);
  });

  it('asks which resource to collect for Corner the Market', async () => {
    const play = vi.fn();
    await render(CatanHandComponent, {
      inputs: { hand: hand(['market']), bank, canPlay: true },
      on: { play },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Play Corner the Market' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Ore' }));
    await userEvent.click(screen.getByRole('button', { name: 'Collect it from everyone' }));
    expect(play).toHaveBeenCalledWith({ card: 'market', resource: 'ore' });
  });
});

describe('CatanPlayersComponent', () => {
  const players: SessionPlayer[] = ['Ivan', 'Mara', 'Ben'].map((name, i) => ({
    playerID: String(i),
    seatIndex: i,
    name,
    isYou: i === 0,
    isCurrent: i === 1,
  }));

  it('shows points, hidden Landmark points for yourself only, and awards', async () => {
    const { G } = start();
    G.buildings[0] = { owner: '0', kind: 'city' };
    G.buildings[20] = { owner: '1', kind: 'settlement' };
    G.hands['0']!.cards = ['landmark'];
    G.awards.strongestGuard = '1';
    await render(CatanPlayersComponent, { inputs: { state: G, players } });
    const items = screen.getAllByRole('listitem');
    expect(within(items[0]!).getByLabelText('2 points, plus 1 hidden from Landmarks')).toBeTruthy();
    expect(within(items[1]!).getByLabelText('3 points')).toBeTruthy();
    expect(within(items[1]!).getByRole('img', { name: 'Holds Strongest Guard' })).toBeTruthy();
    expect(within(items[0]!).getByRole('img', { name: 'Strongest Guard: not held' })).toBeTruthy();
    expect(
      within(items[1]!).getByRole('img', { name: 'Holds Strongest Guard' }).classList,
    ).toContain('lit');
  });

  it('shows cards in hand, development cards, roads built and Guards played', async () => {
    const { G } = start();
    G.hands['1']!.resources = { timber: 2, clay: 0, wool: 1, grain: 0, ore: 0 };
    G.hands['1']!.cards = ['guard'];
    G.players['1']!.roads = 11;
    G.players['1']!.guards = 2;
    delete G.counts; // a full state (not a player's view): hands are known
    await render(CatanPlayersComponent, { inputs: { state: G, players } });
    const mara = screen.getAllByRole('listitem')[1]!;
    const stats = [...mara.querySelectorAll('dl div')].map(
      (d) => `${d.querySelector('dt')!.textContent} ${d.querySelector('dd')!.textContent}`,
    );
    expect(stats).toEqual(['Cards 3', 'Dev 1', 'Roads 4', 'Guards 2']);
    expect(within(mara).getByText('Turn')).toBeTruthy();
    expect(mara.getAttribute('aria-current')).toBe('true');
  });

  it('shows who is giving back cards and how many', async () => {
    const { G } = start();
    G.turn.discards = { '2': 5 };
    await render(CatanPlayersComponent, {
      inputs: { state: G, players, stages: { '2': 'discard' } },
    });
    expect(within(screen.getAllByRole('listitem')[2]!).getByText('Giving back 5')).toBeTruthy();
  });
});
