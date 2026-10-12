import type { Meta, StoryObj } from '@storybook/angular-vite';
import { moduleMetadata } from '@storybook/angular-vite';
import { TicTacToe, type TicTacToeState } from '@board-table/games';
import { Local } from 'boardgame.io/multiplayer';
import { GameSession } from '../game-client/game-session';
import { GameChatComponent } from './game-chat.component';

let tables = 0;

/** Ivan's view of a local table where Mara has already said a few things. */
function chatTable(lines: string[]) {
  const multiplayer = Local();
  const matchID = `chat-story-${tables++}`;
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
    return s;
  }) as [GameSession<TicTacToeState>, GameSession<TicTacToeState>];
  setTimeout(() => lines.forEach((line, i) => (i % 2 ? ivan : mara).sendChat(line)), 50);
  return ivan;
}

const meta: Meta<GameChatComponent> = {
  title: 'Game kit/Chat',
  component: GameChatComponent,
  decorators: [moduleMetadata({ imports: [GameChatComponent] })],
};
export default meta;

export const Empty: StoryObj<GameChatComponent> = {
  render: () => ({
    props: { session: chatTable([]) },
    template: `<div style="height:18rem;max-width:22rem;display:grid"><bt-game-chat [session]="session" /></div>`,
  }),
};

export const Conversation: StoryObj<GameChatComponent> = {
  render: () => ({
    props: {
      session: chatTable([
        'Anyone have ore? I can give wool.',
        'I have one, but I want two wool for it',
        'Deal, sending the offer',
        'The bandit is going on your 8, sorry',
      ]),
    },
    template: `<div style="height:18rem;max-width:22rem;display:grid"><bt-game-chat [session]="session" /></div>`,
  }),
};
