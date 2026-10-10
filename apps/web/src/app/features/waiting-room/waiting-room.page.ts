import { Clipboard } from '@angular/cdk/clipboard';
import { Dialog } from '@angular/cdk/dialog';
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  type OnInit,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { getCatalogEntry } from '@board-table/games/catalog';
import type { LobbyResponse, SeatInfo } from '@board-table/shared';
import { ApiClient, ApiError } from '../../core/api-client';
import { AuthService } from '../../core/auth.service';
import { asyncAction } from '../../core/async-action';
import { ErrorService } from '../../core/error.service';
import { ROOM_CONNECTION_FACTORY, type RoomConnection } from '../../core/room-connection';
import { SeatStore, type StoredSeat } from '../../core/seat-store';
import { GameCoverComponent } from '../../games/covers/game-cover.component';
import { BadgeComponent } from '../../ui/badge/badge.component';
import { ButtonComponent } from '../../ui/button/button.component';
import { IconButtonComponent } from '../../ui/button/icon-button.component';
import { CardComponent } from '../../ui/card/card.component';
import { ConfirmService } from '../../ui/dialog/confirm.service';
import { EmptyStateComponent } from '../../ui/empty-state/empty-state.component';
import { SpinnerComponent } from '../../ui/feedback/spinner.component';
import { IconComponent } from '../../ui/icon/icon.component';
import { SeatTokenComponent } from '../../ui/seat-token/seat-token.component';
import { ToastService } from '../../ui/toast/toast.service';
import { openChangeGameDialog } from './change-game-dialog.component';

type State = 'loading' | 'ready' | 'no-seat' | 'gone' | 'left' | 'offline';
/** Set while we end our own seat or room, so the server's "closed" isn't shown as an error. */
type Ending = 'leaving' | 'closing';

