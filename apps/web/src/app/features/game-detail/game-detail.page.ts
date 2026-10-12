import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { getCatalogEntry } from '@board-table/games/catalog';
import { LIMITS } from '@board-table/shared';
import { ApiClient, ApiError } from '../../core/api-client';
import { asyncAction } from '../../core/async-action';
import { SeatStore } from '../../core/seat-store';
import { GameCoverComponent } from '../../games/covers/game-cover.component';
import { ButtonComponent } from '../../ui/button/button.component';
import { CardComponent } from '../../ui/card/card.component';
import { EmptyStateComponent } from '../../ui/empty-state/empty-state.component';
import { IconComponent } from '../../ui/icon/icon.component';
import { GameFactsComponent } from '../catalog/game-facts.component';

/** One game: description and the host form (seat count) that creates a room. */
@Component({
  selector: 'bt-game-detail-page',
  imports: [
    ButtonComponent,
    CardComponent,
    EmptyStateComponent,
    GameCoverComponent,
    GameFactsComponent,
    IconComponent,
    RouterLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main id="main" class="page">
      @if (game(); as game) {
        <a routerLink="/" class="back"><bt-icon name="arrow-left" /> All games</a>

        <div class="layout">
          <section class="about">
            <bt-game-cover [gameId]="game.id" class="cover" />
            <h1>{{ game.displayName }}</h1>
            <p class="tagline">{{ game.tagline }}</p>
            <bt-game-facts [game]="game" />
            <p class="description">{{ game.description }}</p>
          </section>

          <bt-card class="host">
            <h2>Host a table</h2>
            <p class="muted">
              You take the first seat. Then share the invite link; friends don’t need an account.
            </p>

            <p class="fixed-seats"><bt-icon name="users" /> {{ seatsText() }}</p>

            @if (limitReached()) {
              <p class="failure" role="alert">
                <bt-icon name="warning-circle" />
                <span>
                  You already have {{ maxRooms }} open rooms. Close one first in
                  <a routerLink="/rooms">My rooms</a>
                </span>
              </p>
            }

            <button bt-button size="lg" [loading]="hostAction.busy()" (click)="host()">
              Host a game
            </button>
          </bt-card>
        </div>
      } @else {
        <bt-empty-state
          icon="dice-five"
          title="That game isn’t in the cupboard"
          description="It may have been renamed or removed."
        >
          <a bt-button variant="secondary" routerLink="/">Browse games</a>
        </bt-empty-state>
      }
    </main>
  `,
  styles: `
    .page {
      max-width: var(--bt-content-max);
      margin: 0 auto;
      padding: var(--bt-space-8) var(--bt-space-6) var(--bt-space-16);
    }
    .back {
      display: inline-flex;
      align-items: center;
      gap: var(--bt-space-2);
      margin-bottom: var(--bt-space-6);
      color: var(--bt-color-text-muted);
      font-size: var(--bt-text-sm);
      text-decoration: none;
    }
    .back:hover {
      color: var(--bt-color-text);
    }
    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1.4fr) minmax(18rem, 1fr);
      gap: var(--bt-space-10);
      align-items: start;
    }
    .about {
      display: grid;
      gap: var(--bt-space-4);
    }
    .cover {
      max-width: 26rem;
    }
    h1 {
      font-size: var(--bt-text-4xl);
    }
    .tagline {
      font-size: var(--bt-text-lg);
      color: var(--bt-color-text-muted);
    }
    .description {
      max-width: 38rem;
    }
    .host {
      display: grid;
      gap: var(--bt-space-4);
      padding: var(--bt-space-6);
      position: sticky;
      top: var(--bt-space-6);
    }
    .muted {
      color: var(--bt-color-text-muted);
      font-size: var(--bt-text-sm);
    }
    .fixed-seats {
      display: inline-flex;
      align-items: center;
      gap: var(--bt-space-2);
      font-weight: 500;
    }
    .failure {
      display: flex;
      gap: var(--bt-space-2);
      padding: var(--bt-space-3) var(--bt-space-4);
      border-radius: var(--bt-radius-md);
      background: var(--bt-color-danger-subtle);
      color: var(--bt-color-danger-text);
      font-size: var(--bt-text-sm);
    }
    .failure a {
      color: inherit;
      font-weight: 600;
    }
    @media (max-width: 52rem) {
      .layout {
        grid-template-columns: 1fr;
      }
      .host {
        position: static;
      }
    }
  `,
})
export class GameDetailPage {
  /** Route param. */
  readonly gameId = input.required<string>();

  private readonly api = inject(ApiClient);
  private readonly seatStore = inject(SeatStore);
  private readonly router = inject(Router);

  protected readonly game = computed(() => getCatalogEntry(this.gameId()));
  /** Rooms are open: anyone with the link joins, up to the game's maximum. */
  protected readonly seatsText = computed(() => {
    const game = this.game();
    if (!game) return '';
    const max = Math.min(game.maxPlayers, LIMITS.maxSeats);
    return game.minPlayers === max
      ? `A table for ${max}`
      : `Up to ${max} players can join (at least ${game.minPlayers} to start)`;
  });

  /** Shown inline (with a link to My rooms) instead of a toast. */
  protected readonly limitReached = signal(false);
  protected readonly maxRooms = LIMITS.maxActiveRoomsPerHost;

  protected readonly hostAction = asyncAction(
    async (gameId: string) => {
      this.limitReached.set(false);
      const room = await this.api.createRoom({ gameId });
      this.seatStore.saveSeat(room.roomId, room.seat);
      this.seatStore.saveInviteUrl(room.roomId, room.inviteUrl);
      await this.router.navigateByUrl(`/rooms/${room.roomId}`);
    },
    {
      context: 'The table couldn’t be set up.',
      onError: (e) => {
        const limit = e instanceof ApiError && e.code === 'limit_reached';
        this.limitReached.set(limit);
        return limit;
      },
    },
  );

  protected async host() {
    const game = this.game();
    if (game) await this.hostAction.run(game.id);
  }
}
