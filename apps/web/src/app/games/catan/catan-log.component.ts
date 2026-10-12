import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { CatanState } from '@board-table/games';
import type { SessionPlayer } from '../../game-client/game-session';
import { describeEvent } from './catan-log';

/** What happened, newest first, in the player's own words ("You took 1 ore from Ben"). */
@Component({
  selector: 'bt-catan-log',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 class="title" id="catan-log-title">Log</h2>
    @if (lines().length === 0) {
      <p class="empty">Nothing has happened yet.</p>
    } @else {
      <!-- scrollable, so it must be reachable by keyboard -->
      <ol class="lines" tabindex="0" aria-labelledby="catan-log-title">
        @for (line of lines(); track line.id) {
          <li>{{ line.text }}</li>
        }
      </ol>
    }
  `,
  styles: `
    :host {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      gap: var(--bt-space-2);
      min-height: 0;
    }
    .title {
      font-size: var(--bt-text-lg);
    }
    .empty {
      color: var(--bt-color-text-muted);
      font-size: var(--bt-text-sm);
    }
    .lines {
      display: grid;
      align-content: start;
      gap: var(--bt-space-1);
      max-height: var(--bt-pane-max-height, 14rem);
      overflow-y: auto;
      margin: 0;
      padding: var(--bt-space-2) var(--bt-space-3);
      border: var(--bt-border-width) solid var(--bt-color-border);
      border-radius: var(--bt-radius-md);
      background: var(--bt-color-surface);
      list-style: none;
      font-size: var(--bt-text-sm);
    }
    .lines:focus-visible {
      outline: none;
      box-shadow: var(--bt-focus-ring);
    }
    li + li {
      padding-top: var(--bt-space-1);
      border-top: var(--bt-border-width) solid var(--bt-color-border);
    }
    li:first-child {
      font-weight: 600;
    }
  `,
})
export class CatanLogComponent {
  readonly state = input.required<CatanState>();
  readonly me = input.required<string>();
  readonly players = input.required<readonly SessionPlayer[]>();

  protected readonly lines = computed(() => {
    const G = this.state();
    const names = new Map(this.players().map((p) => [p.playerID, p.name]));
    const nameOf = (id: string) => names.get(id) ?? `Player ${Number(id) + 1}`;
    return [...G.events]
      .reverse()
      .map((event) => ({ id: event.id, text: describeEvent(event, G, this.me(), nameOf) }));
  });
}
