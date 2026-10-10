import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, type Type } from '@angular/core';
import { IconComponent } from '../../ui/icon/icon.component';
import { TicTacToeCoverComponent } from './tictactoe-cover.component';

/** Cover art per game id. Covers are small original SVGs (no third-party art). */
const COVERS: Record<string, Type<unknown>> = {
  tictactoe: TicTacToeCoverComponent,
};

/** The game's cover on a felt-like tile, or a neutral die when a game has none yet. */
@Component({
  selector: 'bt-game-cover',
  imports: [IconComponent, NgComponentOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (cover(); as cover) {
      <div class="art"><ng-container *ngComponentOutlet="cover" /></div>
    } @else {
      <bt-icon name="dice-five" class="fallback" />
    }
  `,
  styles: `
    :host {
      display: grid;
      place-items: center;
      aspect-ratio: 4 / 3;
      padding: var(--bt-space-4);
      border-radius: var(--bt-radius-md);
      background: var(--bt-color-accent-subtle);
      box-shadow: inset 0 0 0 1px rgb(var(--bt-shadow-color) / 0.06);
      overflow: hidden;
    }
    /* covers are square drawings sized by the tile's height so they never overflow;
       each cover component fills this box */
    .art {
      height: 100%;
      max-height: 11rem;
      aspect-ratio: 1;
    }
    .fallback {
      font-size: 3rem;
      color: var(--bt-color-accent-text);
    }
  `,
})
export class GameCoverComponent {
  readonly gameId = input.required<string>();
  protected readonly cover = computed(() => COVERS[this.gameId()]);
}
