import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { gameCatalog } from '@board-table/games/catalog';
import { GameCoverComponent } from '../../games/covers/game-cover.component';
import { ButtonComponent } from '../../ui/button/button.component';
import { CardComponent } from '../../ui/card/card.component';
import { EmptyStateComponent } from '../../ui/empty-state/empty-state.component';
import { SegmentedComponent } from '../../ui/segmented/segmented.component';
import { InputDirective, TextFieldComponent } from '../../ui/text-field/text-field.component';
import { filterGames, playerCountOptions } from './filter-games';
import { GameFactsComponent } from './game-facts.component';

/** Browse and search the games; each card opens the game page where a host can start it. */
@Component({
  selector: 'bt-catalog-page',
  imports: [
    ButtonComponent,
    CardComponent,
    EmptyStateComponent,
    GameCoverComponent,
    GameFactsComponent,
    InputDirective,
    RouterLink,
    SegmentedComponent,
    TextFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main id="main" class="page">
      <header class="intro">
        <h1>Games</h1>
        <p class="lede">Pick a game, host a table, and send your friends the invite link.</p>
      </header>

      <div class="filters" role="search">
        <bt-text-field label="Search games" class="search">
          <input
            btInput
            type="search"
            placeholder="Name or tag, e.g. quick"
            autocomplete="off"
            [value]="query()"
            (input)="query.set(value($event))"
          />
        </bt-text-field>
        <div class="players">
          <span class="filter-label">Players</span>
          <bt-segmented label="Players" [options]="playerOptions" [(value)]="players" />
        </div>
      </div>

      <p role="status" class="count">{{ countText() }}</p>

      @if (results().length > 0) {
        <ul class="grid" aria-label="Games">
          @for (game of results(); track game.id) {
            <li>
              <bt-card [interactive]="true" class="card">
                <bt-game-cover [gameId]="game.id" />
                <h2 class="title">
                  <a class="stretched" [routerLink]="['/games', game.id]">{{ game.displayName }}</a>
                </h2>
                <p class="tagline">{{ game.tagline }}</p>
                <bt-game-facts [game]="game" />
              </bt-card>
            </li>
          }
        </ul>
      } @else {
        <bt-empty-state
          icon="magnifying-glass"
          [title]="'No games match “' + query().trim() + '”'"
          description="Try another name or tag, or allow any number of players."
        >
          <button bt-button variant="secondary" (click)="reset()">Show all games</button>
        </bt-empty-state>
      }
    </main>
  `,
  styles: `
    .page {
      display: grid;
      gap: var(--bt-space-6);
      max-width: var(--bt-content-max);
      margin: 0 auto;
      padding: var(--bt-space-10) var(--bt-space-6) var(--bt-space-16);
    }
    .intro {
      display: grid;
      gap: var(--bt-space-2);
    }
    h1 {
      font-size: var(--bt-text-4xl);
    }
    .lede {
      color: var(--bt-color-text-muted);
      font-size: var(--bt-text-lg);
    }
    .filters {
      display: flex;
      flex-wrap: wrap;
      align-items: end;
      gap: var(--bt-space-6);
    }
    .search {
      flex: 1 1 18rem;
      max-width: 28rem;
    }
    .players {
      display: grid;
      gap: var(--bt-space-2);
    }
    .filter-label {
      font-size: var(--bt-text-sm);
      font-weight: 600;
    }
    .count {
      color: var(--bt-color-text-muted);
      font-size: var(--bt-text-sm);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
      gap: var(--bt-space-6);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .card {
      display: grid;
      gap: var(--bt-space-3);
      height: 100%;
      padding: var(--bt-space-4);
    }
    .title {
      margin-top: var(--bt-space-2);
      font-size: var(--bt-text-xl);
    }
    .stretched {
      color: inherit;
      text-decoration: none;
    }
    /* the whole card is clickable, the link stays the single focus target */
    .stretched::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: var(--bt-radius-lg);
    }
    .stretched:focus-visible {
      box-shadow: none;
    }
    .stretched:focus-visible::after {
      box-shadow: var(--bt-focus-ring);
    }
    .tagline {
      color: var(--bt-color-text-muted);
    }
  `,
})
export class CatalogPage {
  protected readonly query = signal('');
  protected readonly players = signal<number | null>(null);
  protected readonly playerOptions = playerCountOptions(gameCatalog);

  protected readonly results = computed(() =>
    filterGames(gameCatalog, { query: this.query(), players: this.players() }),
  );

  protected readonly countText = computed(() => {
    const n = this.results().length;
    return `${n} ${n === 1 ? 'game' : 'games'}`;
  });

  protected value(event: Event) {
    return (event.target as HTMLInputElement).value;
  }

  protected reset() {
    this.query.set('');
    this.players.set(null);
  }
}
