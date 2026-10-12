import { getGeometry, type CatanEventData, type CatanState } from '@board-table/games';
import { render, screen, within } from '@testing-library/angular';
import type { GameSession } from '../../game-client/game-session';
import { CatanLogComponent } from './catan-log.component';
import { describeEvent } from './catan-log';
import { catanTable, dice } from './catan-test-table';

const names: Record<string, string> = { '0': 'Ivan', '1': 'Mara', '2': 'Ben' };
const nameOf = (id: string) => names[id]!;
const G = {
  board: { size: 'standard', hexes: Array(19).fill({ terrain: 'fields', token: 9 }), harbours: [] },
} as unknown as CatanState;
const say = (event: CatanEventData, me = '0') => describeEvent({ ...event, id: 0 }, G, me, nameOf);

describe('describeEvent', () => {
  it.each<[CatanEventData, string, string]>([
    [{ kind: 'roll', player: '1', dice: [3, 5] }, '0', 'Mara rolled 8'],
    [{ kind: 'roll', player: '0', dice: [1, 1] }, '0', 'You rolled 2'],
    [
      { kind: 'gain', gains: { '0': { ore: 2 }, '2': { wool: 1, grain: 1 } } },
      '0',
      'You got 2 ore; Ben got 1 wool and 1 grain',
    ],
    [{ kind: 'discard', player: '2', cards: { timber: 4 } }, '0', 'Ben gave back 4 timber'],
    [{ kind: 'bandit', player: '1', hex: 3 }, '0', 'Mara moved the Bandit to fields 9'],
    [{ kind: 'steal', thief: '0', victim: '2', resource: 'ore' }, '0', 'You took 1 ore from Ben'],
    [
      { kind: 'steal', thief: '1', victim: '0', resource: 'clay' },
      '0',
      'Mara took 1 clay from you',
    ],
    [{ kind: 'steal', thief: '1', victim: '2', resource: null }, '0', 'Mara took a card from Ben'],
    [{ kind: 'build', player: '1', piece: 'city', free: false }, '0', 'Mara built a city'],
    [{ kind: 'build', player: '0', piece: 'road', free: true }, '0', 'You placed a road'],
    [{ kind: 'buyCard', player: '0', card: 'guard' }, '0', 'You bought a development card: Guard'],
    [{ kind: 'buyCard', player: '1', card: null }, '0', 'Mara bought a development card'],
    [{ kind: 'playCard', player: '2', card: 'roadCrew' }, '0', 'Ben played Road Crew'],
    [
      { kind: 'windfall', player: '1', resources: ['ore', 'ore'] },
      '0',
      'Mara played Windfall and took 2 ore',
    ],
    [
      { kind: 'market', player: '1', resource: 'grain', total: 3 },
      '0',
      'Mara played Corner the Market and collected 3 grain',
    ],
    [
      { kind: 'bankTrade', player: '2', give: 'wool', count: 4, get: 'ore' },
      '0',
      'Ben traded 4 wool for 1 ore with the bank',
    ],
    [
      { kind: 'trade', from: '1', to: '0', give: { wool: 2 }, want: { ore: 1 } },
      '0',
      'Mara gave you 2 wool for 1 ore',
    ],
    [{ kind: 'award', award: 'longestTrail', player: '2' }, '0', 'Ben now holds Longest Trail'],
    [{ kind: 'award', award: 'strongestGuard', player: '0' }, '0', 'You now hold Strongest Guard'],
    [{ kind: 'award', award: 'longestTrail', player: null }, '0', 'Nobody holds Longest Trail now'],
  ])('%j as player %s: "%s"', (event, me, text) => {
    expect(say(event, me)).toBe(text);
  });
});

describe('CatanLogComponent', () => {
  const sessions: GameSession<CatanState>[] = [];
  afterEach(() => sessions.splice(0).forEach((s) => s.stop()));

  it('says nothing has happened at the start', async () => {
    await render(CatanLogComponent, {
      inputs: { state: { ...G, events: [] }, me: '0', players: [] },
    });
    expect(screen.getByText('Nothing has happened yet.')).toBeTruthy();
  });

  it('shows a steal’s resource to the thief and victim only, newest first', async () => {
    const geo = getGeometry('standard');
    const corner = geo.hexes[9]!.vertices[0]!;
    const seats = catanTable({
      skipSetup: true,
      dice: dice([3, 4]),
      prepare: (state) => {
        for (const tile of state.board.hexes) tile.token = null;
        state.bandit = 0;
        state.buildings[corner] = { owner: '2', kind: 'settlement' };
        state.hands['2']!.resources = { timber: 0, clay: 1, wool: 0, grain: 0, ore: 0 };
      },
    });
    sessions.push(...seats);
    const [ivan, mara, ben] = seats as [(typeof seats)[0], (typeof seats)[0], (typeof seats)[0]];
    await vi.waitFor(() => expect(ivan.isMyTurn()).toBe(true));
    ivan.move('rollDice');
    await vi.waitFor(() => expect(ivan.G()!.turn.rolled).toBe(true));
    ivan.move('moveBandit', 9, '2');
    await vi.waitFor(() => expect(mara.G()!.events.some((e) => e.kind === 'steal')).toBe(true));
    await vi.waitFor(() => expect(ben.G()!.events.some((e) => e.kind === 'steal')).toBe(true));

    const newest = (session: GameSession<CatanState>, me: string) =>
      describeEvent(session.G()!.events.at(-1)!, session.G()!, me, nameOf);
    expect(newest(ivan, '0')).toBe('You took 1 clay from Ben');
    expect(newest(ben, '2')).toBe('Ivan took 1 clay from you');

    const { container } = await render(CatanLogComponent, {
      inputs: { state: mara.G()!, me: '1', players: mara.players() },
    });
    const lines = within(container)
      .getAllByRole('listitem')
      .map((li) => li.textContent!.trim());
    expect(lines).toEqual([
      'Ivan took a card from Ben',
      expect.stringMatching(/^Ivan moved the Bandit to /),
      'Ivan rolled 7',
    ]);
  });
});
