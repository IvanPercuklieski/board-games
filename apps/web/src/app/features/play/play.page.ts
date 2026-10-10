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
import { ApiClient, ApiError } from '../../core/api-client';
import { AuthService } from '../../core/auth.service';
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

/** How long a lost connection may last before we ask whether the seat still exists. */
const SEAT_CHECK_DELAY_MS = 3000;

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
                  <a bt-button [routerLink]="['/rooms', roomId()]" [queryParams]="{ played: true }"
                    >Back to the table</a
                  >
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
  private readonly auth = inject(AuthService);
  private readonly seatStore = inject(SeatStore);
  private readonly router = inject(Router);
  private readonly boards = inject(GAME_BOARDS);
  private readonly createSession = inject(GAME_SESSION_FACTORY);

  protected readonly state = signal<State>('loading');
  protected readonly session = signal<Session | null>(null);
  protected readonly board = signal<Type<unknown> | null>(null);
  protected readonly gameId = signal('');
  private readonly youAreSeat0 = signal(false);
  protected readonly hostName = signal('the host');

  protected readonly gameName = computed(
    () => getGameDefinition(this.gameId())?.displayName ?? 'Game',
  );
  protected readonly isHost = computed(() => this.youAreSeat0() && this.auth.isSignedIn());
  protected readonly result = computed(() => {
    const session = this.session();
    return session ? describeGameOver(session.gameover(), session.players()) : '';
  });

  private credentials: string | undefined;
  private seatCheck: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.seatCheck);
      this.session()?.stop();
    });
    // A lost connection may mean the host gave this seat away (the server disconnects it).
    effect(() => {
      const session = this.session();
      clearTimeout(this.seatCheck);
      if (session && !session.isConnected() && session.gameover() === undefined) {
        this.seatCheck = setTimeout(() => void this.checkSeat(), SEAT_CHECK_DELAY_MS);
      }
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

    this.credentials = seat.credentials;
    let lobby;
    try {
      lobby = await this.api.lobby(roomId, seat.credentials);
    } catch (e) {
      this.state.set(e instanceof ApiError && e.code === 'not_found' ? 'gone' : 'offline');
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

    this.gameId.set(lobby.gameId);
    this.youAreSeat0.set(lobby.you.seatIndex === 0);
    this.hostName.set(lobby.seats.find((s) => s.isHost)?.name ?? 'the host');

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
    this.state.set('playing');
    this.board.set(await loadBoard());
  }

  /** Still disconnected: if the seat no longer exists, stop and explain instead of waiting. */
  private async checkSeat() {
    if (!this.credentials) return;
    try {
      await this.api.lobby(this.roomId(), this.credentials);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'not_found') {
        this.session()?.stop();
        this.seatStore.forget(this.roomId());
        this.state.set('gone');
      }
    }
  }
}
