import { Clipboard } from '@angular/cdk/clipboard';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
  type OnInit,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { getCatalogEntry } from '@board-table/games/catalog';
import type { LobbyResponse, SeatInfo } from '@board-table/shared';
import { ApiClient, ApiError } from '../../core/api-client';
import { AuthService } from '../../core/auth.service';
import { Poller } from '../../core/poller';
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

const POLL_INTERVAL_MS = 3000;

type State = 'loading' | 'ready' | 'no-seat' | 'gone';

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
                          (click)="freeSeat(row.seat)"
                        ></button>
                      }
                    </li>
                  }
                </ul>

                @if (connectionLost()) {
                  <p class="reconnecting"><bt-spinner size="sm" /> Reconnecting…</p>
                }
              </section>

              @if (isHost()) {
                <aside class="side">
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
                          [loading]="linkBusy()"
                          (click)="newLink()"
                        >
                          <bt-icon name="arrows-clockwise" /> New link
                        </button>
                      </div>
                    } @else {
                      <p class="muted">
                        The invite link was created on another device. Make a new one to share it
                        from here.
                      </p>
                      <button
                        bt-button
                        variant="secondary"
                        [loading]="linkBusy()"
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
                      [loading]="startBusy()"
                      (click)="start()"
                    >
                      <bt-icon name="play" /> Start game
                    </button>
                    @if (!canStart()) {
                      <p class="muted center-text">
                        Waiting for at least {{ minPlayers() }} players
                      </p>
                    }
                    <button bt-button variant="ghost" (click)="close()">
                      <bt-icon name="door-open" /> Close room
                    </button>
                  </bt-card>
                </aside>
              } @else {
                <aside class="side">
                  <bt-card class="panel waiting">
                    <bt-spinner size="lg" />
                    <p>Waiting for {{ hostName() }} to start the game</p>
                    <p class="muted">Keep this page open, the game starts here.</p>
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

  private readonly api = inject(ApiClient);
  private readonly auth = inject(AuthService);
  private readonly seatStore = inject(SeatStore);
  private readonly router = inject(Router);
  private readonly confirmService = inject(ConfirmService);
  private readonly clipboard = inject(Clipboard);
  private readonly toasts = inject(ToastService);

  private readonly poller = new Poller(() => this.refresh(), POLL_INTERVAL_MS);
  private seat: StoredSeat | undefined;

  protected readonly state = signal<State>('loading');
  protected readonly lobby = signal<LobbyResponse | null>(null);
  protected readonly inviteUrl = signal<string | undefined>(undefined);
  protected readonly connectionLost = signal(false);
  protected readonly linkBusy = signal(false);
  protected readonly startBusy = signal(false);

  private readonly game = computed(() => getCatalogEntry(this.lobby()?.gameId ?? ''));
  protected readonly gameName = computed(() => this.game()?.displayName ?? 'Game');
  protected readonly minPlayers = computed(() => this.game()?.minPlayers ?? 2);
  protected readonly isHost = computed(
    () => this.lobby()?.you.seatIndex === 0 && this.auth.isSignedIn(),
  );
  protected readonly hostName = computed(
    () => this.lobby()?.seats.find((s) => s.isHost)?.name ?? 'the host',
  );
  protected readonly canStart = computed(
    () => (this.lobby()?.seats.length ?? 0) >= this.minPlayers(),
  );
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
    inject(DestroyRef).onDestroy(() => this.poller.stop());
  }

  ngOnInit() {
    void this.init();
  }

  private async init() {
    const roomId = this.roomId();
    this.seat = this.seatStore.seat(roomId) ?? (await this.reclaimHostSeat(roomId));
    if (!this.seat) {
      this.state.set('no-seat');
      return;
    }
    this.inviteUrl.set(this.seatStore.inviteUrl(roomId));
    this.poller.start();
  }

  /** A host opening their room on another device gets fresh credentials for seat 0. */
  private async reclaimHostSeat(roomId: string): Promise<StoredSeat | undefined> {
    if (!this.auth.isSignedIn()) return undefined;
    try {
      const seat = await this.api.reclaimHostSeat(roomId);
      this.seatStore.saveSeat(roomId, seat);
      return seat;
    } catch {
      return undefined; // not this user's room
    }
  }

  private async refresh() {
    if (!this.seat) return;
    try {
      const lobby = await this.api.lobby(this.roomId(), this.seat.credentials);
      this.lobby.set(lobby);
      this.connectionLost.set(false);
      this.state.set('ready');
      if (lobby.status === 'playing') {
        this.poller.stop();
        await this.router.navigateByUrl(`/rooms/${this.roomId()}/play`);
      }
    } catch (e) {
      if (e instanceof ApiError && e.code === 'not_found') {
        this.poller.stop();
        this.seatStore.forget(this.roomId());
        this.state.set('gone');
      } else {
        this.connectionLost.set(true);
      }
    }
  }

  protected select(event: FocusEvent) {
    (event.target as HTMLInputElement).select();
  }

  protected copy(url: string) {
    const copied = this.clipboard.copy(url);
    this.toasts.show(
      copied
        ? { message: 'Invite link copied', tone: 'success' }
        : { message: 'Copying didn’t work. Select the link and copy it by hand.', tone: 'danger' },
    );
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
    this.linkBusy.set(true);
    try {
      const { inviteUrl } = await this.api.regenerateInvite(this.roomId());
      this.seatStore.saveInviteUrl(this.roomId(), inviteUrl);
      this.inviteUrl.set(inviteUrl);
      this.toasts.show({ message: 'New invite link ready', tone: 'success' });
    } catch {
      this.toasts.show({ message: 'The link couldn’t be renewed. Try again.', tone: 'danger' });
    } finally {
      this.linkBusy.set(false);
    }
  }

  protected async start() {
    this.startBusy.set(true);
    try {
      await this.api.startRoom(this.roomId());
    } catch (e) {
      if (!(e instanceof ApiError && e.code === 'room_locked')) {
        this.toasts.show({ message: 'The game couldn’t be started. Try again.', tone: 'danger' });
      }
    } finally {
      this.startBusy.set(false);
    }
    await this.poller.runNow(); // picks up "playing" and moves to the table
  }

  protected async freeSeat(seat: SeatInfo) {
    const ok = await this.confirmService.confirm({
      title: `Free ${seat.name}’s seat?`,
      message: 'Their link stops working for this seat. Someone else can take it.',
      confirmLabel: 'Free seat',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await this.api.freeSeat(this.roomId(), seat.seatIndex);
    } catch {
      this.toasts.show({ message: 'The seat couldn’t be freed. Try again.', tone: 'danger' });
    }
    await this.poller.runNow();
  }

  protected async close() {
    const ok = await this.confirmService.confirm({
      title: 'Close this room?',
      message: 'Everyone at the table is removed.',
      confirmLabel: 'Close room',
      tone: 'danger',
    });
    if (!ok) return;
    this.poller.stop(); // before the request, so no lobby poll runs while the room is deleted
    try {
      await this.api.closeRoom(this.roomId());
    } catch {
      this.toasts.show({ message: 'The room couldn’t be closed. Try again.', tone: 'danger' });
      this.poller.start();
      return;
    }
    this.seatStore.forget(this.roomId());
    await this.router.navigateByUrl('/rooms');
  }
}
