import { provideRouter } from '@angular/router';
import type { ListRoomsResponse, LobbyResponse } from '@board-table/shared';
import type { Meta, StoryObj } from '@storybook/angular-vite';
import { applicationConfig } from '@storybook/angular-vite';
import { ApiClient } from '../core/api-client';
import { CatalogPage } from './catalog/catalog.page';
import { GameDetailPage } from './game-detail/game-detail.page';
import { JoinPage } from './join/join.page';
import { signal } from '@angular/core';
import { AuthService } from '../core/auth.service';
import { ROOM_CONNECTION_FACTORY, type RoomConnection } from '../core/room-connection';
import { MyRoomsPage } from './my-rooms/my-rooms.page';
import { WaitingRoomPage } from './waiting-room/waiting-room.page';
import {
  ChangeGameDialogComponent,
  type ChangeGameData,
} from './waiting-room/change-game-dialog.component';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';

/** Host pages with a mocked API (no login needed in Storybook). */
const rooms: ListRoomsResponse = {
  rooms: [
    {
      roomId: 'AbCdEfGhIjKlMnOpQrSt_-',
      gameId: 'tictactoe',
      status: 'waiting',
      maxSeats: 2,
      seats: [{ seatIndex: 0, name: 'Ivan', isHost: true, away: false }],
      createdAt: new Date(Date.now() - 4 * 60_000).toISOString(),
    },
    {
      roomId: 'BbCdEfGhIjKlMnOpQrSt_-',
      gameId: 'tictactoe',
      status: 'playing',
      maxSeats: 2,
      seats: [
        { seatIndex: 0, name: 'Ivan', isHost: true, away: false },
        { seatIndex: 1, name: 'Mara Lind', isHost: false, away: false },
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

const ROOM = 'AbCdEfGhIjKlMnOpQrSt_-';
const lobbyFor = (seatIndex: number, { away = false } = {}): LobbyResponse => ({
  roomId: ROOM,
  gameId: 'tictactoe',
  status: 'waiting' as const,
  maxSeats: 2,
  seats: [
    { seatIndex: 0, name: 'Ivan', isHost: true, away: false },
    { seatIndex: 1, name: 'Mara Lind', isHost: false, away },
  ].slice(0, seatIndex === 1 || away ? 2 : 1),
  you: { seatIndex, isHost: seatIndex === 0 },
});

/** A room connection that shows one fixed snapshot (no server in Storybook). */
const staticConnection = (lobby: LobbyResponse) => ({
  provide: ROOM_CONNECTION_FACTORY,
  useValue: () =>
    ({
      lobby: signal(lobby),
      connected: signal(true),
      closed: signal(false),
      stop: () => undefined,
    }) as unknown as RoomConnection,
});

/** Seeds this browser's seat (and the host's invite link) before the page renders. */
function seed(seatIndex: number) {
  localStorage.setItem(
    `bt-seat:${ROOM}`,
    JSON.stringify({ seatIndex, credentials: 'C'.repeat(43) }),
  );
  if (seatIndex === 0) {
    localStorage.setItem(
      `bt-invite:${ROOM}`,
      `https://board-table.example/join/${ROOM}#t=${'T'.repeat(43)}`,
    );
  }
}

const waitingRoomStory = (
  name: string,
  seatIndex: number,
  lobby: LobbyResponse,
): StoryObj<WaitingRoomPage> => ({
  name,
  render: () => {
    seed(seatIndex);
    return { template: `<bt-waiting-room-page roomId="${ROOM}" />` };
  },
  decorators: [
    applicationConfig({
      providers: [
        staticConnection(lobby),
        { provide: AuthService, useValue: { isSignedIn: signal(seatIndex === 0) } },
      ],
    }),
    (story) => ({ ...story(), moduleMetadata: { imports: [WaitingRoomPage] } }),
  ],
});

export const WaitingRoomHost = waitingRoomStory('Waiting room (host)', 0, lobbyFor(0));
export const WaitingRoomHostAway = waitingRoomStory(
  'Waiting room (host, a player is away)',
  0,
  lobbyFor(0, { away: true }),
);
export const WaitingRoomGuest = waitingRoomStory('Waiting room (guest)', 1, lobbyFor(1));

const sampleGame = (id: string, displayName: string, minPlayers: number, maxPlayers: number) => ({
  id,
  displayName,
  minPlayers,
  maxPlayers,
  tagline: '',
  description: '',
  tags: [],
  playTimeMinutes: { min: 5, max: 20 },
  complexity: 'light' as const,
});

export const ChangeGameDialog: StoryObj<ChangeGameDialogComponent> = {
  name: 'Change game dialog',
  parameters: { layout: 'centered' },
  render: () => ({ template: `<bt-change-game-dialog />` }),
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: DIALOG_DATA,
          useValue: {
            roomId: ROOM,
            gameId: 'tictactoe',
            maxSeats: 2,
            seated: 2,
            // placeholder games to show the seat picker and a disabled choice
            games: [
              sampleGame('tictactoe', 'Tic-tac-toe', 2, 2),
              sampleGame('sample-party', 'Sample party game', 2, 6),
              sampleGame('sample-solo', 'Sample solo puzzle', 1, 1),
            ],
          } satisfies ChangeGameData,
        },
        { provide: DialogRef, useValue: { close: () => undefined } },
      ],
    }),
    (story) => ({ ...story(), moduleMetadata: { imports: [ChangeGameDialogComponent] } }),
  ],
};
