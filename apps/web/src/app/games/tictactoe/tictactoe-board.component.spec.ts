import { TicTacToe, type TicTacToeState } from '@board-table/games';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { Local } from 'boardgame.io/multiplayer';
import { GameSession } from '../../game-client/game-session';
import { PIECE_ANIMATOR, PREFERS_REDUCED_MOTION } from '../../game-kit/place-piece.directive';
import { TicTacToeBoardComponent } from './tictactoe-board.component';

let tables = 0;
const sessions: GameSession<TicTacToeState>[] = [];

/** Ivan (X, player 0) and Mara (O, player 1) at a local in-memory table. */
function table() {
  const multiplayer = Local();
  const matchID = `board-${tables++}`;
  const [ivan, mara] = ['0', '1'].map((playerID) => {
    const s = new GameSession<TicTacToeState>({
      game: TicTacToe,
      matchID,
      playerID,
      credentials: 'x',
      multiplayer,
      playerNames: ['Ivan', 'Mara'],
    });
    s.start();
    sessions.push(s);
    return s;
  }) as [GameSession<TicTacToeState>, GameSession<TicTacToeState>];
  return { ivan, mara };
}

async function renderBoard(session: GameSession<TicTacToeState>) {
  await vi.waitFor(() => expect(session.G()).toBeDefined());
  const view = await render(TicTacToeBoardComponent, {
    inputs: { session },
    providers: [
      { provide: PIECE_ANIMATOR, useValue: () => ({ stop: () => undefined }) },
      { provide: PREFERS_REDUCED_MOTION, useValue: () => false },
    ],
  });
  return view;
}

const grid = () => screen.getByRole('group', { name: 'Tic-tac-toe board' });
const cell = (row: number, col: number) =>
  within(grid()).getByRole('button', { name: new RegExp(`^Row ${row}, column ${col}`) });

describe('TicTacToeBoardComponent', () => {
  afterEach(() => sessions.splice(0).forEach((s) => s.stop()));

  it('shows nine empty cells you can mark on your turn', async () => {
    const { ivan } = table();
    await renderBoard(ivan);
    expect(within(grid()).getAllByRole('button')).toHaveLength(9);
    expect(cell(1, 1).getAttribute('aria-label')).toBe('Row 1, column 1: empty');
    expect((cell(1, 1) as HTMLButtonElement).disabled).toBe(false);
  });

  it('places your mark and passes the turn', async () => {
    const { ivan, mara } = table();
    await renderBoard(ivan);
    await userEvent.click(cell(2, 2));
    await vi.waitFor(() =>
      expect(cell(2, 2).getAttribute('aria-label')).toBe('Row 2, column 2: X (Ivan)'),
    );
    await vi.waitFor(() => expect(mara.G()!.cells[4]).toBe('0'));
    expect((cell(1, 1) as HTMLButtonElement).disabled).toBe(true); // Mara's turn now
  });

  it('cannot be played when it is not your turn', async () => {
    const { mara } = table();
    await renderBoard(mara);
    expect((cell(1, 1) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Waiting for Ivan…')).toBeTruthy();
  });

  it('highlights the winning line', async () => {
    const { ivan, mara } = table();
    await vi.waitFor(() => expect(ivan.G()).toBeDefined());
    for (const [s, c] of [
      [ivan, 0],
      [mara, 3],
      [ivan, 1],
      [mara, 4],
      [ivan, 2],
    ] as const) {
      await vi.waitFor(() => expect(s.isMyTurn()).toBe(true));
      s.move('clickCell', c);
    }
    await vi.waitFor(() => expect(mara.gameover()).toBeDefined());
    await renderBoard(mara);
    const winning = within(grid())
      .getAllByRole('button')
      .filter((b) => b.classList.contains('winning'));
    expect(winning.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Row 1, column 1: X (Ivan), winning line',
      'Row 1, column 2: X (Ivan), winning line',
      'Row 1, column 3: X (Ivan), winning line',
    ]);
    expect(
      within(grid())
        .getAllByRole('button')
        .every((b) => (b as HTMLButtonElement).disabled),
    ).toBe(true);
  });
});
