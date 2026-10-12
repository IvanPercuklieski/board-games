import { TicTacToe, type TicTacToeState } from '@board-table/games';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { Local } from 'boardgame.io/multiplayer';
import { GameSession } from '../game-client/game-session';
import { GameChatComponent } from './game-chat.component';

let tables = 0;
const open: GameSession<TicTacToeState>[] = [];
afterEach(() => open.splice(0).forEach((s) => s.stop()));

function table() {
  const multiplayer = Local();
  const matchID = `chat-${tables++}`;
  return ['0', '1'].map((playerID) => {
    const s = new GameSession<TicTacToeState>({
      game: TicTacToe,
      matchID,
      playerID,
      credentials: 'x',
      multiplayer,
      playerNames: ['Ivan', 'Mara'],
    });
    s.start();
    open.push(s);
    return s;
  }) as [GameSession<TicTacToeState>, GameSession<TicTacToeState>];
}

async function renderChat(session: GameSession<TicTacToeState>) {
  await vi.waitFor(() => expect(session.isConnected()).toBe(true));
  return render(GameChatComponent, { inputs: { session } });
}

const messages = () =>
  within(screen.getByRole('list', { name: 'Chat' }))
    .getAllByRole('listitem')
    .map((li) => li.textContent!.trim());

describe('GameChatComponent', () => {
  it('invites a first message', async () => {
    const [ivan] = table();
    await renderChat(ivan);
    expect(messages()).toEqual(['Say hello to the table.']);
  });

  it('sends a message with Enter and shows it as yours', async () => {
    const [ivan, mara] = table();
    await renderChat(ivan);
    const input = screen.getByRole('textbox', { name: 'Message to the table' });
    await userEvent.type(input, 'good luck{Enter}');
    await vi.waitFor(() => expect(messages()).toEqual(['You: good luck']));
    expect((input as HTMLInputElement).value).toBe('');
    await vi.waitFor(() => expect(mara.chatMessages()).toHaveLength(1));
  });

  it('shows and announces messages from others by name', async () => {
    const [ivan, mara] = table();
    await renderChat(ivan);
    await vi.waitFor(() => expect(mara.isConnected()).toBe(true));
    mara.sendChat('anyone have ore?');
    await vi.waitFor(() => expect(messages()).toEqual(['Mara: anyone have ore?']));
    const live = document.querySelector('[aria-live="polite"]')!;
    expect(live.textContent).toBe('Mara: anyone have ore?');
  });

  it('cannot send an empty message', async () => {
    const [ivan] = table();
    await renderChat(ivan);
    expect(screen.getByRole('button', { name: 'Send' }).hasAttribute('disabled')).toBe(true);
    await userEvent.type(screen.getByRole('textbox'), '   ');
    expect(screen.getByRole('button', { name: 'Send' }).hasAttribute('disabled')).toBe(true);
  });
});
