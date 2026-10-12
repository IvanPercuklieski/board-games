import { getGeometry, type CatanState } from '@board-table/games';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import type { GameSession } from '../../game-client/game-session';
import { PIECE_ANIMATOR, PREFERS_REDUCED_MOTION } from '../../game-kit/place-piece.directive';
import { CatanBoardComponent } from './catan-board.component';
import { catanTable, dice, type CatanTableOptions } from './catan-test-table';

const sessions: GameSession<CatanState>[] = [];
afterEach(() => sessions.splice(0).forEach((s) => s.stop()));

function table(options: CatanTableOptions = {}) {
  const seats = catanTable(options);
  sessions.push(...seats);
  return seats;
}

async function renderBoard(session: GameSession<CatanState>) {
  await vi.waitFor(() => expect(session.isConnected()).toBe(true));
  return render(CatanBoardComponent, {
    inputs: { session },
    providers: [
      { provide: PIECE_ANIMATOR, useValue: () => ({ stop: () => undefined }) },
      { provide: PREFERS_REDUCED_MOTION, useValue: () => false },
    ],
  });
}

const prompt = () => screen.getAllByRole('status').find((el) => el.classList.contains('prompt'))!;
const targets = (name: string) =>
  within(screen.getByRole('group', { name })).getAllByRole('button');

const geo = getGeometry('standard');
const START = geo.edges[geo.coast[2]!]!; // player 0's road; its first corner has the settlement
const quiet = (G: CatanState) => {
  for (const tile of G.board.hexes) tile.token = null; // rolls produce nothing
  G.buildings[START.vertices[0]] = { owner: '0', kind: 'settlement' };
  G.roads[START.id] = '0';
};

describe('CatanBoardComponent: setup', () => {
  it('lets the first player place a settlement, then a road next to it', async () => {
    const seats = table();
    await vi.waitFor(() => expect(seats[0]!.ctx()).toBeDefined());
    const first = seats[Number(seats[0]!.ctx()!.currentPlayer)]!;
    await renderBoard(first);

    expect(prompt().textContent).toContain('Place your first settlement');
    const corners = targets('Place a settlement');
    expect(corners).toHaveLength(54);
    await userEvent.click(corners[0]!);

    await vi.waitFor(() => expect(prompt().textContent).toContain('Place a road'));
    const sides = targets('Place a road');
    expect(sides.length).toBeGreaterThanOrEqual(2);
    await userEvent.click(sides[0]!);

    await vi.waitFor(() => expect(prompt().textContent).toMatch(/is placing a settlement…$/));
    expect(screen.queryByRole('group', { name: 'Place a road' })).toBeNull();
  });

  it('shows the others who is placing', async () => {
    const seats = table();
    await vi.waitFor(() => expect(seats[0]!.ctx()).toBeDefined());
    const current = seats[0]!.ctx()!.currentPlayer;
    const other = seats.find((s) => s.playerID !== current)!;
    await renderBoard(other);
    expect(prompt().textContent).toMatch(/^(Ivan|Mara|Ben) is placing a settlement…$/);
    expect(screen.queryAllByRole('group', { name: /Place/ })).toEqual([]);
  });
});

