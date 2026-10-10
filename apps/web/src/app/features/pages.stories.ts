import { provideRouter } from '@angular/router';
import type { ListRoomsResponse } from '@board-table/shared';
import type { Meta, StoryObj } from '@storybook/angular-vite';
import { applicationConfig } from '@storybook/angular-vite';
import { ApiClient } from '../core/api-client';
import { CatalogPage } from './catalog/catalog.page';
import { GameDetailPage } from './game-detail/game-detail.page';
import { JoinPage } from './join/join.page';
import { MyRoomsPage } from './my-rooms/my-rooms.page';

/** Host pages with a mocked API (no login needed in Storybook). */
const rooms: ListRoomsResponse = {
  rooms: [
    {
      roomId: 'AbCdEfGhIjKlMnOpQrSt_-',
      gameId: 'tictactoe',
      status: 'waiting',
      maxSeats: 2,
      seats: [{ seatIndex: 0, name: 'Ivan', isHost: true }],
      createdAt: new Date(Date.now() - 4 * 60_000).toISOString(),
    },
    {
      roomId: 'BbCdEfGhIjKlMnOpQrSt_-',
      gameId: 'tictactoe',
      status: 'playing',
      maxSeats: 2,
      seats: [
        { seatIndex: 0, name: 'Ivan', isHost: true },
        { seatIndex: 1, name: 'Mara Lind', isHost: false },
      ],
      createdAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    },
  ],
};

const mockApi: Partial<ApiClient> = {
  listRooms: async () => rooms,
  createRoom: async () => {
    throw new Error('Storybook: hosting is disabled');
  },
  preview: async () => ({
    gameId: 'tictactoe',
    gameName: 'Tic-tac-toe',
    hostName: 'Ivan',
    status: 'waiting',
    maxSeats: 2,
    freeSeats: 1,
  }),
};

const meta: Meta = {
  title: 'Pages',
  decorators: [
    applicationConfig({
      providers: [provideRouter([]), { provide: ApiClient, useValue: mockApi }],
    }),
  ],
  parameters: { layout: 'fullscreen' },
};
export default meta;

export const Catalog: StoryObj<CatalogPage> = {
  render: () => ({ template: `<bt-catalog-page />` }),
  decorators: [(story) => ({ ...story(), moduleMetadata: { imports: [CatalogPage] } })],
};

export const GameDetail: StoryObj<GameDetailPage> = {
  name: 'Game detail',
  render: () => ({ template: `<bt-game-detail-page gameId="tictactoe" />` }),
  decorators: [(story) => ({ ...story(), moduleMetadata: { imports: [GameDetailPage] } })],
};

export const MyRooms: StoryObj<MyRoomsPage> = {
  name: 'My rooms',
  render: () => ({ template: `<bt-my-rooms-page />` }),
  decorators: [(story) => ({ ...story(), moduleMetadata: { imports: [MyRoomsPage] } })],
};

export const Join: StoryObj<JoinPage> = {
  name: 'Join (guest)',
  render: () => ({
    template: `<bt-join-page roomId="AbCdEfGhIjKlMnOpQrSt_-" fragment="t=TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT" />`,
  }),
  decorators: [(story) => ({ ...story(), moduleMetadata: { imports: [JoinPage] } })],
};