/** The lobby before a game: who sits where; the host shares the link and starts. */
@Component({
  selector: 'bt-waiting-room-page',
  imports: [
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    EmptyStateComponent,
    GameCoverComponent,
    IconButtonComponent,
    IconComponent,
    RouterLink,
    SeatTokenComponent,
    SpinnerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main id="main" class="page">
      @switch (state()) {
        @case ('loading') {
          <div class="center"><bt-spinner size="lg" label="Finding your seat" /></div>
        }
        @case ('no-seat') {
          <bt-empty-state
            icon="user"
            title="You don’t have a seat at this table"
            description="Open the invite link the host sent you to take a seat."
          >
            <a bt-button variant="secondary" routerLink="/">Go to the games</a>
          </bt-empty-state>
        }
        @case ('gone') {
          <bt-empty-state
            icon="door-open"
            title="This table has been cleared"
            description="The host closed the room, or your seat was given to someone else."
          >
            <a bt-button variant="secondary" routerLink="/">Go to the games</a>
          </bt-empty-state>
        }
        @case ('left') {
          <bt-empty-state
            icon="sign-out"
            title="You left the table"
            description="Your seat is free for someone else. Open the invite link again to come back while a seat is free."
          />
        }
        @case ('offline') {
          <bt-empty-state
            icon="warning-circle"
            title="Can’t reach the table right now"
            description="Check your connection and try again."
          >
            <button bt-button variant="secondary" (click)="retry()">Try again</button>
          </bt-empty-state>
        }
        @case ('ready') {
          @if (lobby(); as lobby) {
            <div class="layout">
              <section class="table">
                <header class="heading">
                  <bt-game-cover [gameId]="lobby.gameId" class="cover" />
                  <div class="titles">
                    <bt-badge tone="accent">Waiting room</bt-badge>
                    <h1>{{ gameName() }}</h1>
                    <p role="status" class="muted">{{ seatsTaken() }}</p>
                  </div>
                </header>

                <ul class="seats" aria-label="Seats">
                  @for (row of seatRows(); track row.seatIndex) {
                    <li class="seat" [class.free]="!row.seat">
                      <bt-seat-token
                        [seatIndex]="row.seatIndex"
                        [name]="row.seat?.name"
                        [isHost]="row.seat?.isHost ?? false"
                        [isYou]="row.seatIndex === lobby.you.seatIndex"
                        [away]="row.seat?.away ?? false"
                      />
                      <span class="seat-name">
                        @if (row.seat; as seat) {
                          {{ seat.name }}
                          @if (seat.isHost) {
                            <span class="tag">Host</span>
                          }
                          @if (row.seatIndex === lobby.you.seatIndex) {
                            <span class="tag">You</span>
                          }
                          @if (seat.away) {
                            <span class="tag away">Away</span>
                          }
                        } @else {
                          <span class="muted">Free seat</span>
                        }
                      </span>
                      @if (isHost() && row.seat && !row.seat.isHost) {
                        <button
                          bt-icon-button
                          icon="x"
                          size="sm"
                          [label]="'Free seat ' + (row.seatIndex + 1) + ' (' + row.seat.name + ')'"
                          [disabled]="freeSeatAction.busy()"
                          (click)="freeSeat(row.seat)"
                        ></button>
                      }
                    </li>
                  }
                </ul>

                @if (!connected()) {
                  <p class="reconnecting"><bt-spinner size="sm" /> Reconnecting…</p>
                }
              </section>

              @if (isHost()) {
                <aside class="side">
                  <bt-card class="panel" role="region" aria-labelledby="bt-game-panel-title">
                    <h2 id="bt-game-panel-title">Game</h2>
                    <p class="muted">{{ gameName() }} · {{ lobby.maxSeats }} seats</p>
                    <div class="row">
                      <button bt-button variant="secondary" (click)="changeGame(lobby)">
                        <bt-icon name="arrows-clockwise" /> Change game
                      </button>
                    </div>
                  </bt-card>

                  <bt-card class="panel">
                    <h2>Invite link</h2>
                    @if (inviteUrl(); as url) {
                      <p class="muted">
                        Anyone with this link can take a free seat until the game starts.
                      </p>
                      <div class="invite">
                        <input
                          class="bt-input link"
                          readonly
                          aria-label="Invite link"
                          [value]="url"
                          (focus)="select($event)"
                        />
                      </div>
                      <div class="row">
                        <button bt-button variant="secondary" (click)="copy(url)">
                          <bt-icon name="copy" /> Copy link
                        </button>
                        <button
                          bt-button
                          variant="ghost"
                          [loading]="newLinkAction.busy()"
                          (click)="newLink()"
                        >
                          <bt-icon name="arrows-clockwise" /> New link
                        </button>
                      </div>
                    } @else {
                      <p class="muted">
                        Only the device that made the invite link can show it. Make a new link to
                        share it from here; the old one stops working.
                      </p>
                      <button
                        bt-button
                        variant="secondary"
                        [loading]="newLinkAction.busy()"
                        (click)="newLink()"
                      >
                        <bt-icon name="arrows-clockwise" /> New link
                      </button>
                    }
                  </bt-card>

                  <bt-card class="panel">
                    <button
                      bt-button
                      size="lg"
                      class="start"
                      [disabled]="!canStart()"
                      [loading]="startAction.busy()"
                      (click)="start()"
                    >
                      <bt-icon name="play" /> {{ played() ? 'Play again' : 'Start game' }}
                    </button>
                    @if (startHint(); as hint) {
                      <p class="muted center-text">{{ hint }}</p>
                    }
                    <div class="row">
                      <button
                        bt-button
                        variant="ghost"
                        [loading]="closeAction.busy()"
                        (click)="close()"
                      >
                        <bt-icon name="door-open" /> Close room
                      </button>
                      <button
                        bt-button
                        variant="ghost"
                        [loading]="leaveAction.busy()"
                        (click)="leave()"
                      >
                        <bt-icon name="sign-out" /> Leave table
                      </button>
                    </div>
                  </bt-card>
                </aside>
              } @else {
                <aside class="side">
                  <bt-card class="panel waiting">
                    <bt-spinner size="lg" />
                    <p>Waiting for {{ hostName() }} to start the game</p>
                    <p class="muted">Keep this page open, the game starts here.</p>
                    <button
                      bt-button
                      variant="ghost"
                      [loading]="leaveAction.busy()"
                      (click)="leave()"
                    >
                      <bt-icon name="sign-out" /> Leave table
                    </button>
                  </bt-card>
                </aside>
              }
            </div>
          }
        }
      }
    </main>
  `,
  styles: `
    .page {
      max-width: var(--bt-content-max);
      margin: 0 auto;
      padding: var(--bt-space-10) var(--bt-space-6) var(--bt-space-16);
    }
    .center {
      display: grid;
      place-items: center;
      min-height: 40vh;
    }
    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1.5fr) minmax(18rem, 1fr);
      gap: var(--bt-space-10);
      align-items: start;
    }
    .heading {
      display: flex;
      gap: var(--bt-space-5);
      align-items: center;
      margin-bottom: var(--bt-space-8);
    }
    .cover {
      width: 8rem;
      flex: none;
      padding: var(--bt-space-2);
    }
    .titles {
      display: grid;
      gap: var(--bt-space-2);
      justify-items: start;
      min-width: 0;
    }
    h1 {
      font-size: var(--bt-text-3xl);
    }
    .muted {
      color: var(--bt-color-text-muted);
      font-size: var(--bt-text-sm);
    }
    .seats {
      display: grid;
      gap: var(--bt-space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .seat {
      display: flex;
      align-items: center;
      gap: var(--bt-space-4);
      padding: var(--bt-space-3) var(--bt-space-4);
      border: var(--bt-border-width) solid var(--bt-color-border);
      border-radius: var(--bt-radius-lg);
      background: var(--bt-color-surface);
    }
    .seat.free {
      border-style: dashed;
      background: transparent;
    }
    .seat-name {
      flex: 1;
      display: flex;
      align-items: center;
      gap: var(--bt-space-2);
      font-weight: 500;
    }
    .tag {
      padding: 0 var(--bt-space-2);
      border-radius: var(--bt-radius-sm);
      background: var(--bt-color-surface-sunken);
      color: var(--bt-color-text-muted);
      font-size: var(--bt-text-xs);
      font-weight: 600;
    }
    .tag.away {
      background: var(--bt-color-warning-subtle);
      color: var(--bt-color-warning-text);
    }
    .reconnecting {
      display: flex;
      align-items: center;
      gap: var(--bt-space-2);
      margin-top: var(--bt-space-4);
      color: var(--bt-color-warning-text);
      font-size: var(--bt-text-sm);
    }
    .side {
      display: grid;
      gap: var(--bt-space-5);
    }
    .panel {
      display: grid;
      gap: var(--bt-space-3);
      padding: var(--bt-space-6);
    }
    .link {
      font-family: var(--bt-font-mono);
      font-size: var(--bt-text-sm);
      text-overflow: ellipsis;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--bt-space-2);
    }
    .start {
      width: 100%;
    }
    .center-text {
      text-align: center;
    }
    .waiting {
      justify-items: center;
      text-align: center;
      color: var(--bt-color-accent-text);
    }
    .waiting p:first-of-type {
      color: var(--bt-color-text);
      font-family: var(--bt-font-display);
      font-size: var(--bt-text-lg);
    }
    @media (max-width: 52rem) {
      .layout {
        grid-template-columns: 1fr;
      }
    }
    @media (max-width: 30rem) {
      .page {
        padding-inline: var(--bt-space-4);
      }
      .cover {
        width: 5.5rem;
      }
      h1 {
        font-size: var(--bt-text-2xl);
      }
    }
  `,
})
export class WaitingRoomPage implements OnInit {
  /** Route param. */
  readonly roomId = input.required<string>();
  /** Query param set by the play page after a game at this table. */
  readonly played = input(false, { transform: booleanAttribute });

  private readonly api = inject(ApiClient);
  private readonly auth = inject(AuthService);
  private readonly seatStore = inject(SeatStore);
  private readonly router = inject(Router);
  private readonly confirmService = inject(ConfirmService);
  private readonly dialog = inject(Dialog);
  private readonly clipboard = inject(Clipboard);
  private readonly toasts = inject(ToastService);
  private readonly errors = inject(ErrorService);
  private readonly connect = inject(ROOM_CONNECTION_FACTORY);

  private seat: StoredSeat | undefined;
  private readonly connection = signal<RoomConnection | undefined>(undefined);
  /** Before the connection: loading, no seat, or offline (the host seat couldn't be reclaimed). */
  private readonly setupState = signal<State | undefined>('loading');
  private readonly ending = signal<Ending | undefined>(undefined);

  protected readonly lobby = computed(() => this.connection()?.lobby());
  protected readonly connected = computed(() => this.connection()?.connected() ?? true);
  private readonly closed = computed(() => this.connection()?.closed() ?? false);
  protected readonly state = computed<State>(
    () => this.setupState() ?? (this.closed() ? 'gone' : this.lobby() ? 'ready' : 'loading'),
  );
  protected readonly inviteUrl = signal<string | undefined>(undefined);

  protected readonly newLinkAction = asyncAction(
    async () => {
      const { inviteUrl } = await this.api.regenerateInvite(this.roomId());
      this.seatStore.saveInviteUrl(this.roomId(), inviteUrl);
      this.inviteUrl.set(inviteUrl);
      this.toasts.show({ message: 'New invite link ready', tone: 'success' });
    },
    { context: 'The link couldn’t be renewed.' },
  );
  protected readonly startAction = asyncAction(() => this.api.startRoom(this.roomId()), {
    context: 'The game couldn’t be started.',
    // someone already started it: the next snapshot moves everyone to the table
    onError: (e) => e instanceof ApiError && e.code === 'room_locked',
  });
  protected readonly leaveAction = asyncAction(
    async () => {
      await this.api.leave(this.roomId(), this.seat!.credentials);
      return true;
    },
    { context: 'You couldn’t leave the table.' },
  );
  protected readonly freeSeatAction = asyncAction(
    (seat: SeatInfo) => this.api.freeSeat(this.roomId(), seat.seatIndex),
    { context: 'The seat couldn’t be freed.' },
  );
  protected readonly closeAction = asyncAction(
    async () => {
      await this.api.closeRoom(this.roomId());
      return true;
    },
    { context: 'The room couldn’t be closed.' },
  );

  private readonly game = computed(() => getCatalogEntry(this.lobby()?.gameId ?? ''));
  protected readonly gameName = computed(() => this.game()?.displayName ?? 'Game');
  protected readonly minPlayers = computed(() => this.game()?.minPlayers ?? 2);
  protected readonly isHost = computed(() => this.lobby()?.you.isHost ?? false);
  protected readonly hostName = computed(
    () => this.lobby()?.seats.find((s) => s.isHost)?.name ?? 'the host',
  );
  private readonly awayNames = computed(
    () =>
      this.lobby()
        ?.seats.filter((s) => s.away)
        .map((s) => s.name) ?? [],
  );
  protected readonly canStart = computed(
    () => (this.lobby()?.seats.length ?? 0) >= this.minPlayers() && this.awayNames().length === 0,
  );
  /** Why Start is disabled, if it is. */
  protected readonly startHint = computed(() => {
    const away = this.awayNames();
    if (away.length > 0) {
      // the host can also free the seat (the x next to the name)
      const seats = away.length === 1 ? 'their seat' : 'their seats';
      return `Waiting for ${listNames(away)} to come back, or free ${seats}`;
    }
    if ((this.lobby()?.seats.length ?? 0) < this.minPlayers()) {
      return `Waiting for at least ${this.minPlayers()} players`;
    }
    return undefined;
  });
  protected readonly seatsTaken = computed(() => {
    const lobby = this.lobby();
    return lobby ? `${lobby.seats.length} of ${lobby.maxSeats} seats taken` : '';
  });
  protected readonly seatRows = computed(() => {
    const lobby = this.lobby();
    if (!lobby) return [];
    return Array.from({ length: lobby.maxSeats }, (_, seatIndex) => ({
      seatIndex,
      seat: lobby.seats.find((s) => s.seatIndex === seatIndex),
    }));
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.connection()?.stop());

    // The game started: everyone goes to the table (the play page opens its own connection).
    effect(() => {
      if (this.lobby()?.status === 'playing') {
        void this.router.navigateByUrl(`/rooms/${this.roomId()}/play`);
      }
    });

    // The room or our seat is gone. When we ended it ourselves, that is not news.
    effect(() => {
      if (!this.closed()) return;
      untracked(() => {
        this.seatStore.forget(this.roomId());
        if (this.ending() === undefined) this.errors.report(new ApiError('not_found', 404));
      });
    });

    // The room was handed to us (the host left or went away).
    let wasHost: boolean | undefined;
    effect(() => {
      const lobby = this.lobby();
      if (!lobby) return;
      if (wasHost === false && lobby.you.isHost) {
        untracked(() => this.toasts.show({ message: 'You’re the host now', tone: 'success' }));
      }
      wasHost = lobby.you.isHost;
    });
  }

  ngOnInit() {
    void this.init();
  }

  protected retry() {
    this.setupState.set('loading');
    void this.init();
  }

  private async init() {
    const roomId = this.roomId();
    try {
      this.seat = this.seatStore.seat(roomId) ?? (await this.reclaimHostSeat(roomId));
    } catch (e) {
      this.setupState.set('offline');
      this.errors.report(e, { context: 'The table couldn’t be loaded.' });
      return;
    }
    if (!this.seat) {
      this.setupState.set('no-seat');
      return;
    }
    this.inviteUrl.set(this.seatStore.inviteUrl(roomId));
    this.connection.set(this.connect({ roomId, credentials: this.seat.credentials }));
    this.setupState.set(undefined);
  }

  /** A host opening their room on another device gets fresh credentials for their seat. */
  private async reclaimHostSeat(roomId: string): Promise<StoredSeat | undefined> {
    if (!this.auth.isSignedIn()) return undefined;
    try {
      const seat = await this.api.reclaimHostSeat(roomId);
      this.seatStore.saveSeat(roomId, seat);
      return seat;
    } catch (e) {
      if (e instanceof ApiError && e.code === 'not_found') return undefined; // not their room
      throw e; // e.g. offline: init shows it
    }
  }

  protected select(event: FocusEvent) {
    (event.target as HTMLInputElement).select();
  }

  protected copy(url: string) {
    const copied = this.clipboard.copy(url);
    if (copied) this.toasts.show({ message: 'Invite link copied', tone: 'success' });
    else this.errors.notice('Copying didn’t work. Select the link and copy it by hand.');
  }

  protected async newLink() {
    const hadLink = this.inviteUrl() !== undefined;
    if (hadLink) {
      const ok = await this.confirmService.confirm({
        title: 'Make a new invite link?',
        message: 'The current link stops working. Players already seated keep their seats.',
        confirmLabel: 'Make new link',
      });
      if (!ok) return;
    }
    await this.newLinkAction.run();
  }

  protected async start() {
    await this.startAction.run(); // the next snapshot ("playing") moves everyone to the table
  }

  protected async changeGame(lobby: LobbyResponse) {
    const room = await openChangeGameDialog(this.dialog, {
      roomId: this.roomId(),
      gameId: lobby.gameId,
      maxSeats: lobby.maxSeats,
      seated: lobby.seats.length,
    });
    if (!room) return;
    this.toasts.show({ message: 'Game changed', tone: 'success' });
  }

  protected async freeSeat(seat: SeatInfo) {
    const ok = await this.confirmService.confirm({
      title: `Free ${seat.name}’s seat?`,
      message: 'Their link stops working for this seat. Someone else can take it.',
      confirmLabel: 'Free seat',
      tone: 'danger',
    });
    if (!ok) return;
    await this.freeSeatAction.run(seat);
  }

  protected async leave() {
    const ok = await this.confirmService.confirm({
      title: 'Leave this table?',
      message: this.isHost()
        ? 'Someone else with an account takes over as host. If nobody can, the room is closed.'
        : 'Your seat is freed for someone else.',
      confirmLabel: 'Leave table',
      tone: 'danger',
    });
    if (!ok) return;
    const host = this.isHost();
    this.ending.set('leaving');
    if (!(await this.leaveAction.run())) {
      this.ending.set(undefined);
      return;
    }
    this.seatStore.forget(this.roomId());
    // Hosts go back to their rooms; guests have no other page here, so the page says goodbye.
    if (host) await this.router.navigateByUrl('/rooms');
    else this.setupState.set('left');
  }

  protected async close() {
    const ok = await this.confirmService.confirm({
      title: 'Close this room?',
      message: 'Everyone at the table is removed.',
      confirmLabel: 'Close room',
      tone: 'danger',
    });
    if (!ok) return;
    this.ending.set('closing');
    if (!(await this.closeAction.run())) {
      this.ending.set(undefined);
      return;
    }
    this.seatStore.forget(this.roomId());
    await this.router.navigateByUrl('/rooms');
  }
}

/** "Mara", "Mara and Theo", "Mara, Theo and Jun". */
function listNames(names: string[]): string {
  return names.length < 2
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}