describe('CatanBoardComponent: a turn', () => {
  it('rolls, then builds a road on a picked side', async () => {
    const [ivan] = table({
      skipSetup: true,
      dice: dice([2, 3]),
      prepare: (G) => {
        quiet(G);
        G.hands['0']!.resources = { timber: 1, clay: 1, wool: 0, grain: 0, ore: 0 };
      },
    });
    await renderBoard(ivan!);
    expect(prompt().textContent).toContain('Roll the dice');
    await userEvent.click(screen.getByRole('button', { name: 'Roll the dice' }));
    await vi.waitFor(() =>
      expect(screen.getByRole('img', { name: 'Last roll: 2 and 3, 5' })).toBeTruthy(),
    );

    const road = screen.getByRole('button', { name: /^Road/ });
    expect(screen.getByRole('button', { name: /^Settlement/ }).hasAttribute('disabled')).toBe(true);
    await userEvent.click(road);
    expect(road.getAttribute('aria-pressed')).toBe('true');
    const sides = targets('Build a road');
    await userEvent.click(sides[0]!);

    await vi.waitFor(() => expect(ivan!.G()!.players['0']!.roads).toBe(14));
    expect(screen.queryByRole('group', { name: 'Build a road' })).toBeNull();
    expect(screen.getByRole('button', { name: /^Road/ }).hasAttribute('disabled')).toBe(true);
  });

  it('ends the turn', async () => {
    const [ivan, mara] = table({ skipSetup: true, dice: dice([2, 3]), prepare: quiet });
    await renderBoard(ivan!);
    await userEvent.click(screen.getByRole('button', { name: 'Roll the dice' }));
    await userEvent.click(await screen.findByRole('button', { name: 'End turn' }));
    await vi.waitFor(() => expect(mara!.isMyTurn()).toBe(true));
    expect(prompt().textContent).toBe('Waiting for Mara to roll…');
  });
});

describe('CatanBoardComponent: a seven', () => {
  const sevenTable = () =>
    table({
      skipSetup: true,
      dice: dice([3, 4]),
      prepare: (G) => {
        quiet(G);
        G.hands['1']!.resources = { timber: 5, clay: 0, wool: 4, grain: 0, ore: 0 };
        G.hands['2']!.resources = { timber: 0, clay: 2, wool: 0, grain: 0, ore: 0 };
        const middle = geo.hexes[9]!.vertices;
        G.buildings[middle[0]!] = { owner: '1', kind: 'settlement' };
        G.buildings[middle[2]!] = { owner: '2', kind: 'settlement' };
      },
    });

  it('asks a player with too many cards to give half back', async () => {
    const [ivan, mara] = sevenTable();
    await vi.waitFor(() => expect(ivan!.isMyTurn()).toBe(true));
    ivan!.move('rollDice');
    await renderBoard(mara!);
    await vi.waitFor(() =>
      expect(prompt().textContent).toBe('A seven! Give back 4 of your cards.'),
    );

    const give = screen.getByRole('button', { name: 'Pick 4 more' });
    expect(give.hasAttribute('disabled')).toBe(true);
    for (let i = 0; i < 4; i++) {
      await userEvent.click(screen.getByRole('button', { name: 'One more timber' }));
    }
    expect(give.textContent!.trim()).toBe('Give back 4 timber');
    expect(give.hasAttribute('disabled')).toBe(false);
    await userEvent.click(give);
    await vi.waitFor(() => expect(mara!.G()!.hands['1']!.resources.timber).toBe(1));
    await vi.waitFor(() => expect(prompt().textContent).toBe('Ivan is moving the Bandit…'));
  });

  it('moves the Bandit and asks whom to rob when there is a choice', async () => {
    const [ivan, mara] = sevenTable();
    await vi.waitFor(() => expect(ivan!.isMyTurn()).toBe(true));
    ivan!.move('rollDice');
    await vi.waitFor(() => expect(mara!.isMyTurn()).toBe(true));
    mara!.move('discard', { timber: 4 });
    await renderBoard(ivan!);
    await vi.waitFor(() => expect(prompt().textContent).toBe('Move the Bandit to another land.'));

    const lands = targets('Move the Bandit');
    expect(lands).toHaveLength(18); // every land but the one the Bandit is on
    await userEvent.click(
      lands.find((b) => b.getAttribute('aria-label')!.includes(nameOfMiddle(ivan!)))!,
    );
    expect(prompt().textContent).toBe('Take a card from whom?');
    await userEvent.click(screen.getByRole('button', { name: 'Take a card from Ben (2)' }));
    await vi.waitFor(() => expect(ivan!.G()!.bandit).toBe(9));
    await vi.waitFor(() => expect(ivan!.G()!.hands['0']!.resources.clay).toBe(1));
  });
});

