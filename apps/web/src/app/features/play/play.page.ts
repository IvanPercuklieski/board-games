import { NgComponentOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  type OnInit,
  type Type,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { getGameDefinition } from '@board-table/games';
import type { LobbyResponse } from '@board-table/shared';
import { ApiClient, ApiError } from '../../core/api-client';
import { ErrorService } from '../../core/error.service';
import { ROOM_CONNECTION_FACTORY, type RoomConnection } from '../../core/room-connection';
import { SeatStore } from '../../core/seat-store';
import { describeGameOver } from '../../game-kit/describe-game-over';
import { PlayerStripComponent } from '../../game-kit/player-strip.component';
import { TurnBannerComponent } from '../../game-kit/turn-banner.component';
import type { GameSession } from '../../game-client/game-session';
import { GAME_BOARDS, GAME_SESSION_FACTORY } from '../../games/boards';
import { ButtonComponent } from '../../ui/button/button.component';
import { CardComponent } from '../../ui/card/card.component';
import { EmptyStateComponent } from '../../ui/empty-state/empty-state.component';
import { SpinnerComponent } from '../../ui/feedback/spinner.component';

/** How long "Back to the table" waits for the server to reopen the room after a game. */
const REOPEN_WAIT_MS = 3000;

type State = 'loading' | 'playing' | 'no-seat' | 'gone' | 'offline' | 'unsupported';
type Session = GameSession<unknown>;

/** The table during a game: players, turn, the game's own board, and the result. */
@Component({
  selector: 'bt-play-page',
  imports: [
    ButtonComponent,
    CardComponent,
    EmptyStateComponent,
    NgComponentOutlet,
    PlayerStripComponent,
    RouterLink,
    SpinnerComponent,
    TurnBannerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main id="main" class="page">
      @switch (state()) {
        @case ('loading') {
          <div class="center"><bt-spinner size="lg" label="Setting up the table" /></div>
        }
        @case ('no-seat') {
          <bt-empty-state
            icon="user"
            title="You don’t have a seat at this table"
            description="Open the invite link the host sent you to take a seat."
          />
        }
        @case ('gone') {
          <bt-empty-state
            icon="door-open"
            title="This table has been cleared"
            description="The host closed the room, or your seat was given to someone else."
          />
        }
        @case ('unsupported') {
          <bt-empty-state
            icon="dice-five"
            title="This game can’t be shown yet"
            description="Its board isn’t available in this version."
          />
        }
        @case ('offline') {
          <bt-empty-state
            icon="warning-circle"
            title="Can’t reach the table right now"
            description="Check your connection and try again."
          >
            <button bt-button variant="secondary" (click)="load()">Try again</button>
          </bt-empty-state>
        }
        @case ('playing') {
          @if (session(); as session) {
            <header class="top">
              <h1>{{ gameName() }}</h1>
              <bt-turn-banner [players]="session.players()" [gameover]="session.gameover()" />
            </header>
            <bt-player-strip [players]="session.players()" />
            @if (!session.isConnected() && session.gameover() === undefined) {
              <p class="reconnecting"><bt-spinner size="sm" /> Reconnecting…</p>
            }

            <section class="board" aria-label="Game board">
              @if (board(); as board) {
                <ng-container *ngComponentOutlet="board; inputs: { session }" />
              }
            </section>

            @if (session.gameover() !== undefined) {
              <bt-card class="result">
                <h2>{{ result() }}</h2>
                <p class="muted">
                  @if (isHost()) {
                    Everyone keeps their seat. Play again or pick another game at the table.
                  } @else {
                    Everyone keeps their seat. {{ hostName() }} can start another round.
                  }
                </p>
                <div class="actions">
                  <button bt-button [loading]="leaving()" (click)="backToTable()">
                    Back to the table
                  </button>
                  @if (isHost()) {
                    <a bt-button variant="secondary" routerLink="/">Back to games</a>
                  }
                </div>
              </bt-card>
            }
          }
        }
      }
    </main>
  `,
  styles: `
    .page {
      display: grid;
      gap: var(--bt-space-5);
      max-width: var(--bt-content-max);
      margin: 0 auto;
      padding: var(--bt-space-8) var(--bt-space-6) var(--bt-space-16);
    }
    .center {
      display: grid;
      place-items: center;
      min-height: 40vh;
    }
    .top {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--bt-space-4);
    }
    h1 {
      font-size: var(--bt-text-3xl);
    }
    .reconnecting {
      display: flex;
      align-items: center;
      gap: var(--bt-space-2);
      color: var(--bt-color-warning-text);
      font-size: var(--bt-text-sm);
    }
    .board {
      display: grid;
      place-items: center;
      padding: var(--bt-space-6) 0;
    }
    .result {
      display: grid;
      gap: var(--bt-space-3);
      justify-items: center;
      max-width: 30rem;
      margin: 0 auto;
      padding: var(--bt-space-6);
      text-align: center;
    }
    .result h2 {
      font-size: var(--bt-text-2xl);
    }
    .muted {
      color: var(--bt-color-text-muted);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: var(--bt-space-2);
    }
  `,
})
export class PlayPage implements OnInit {
  /** Route param. */
  readonly roomId = input.required<string>();

  private readonly api = inject(ApiClient);
  private readonly seatStore = inject(SeatStore);
  private readonly router = inject(Router);
  private readonly boards = inject(GAME_BOARDS);
  private readonly createSession = inject(GAME_SESSION_FACTORY);
  private readonly errors = inject(ErrorService);
  private readonly connect = inject(ROOM_CONNECTION_FACTORY);

  protected readonly state = signal<State>('loading');
  protected readonly session = signal<Session | null>(null);
  protected readonly board = signal<Type<unknown> | null>(null);
  protected readonly gameId = signal('');
  /** The room as loaded, then as pushed by the live room connection. */
  private readonly loadedLobby = signal<LobbyResponse | undefined>(undefined);
  private readonly connection = signal<RoomConnection | undefined>(undefined);
  private readonly room = computed(() => this.connection()?.lobby() ?? this.loadedLobby());
  protected readonly hostName = computed(
    () => this.room()?.seats.find((s) => s.isHost)?.name ?? 'the host',
  );

  protected readonly gameName = computed(
    () => getGameDefinition(this.gameId())?.displayName ?? 'Game',
  );
  protected readonly isHost = computed(() => this.room()?.you.isHost ?? false);
  protected readonly result = computed(() => {
    const session = this.session();
    return session ? describeGameOver(session.gameover(), session.players()) : '';
  });

  private reopenWait: ReturnType<typeof setTimeout> | undefined;
  protected readonly leaving = signal(false);

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.reopenWait);
      this.session()?.stop();
      this.connection()?.stop();
    });
    // The room says the table is gone for us (seat freed or reissued, room closed).
    effect(() => {
      if (!this.connection()?.closed()) return;
      this.session()?.stop();
      this.seatStore.forget(this.roomId());
      this.state.set('gone');
      this.errors.report(new ApiError('not_found', 404));
    });
    // "Back to the table" goes as soon as the room is open again (see backToTable).
    effect(() => {
      if (this.leaving() && this.connection()?.lobby()?.status === 'waiting') this.goToTable();
    });
  }

  ngOnInit() {
    void this.load();
  }

  protected async load() {
    const roomId = this.roomId();
    const seat = this.seatStore.seat(roomId);
    if (!seat) {
      this.state.set('no-seat');
      return;
    }
    this.state.set('loading');

    let lobby;
    try {
      lobby = await this.api.lobby(roomId, seat.credentials);
    } catch (e) {
      this.state.set(e instanceof ApiError && e.code === 'not_found' ? 'gone' : 'offline');
      this.errors.report(e, { context: 'The table couldn’t be loaded.' });
      return;
    }
    if (lobby.status === 'waiting' || lobby.you.playerID === undefined) {
      await this.router.navigateByUrl(`/rooms/${roomId}`);
      return;
    }

    const definition = getGameDefinition(lobby.gameId);
    const loadBoard = this.boards[lobby.gameId];
    if (!definition || !loadBoard) {
      this.state.set('unsupported');
      return;
    }
    // The board's code first (lazy chunk), so a failed load leaves no half-started session.
    let board;
    try {
      board = await loadBoard();
    } catch (e) {
      this.state.set('offline');
      this.errors.report(e, { context: 'The game board couldn’t be loaded.' });
      return;
    }

    this.gameId.set(lobby.gameId);
    this.loadedLobby.set(lobby);

    const names: string[] = [];
    for (const s of lobby.seats) names[s.seatIndex] = s.name;
    const session = this.createSession({
      game: definition.game,
      matchID: roomId,
      playerID: lobby.you.playerID,
      credentials: seat.credentials,
      playerNames: names,
    });
    session.start();
    this.session.set(session);
    // The room connection keeps this seat present and tells us when the table is gone.
    this.connection.set(this.connect({ roomId, credentials: seat.credentials }));
    this.board.set(board);
    this.state.set('playing');
  }

  /**
   * Players see the game end slightly before the server has reopened the room, and the
   * waiting room sends anyone in a `playing` room straight back here. So wait until the room
   * connection says `waiting` (an effect goes then), or at most REOPEN_WAIT_MS.
   */
  protected backToTable() {
    if (this.leaving()) return;
    this.leaving.set(true);
    this.reopenWait = setTimeout(() => this.goToTable(), REOPEN_WAIT_MS);
  }

  private goToTable() {
    clearTimeout(this.reopenWait);
    this.reopenWait = undefined;
    void this.router.navigateByUrl(`/rooms/${this.roomId()}?played=true`);
  }
}
