import { TicTacToe, type TicTacToeState } from '@board-table/games';
import { Local } from 'boardgame.io/multiplayer';
import { GameSession } from './game-session';

let tables = 0;

/**
 * Two players at one in-memory table (boardgame.io Local master), no server needed.
 * boardgame.io caches Local masters per game, so each table gets its own match id.
 */
function table() {
  const multiplayer = Local();
  const matchID = `m${tables++}`;
  const names = ['Ivan', 'Mara'];
  const sessions = ['0', '1'].map(
    (playerID) =>
      new GameSession<TicTacToeState>({
        game: TicTacToe,
        matchID,
        playerID,
        credentials: 'secret',
        multiplayer,
        playerNames: names,
      }),
  );
  sessions.forEach((s) => s.start());
  return sessions as [GameSession<TicTacToeState>, GameSession<TicTacToeState>];
}

describe('GameSession', () => {
  const open: GameSession<TicTacToeState>[] = [];
  afterEach(() => open.splice(0).forEach((s) => s.stop()));

  it('exposes the synced game state as signals', async () => {
    const [ivan, mara] = table();
    open.push(ivan, mara);
    await vi.waitFor(() => expect(ivan.G()).toBeDefined());
    expect(ivan.G()!.cells).toEqual(Array(9).fill(null));
    expect(ivan.isMyTurn()).toBe(true);
    expect(mara.isMyTurn()).toBe(false);
    expect(ivan.currentPlayer()).toBe('0');
  });

  it('sends moves and every seat sees the result', async () => {
    const [ivan, mara] = table();
    open.push(ivan, mara);
    await vi.waitFor(() => expect(ivan.G()).toBeDefined());
    ivan.move('clickCell', 4);
    await vi.waitFor(() => expect(mara.G()!.cells[4]).toBe('0'));
    expect(mara.isMyTurn()).toBe(true);
  });

  it('reports the end of the game', async () => {
    const [ivan, mara] = table();
    open.push(ivan, mara);
    await vi.waitFor(() => expect(ivan.G()).toBeDefined());
    for (const [s, cell] of [
      [ivan, 0],
      [mara, 3],
      [ivan, 1],
      [mara, 4],
      [ivan, 2],
    ] as const) {
      await vi.waitFor(() => expect(s.isMyTurn()).toBe(true));
      s.move('clickCell', cell);
    }
    await vi.waitFor(() => expect(mara.gameover()).toEqual({ winner: '0' }));
    expect(mara.isMyTurn()).toBe(false);
  });

  it('lists players with names, the current turn and who is you', async () => {
    const [ivan, mara] = table();
    open.push(ivan, mara);
    await vi.waitFor(() => expect(mara.G()).toBeDefined());
    expect(mara.players()).toEqual([
      { playerID: '0', seatIndex: 0, name: 'Ivan', isYou: false, isCurrent: true },
      { playerID: '1', seatIndex: 1, name: 'Mara', isYou: true, isCurrent: false },
    ]);
  });

  it('ignores moves that are not allowed (wrong turn, unknown move)', async () => {
    const [ivan, mara] = table();
    open.push(ivan, mara);
    await vi.waitFor(() => expect(ivan.G()).toBeDefined());
    mara.move('clickCell', 0); // not Mara's turn
    ivan.move('noSuchMove');
    await new Promise((r) => setTimeout(r, 20));
    expect(ivan.G()!.cells.every((c) => c === null)).toBe(true);
  });

  it('stops: no further updates after stop()', async () => {
    const [ivan, mara] = table();
    open.push(mara);
    await vi.waitFor(() => expect(ivan.G()).toBeDefined());
    ivan.stop();
    mara.move('clickCell', 0); // still Ivan's turn; nothing should reach the stopped session
    ivan.move('clickCell', 4);
    await new Promise((r) => setTimeout(r, 20));
    expect(ivan.G()!.cells.every((c) => c === null)).toBe(true);
  });
});
