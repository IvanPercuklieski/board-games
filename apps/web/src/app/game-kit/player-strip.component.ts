import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { SessionPlayer } from '../game-client/game-session';
import { SeatTokenComponent } from '../ui/seat-token/seat-token.component';

/** Everyone at the table, whose turn it is, and who has lost their connection. */
@Component({
  selector: 'bt-player-strip',
  imports: [SeatTokenComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul aria-label="Players" class="players">
      @for (player of players(); track player.playerID) {
        <li
          class="player"
          [class.current]="player.isCurrent"
          [attr.aria-current]="player.isCurrent ? 'true' : null"
        >
          <bt-seat-token
            [seatIndex]="player.seatIndex"
            [name]="player.name"
            [isYou]="player.isYou"
          />
          <span class="name">{{ player.name }}</span>
          @if (player.isCurrent) {
            <span class="tag turn">Turn</span>
          }
          @if (player.isConnected === false) {
            <span class="tag away">Away</span>
          }
        </li>
      }
    </ul>
  `,
  styles: `
    .players {
      display: flex;
      flex-wrap: wrap;
      gap: var(--bt-space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .player {
      display: flex;
      align-items: center;
      gap: var(--bt-space-2);
      padding: var(--bt-space-2) var(--bt-space-4) var(--bt-space-2) var(--bt-space-2);
      border: var(--bt-border-width) solid var(--bt-color-border);
      border-radius: var(--bt-radius-pill);
      background: var(--bt-color-surface);
      transition:
        border-color var(--bt-duration-base) var(--bt-ease-standard),
        box-shadow var(--bt-duration-base) var(--bt-ease-standard);
    }
    .player.current {
      border-color: var(--bt-color-accent);
      box-shadow: 0 0 0 1px var(--bt-color-accent);
    }
    .name {
      font-weight: 500;
    }
    .tag {
      padding: 0 var(--bt-space-2);
      border-radius: var(--bt-radius-sm);
      font-size: var(--bt-text-xs);
      font-weight: 600;
    }
    .turn {
      background: var(--bt-color-accent-subtle);
      color: var(--bt-color-accent-text);
    }
    .away {
      background: var(--bt-color-warning-subtle);
      color: var(--bt-color-warning-text);
    }
  `,
})
export class PlayerStripComponent {
  readonly players = input.required<readonly SessionPlayer[]>();
}