/** The middle land of the standard island is row 3, land 3. */
function nameOfMiddle(session: GameSession<CatanState>): string {
  return `Move the Bandit: ${session.G()!.board.hexes[9]!.terrain}, row 3 land 3`;
}

describe('CatanBoardComponent: trading', () => {
  it('offers a trade that another player accepts', async () => {
    const [ivan, mara] = table({
      skipSetup: true,
      dice: dice([2, 3]),
      prepare: (G) => {
        quiet(G);
        G.hands['0']!.resources = { timber: 0, clay: 0, wool: 2, grain: 0, ore: 0 };
        G.hands['1']!.resources = { timber: 0, clay: 0, wool: 0, grain: 0, ore: 1 };
      },
    });
    await vi.waitFor(() => expect(ivan!.isMyTurn()).toBe(true));
    ivan!.move('rollDice');
    await vi.waitFor(() => expect(ivan!.G()!.turn.rolled).toBe(true));
    ivan!.move('offerTrade', { wool: 2 }, { ore: 1 });

    await renderBoard(mara!);
    await vi.waitFor(() => expect(prompt().textContent).toBe('Ivan wants to trade.'));
    expect(screen.getByText('Ivan offers 2 wool for 1 ore.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await vi.waitFor(() => expect(ivan!.G()!.turn.trade?.responses['1']).toBe(true));

    ivan!.move('confirmTrade', '1');
    await vi.waitFor(() => expect(mara!.G()!.hands['1']!.resources.wool).toBe(2));
  });

  it('shows the player who offered everyone’s answers', async () => {
    const [ivan, mara] = table({
      skipSetup: true,
      dice: dice([2, 3]),
      prepare: (G) => {
        quiet(G);
        G.hands['0']!.resources = { timber: 0, clay: 0, wool: 2, grain: 0, ore: 0 };
        G.hands['1']!.resources = { timber: 0, clay: 0, wool: 0, grain: 0, ore: 1 };
      },
    });
    await renderBoard(ivan!);
    await userEvent.click(screen.getByRole('button', { name: 'Roll the dice' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Trade' }));
    await userEvent.click(screen.getAllByRole('button', { name: 'One more wool' })[0]!);
    await userEvent.click(screen.getAllByRole('button', { name: 'One more ore' })[1]!);
    await userEvent.click(screen.getByRole('button', { name: 'Offer 1 wool for 1 ore' }));

    await vi.waitFor(() => expect(prompt().textContent).toBe('Waiting for answers to your offer.'));
    mara!.move('respondTrade', true);
    await userEvent.click(await screen.findByRole('button', { name: 'Trade with Mara' }));
    await vi.waitFor(() => expect(ivan!.G()!.hands['0']!.resources.ore).toBe(1));
  });
});

describe('CatanBoardComponent: cards and hidden hands', () => {
  it('plays Windfall after picking two resources', async () => {
    const [ivan] = table({
      skipSetup: true,
      prepare: (G) => {
        quiet(G);
        G.hands['0']!.cards = ['windfall'];
      },
    });
    await renderBoard(ivan!);
    await userEvent.click(screen.getByRole('button', { name: 'Play Windfall' }));
    const picker = screen.getByRole('group', { name: 'Windfall: pick two resources' });
    await userEvent.click(within(picker).getByRole('button', { name: 'One more ore' }));
    await userEvent.click(within(picker).getByRole('button', { name: 'One more ore' }));
    await userEvent.click(within(picker).getByRole('button', { name: 'Take them' }));
    await vi.waitFor(() => expect(ivan!.G()!.hands['0']!.resources.ore).toBe(2));
  });

  it('shows only counts of other players’ cards', async () => {
    const [, mara] = table({
      skipSetup: true,
      prepare: (G) => {
        G.hands['0']!.resources = { timber: 3, clay: 0, wool: 0, grain: 0, ore: 0 };
        G.hands['0']!.cards = ['landmark'];
      },
    });
    const { container } = await renderBoard(mara!);
    const players = screen.getByRole('complementary', { name: 'Hand and players' });
    expect(within(players).getByText(/3 cards · 1 development/)).toBeTruthy();
    expect(container.textContent).not.toContain('Landmark');
    expect(mara!.G()!.hands['0']!.resources.timber).toBe(0); // hidden in Mara's view
  });
});

describe('CatanBoardComponent: five or six players', () => {
  it('gives the next player a chance to build between turns', async () => {
    const seats = table({ numPlayers: 6, skipSetup: true, dice: dice([2, 3]) });
    await vi.waitFor(() => expect(seats[0]!.isMyTurn()).toBe(true));
    seats[0]!.move('rollDice');
    await vi.waitFor(() => expect(seats[0]!.G()!.turn.rolled).toBe(true));
    seats[0]!.move('endTurn');

    await renderBoard(seats[1]!);
    await vi.waitFor(() =>
      expect(prompt().textContent).toBe('Your chance to build before the next turn.'),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Done building' }));
    await vi.waitFor(() => expect(prompt().textContent).toBe('Ben is building between turns…'));
  });
});

describe('CatanBoardComponent: counter-offers', () => {
  const tradeTable = () =>
    table({
      skipSetup: true,
      dice: dice([2, 3]),
      prepare: (G) => {
        quiet(G);
        G.hands['0']!.resources = { timber: 0, clay: 0, wool: 3, grain: 0, ore: 0 };
        G.hands['1']!.resources = { timber: 0, clay: 0, wool: 0, grain: 0, ore: 2 };
      },
    });

  it('lets a player suggest other terms, starting from the offer seen from their side', async () => {
    const [ivan, mara] = tradeTable();
    await vi.waitFor(() => expect(ivan!.isMyTurn()).toBe(true));
    ivan!.move('rollDice');
    await vi.waitFor(() => expect(ivan!.G()!.turn.rolled).toBe(true));
    ivan!.move('offerTrade', { wool: 2 }, { ore: 1 });

    await renderBoard(mara!);
    await userEvent.click(await screen.findByRole('button', { name: 'Suggest other terms' }));
    const terms = screen.getByRole('group', { name: 'Your terms' });
    expect(within(terms).getByRole('button', { name: 'Suggest 1 ore for 2 wool' })).toBeTruthy();
    await userEvent.click(within(terms).getAllByRole('button', { name: 'One more wool' })[1]!);
    await userEvent.click(within(terms).getByRole('button', { name: 'Suggest 1 ore for 3 wool' }));

    await vi.waitFor(() =>
      expect(ivan!.G()!.turn.trade?.counters['1']).toMatchObject({
        give: { ore: 1 },
        want: { wool: 3 },
      }),
    );
    expect(screen.getByText(/You suggested 1 ore for 3 wool\. Waiting for Ivan\./)).toBeTruthy();
  });

  it('lets the player who offered accept suggested terms', async () => {
    const [ivan, mara] = tradeTable();
    await vi.waitFor(() => expect(ivan!.isMyTurn()).toBe(true));
    ivan!.move('rollDice');
    await vi.waitFor(() => expect(ivan!.G()!.turn.rolled).toBe(true));
    ivan!.move('offerTrade', { wool: 2 }, { ore: 1 });
    await vi.waitFor(() => expect(mara!.isMyTurn()).toBe(true));
    mara!.move('counterTrade', { ore: 2 }, { wool: 3 });

    await renderBoard(ivan!);
    expect(await screen.findByText(/Mara suggests 2 ore for 3 wool/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Accept Mara’s terms' }));
    await vi.waitFor(() =>
      expect(ivan!.G()!.hands['0']!.resources).toMatchObject({ wool: 0, ore: 2 }),
    );
    await vi.waitFor(() => expect(prompt().textContent).toContain('Build, trade or play a card'));
  });
});
