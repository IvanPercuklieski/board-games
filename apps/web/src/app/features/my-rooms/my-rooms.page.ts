import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { getCatalogEntry } from '@board-table/games/catalog';
import type { RoomSummary } from '@board-table/shared';
import { ApiClient } from '../../core/api-client';
import { asyncAction } from '../../core/async-action';
import { ErrorService } from '../../core/error.service';
import { SeatStore } from '../../core/seat-store';
import { BadgeComponent } from '../../ui/badge/badge.component';
import { ButtonComponent } from '../../ui/button/button.component';
import { CardComponent } from '../../ui/card/card.component';
import { ConfirmService } from '../../ui/dialog/confirm.service';
import { EmptyStateComponent } from '../../ui/empty-state/empty-state.component';
import { SkeletonComponent } from '../../ui/feedback/skeleton.component';
import { IconComponent } from '../../ui/icon/icon.component';
import { SeatTokenComponent } from '../../ui/seat-token/seat-token.component';
import { ToastService } from '../../ui/toast/toast.service';

/** The host's open rooms: status, players, open or close. */
@Component({
  selector: 'bt-my-rooms-page',
  imports: [
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    EmptyStateComponent,
    IconComponent,
    RouterLink,
    SeatTokenComponent,
    SkeletonComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main id="main" class="page">
      <h1>My rooms</h1>

      @switch (state()) {
        @case ('loading') {
          <div class="list" aria-busy="true">
            <span class="bt-visually-hidden" role="status">Loading your rooms</span>
            <bt-skeleton height="6rem" />
            <bt-skeleton height="6rem" />
          </div>
        }
        @case ('error') {
          <bt-empty-state
            icon="warning-circle"
            title="Your rooms couldn’t be loaded"
            description="Check your connection and try again."
          >
            <button bt-button variant="secondary" (click)="load()">Try again</button>
          </bt-empty-state>
        }
        @default {
          @if (rooms().length > 0) {
            <ul class="list" aria-label="Your rooms">
              @for (room of rooms(); track room.roomId) {
                <li>
                  <bt-card class="room">
                    <div class="summary">
                      <h2 class="game">{{ gameName(room.gameId) }}</h2>
                      <div class="meta">
                        @if (room.status === 'playing') {
                          <bt-badge tone="warning">In progress</bt-badge>
                        } @else {
                          <bt-badge tone="accent">Waiting for players</bt-badge>
                        }
                        <span class="muted"
                          >{{ room.seats.length }} of {{ room.maxSeats }} seats ·
                          {{ age(room.createdAt) }}</span
                        >
                      </div>
                    </div>
                    <div class="seats">
                      @for (seat of room.seats; track seat.seatIndex) {
                        <bt-seat-token
                          [seatIndex]="seat.seatIndex"
                          [name]="seat.name"
                          [isHost]="seat.isHost"
                        />
                      }
                    </div>
                    <div class="actions">
                      <a bt-button variant="secondary" [routerLink]="['/rooms', room.roomId]">
                        <bt-icon name="arrow-right" /> Open
                      </a>
                      <button
                        bt-button
                        variant="ghost"
                        [loading]="closing() === room.roomId"
                        [disabled]="closeAction.busy()"
                        (click)="close(room)"
                      >
                        <bt-icon name="door-open" /> Close room
                      </button>
                    </div>
                  </bt-card>
                </li>
              }
            </ul>
          } @else {
            <bt-empty-state
              icon="dice-five"
              title="No open rooms"
              description="Rooms you host show up here until the game ends."
            >
              <a bt-button routerLink="/">Browse games</a>
            </bt-empty-state>
          }
        }
      }
    </main>
  `,
  styles: `
    .page {
      display: grid;
      gap: var(--bt-space-6);
      max-width: 52rem;
      margin: 0 auto;
      padding: var(--bt-space-10) var(--bt-space-6) var(--bt-space-16);
    }
    h1 {
      font-size: var(--bt-text-4xl);
    }
    .list {
      display: grid;
      gap: var(--bt-space-4);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .room {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: var(--bt-space-4);
      align-items: center;
    }
    .summary {
      display: grid;
      gap: var(--bt-space-2);
    }
    .game {
      font-size: var(--bt-text-xl);
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--bt-space-3);
    }
    .muted {
      color: var(--bt-color-text-muted);
      font-size: var(--bt-text-sm);
    }
    .seats {
      display: flex;
      gap: var(--bt-space-2);
      grid-row: span 2;
    }
    .actions {
      display: flex;
      gap: var(--bt-space-2);
    }
    @media (max-width: 40rem) {
      .room {
        grid-template-columns: 1fr;
      }
      .seats {
        grid-row: auto;
      }
    }
  `,
})
export class MyRoomsPage {
  private readonly api = inject(ApiClient);
  private readonly confirmService = inject(ConfirmService);
  private readonly seatStore = inject(SeatStore);
  private readonly toasts = inject(ToastService);
  private readonly errors = inject(ErrorService);

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly rooms = signal<RoomSummary[]>([]);
  /** The room whose Close is running, for its button's busy state. */
  protected readonly closing = signal<string | null>(null);

  protected readonly closeAction = asyncAction(
    async (room: RoomSummary) => {
      this.closing.set(room.roomId);
      try {
        await this.api.closeRoom(room.roomId);
      } finally {
        this.closing.set(null);
      }
      this.seatStore.forget(room.roomId);
      this.rooms.update((rooms) => rooms.filter((r) => r.roomId !== room.roomId));
      this.toasts.show({ message: 'Room closed', tone: 'success' });
    },
    { context: 'The room couldn’t be closed.' },
  );

  constructor() {
    void this.load();
  }

  protected async load() {
    this.state.set('loading');
    try {
      this.rooms.set((await this.api.listRooms()).rooms);
      this.state.set('ready');
    } catch (e) {
      this.state.set('error');
      this.errors.report(e, { context: 'Your rooms couldn’t be loaded.' });
    }
  }

  protected gameName(gameId: string) {
    return getCatalogEntry(gameId)?.displayName ?? gameId;
  }

  protected age(createdAt: string) {
    return relativeTime(new Date(createdAt));
  }

  protected async close(room: RoomSummary) {
    const ok = await this.confirmService.confirm({
      title: `Close this ${this.gameName(room.gameId)} room?`,
      message: 'Everyone at the table is removed and the game cannot be resumed.',
      confirmLabel: 'Close room',
      tone: 'danger',
    });
    if (!ok) return;
    await this.closeAction.run(room);
  }
}

const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** "just now", "5 minutes ago", "2 hours ago", "yesterday". */
export function relativeTime(date: Date, now = new Date()): string {
  const minutes = Math.round((date.getTime() - now.getTime()) / 60_000);
  if (Math.abs(minutes) < 1) return 'just now';
  if (Math.abs(minutes) < 60) return RELATIVE.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return RELATIVE.format(hours, 'hour');
  return RELATIVE.format(Math.round(hours / 24), 'day');
}
