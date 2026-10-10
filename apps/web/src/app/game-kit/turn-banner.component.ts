import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { SessionPlayer } from '../game-client/game-session';
import { describeGameOver } from './describe-game-over';

/** "Your turn" / "Mara's turn" / the result, announced politely to screen readers. */
@Component({
  selector: 'bt-turn-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'status',
    '[class.mine]': 'isMine()',
    '[class.over]': 'gameover() !== undefined',
  },
  template: `{{ text() }}`,
  styles: `
    :host {
      display: inline-block;
      padding: var(--bt-space-2) var(--bt-space-4);
      border-radius: var(--bt-radius-md);
      background: var(--bt-color-surface-sunken);
      font-family: var(--bt-font-display);
      font-size: var(--bt-text-lg);
      font-weight: 560;
      transition:
        background-color var(--bt-duration-base) var(--bt-ease-standard),
        color var(--bt-duration-base) var(--bt-ease-standard);
    }
    :host(.mine) {
      background: var(--bt-color-accent);
      color: var(--bt-color-on-accent);
    }
    :host(.over) {
      background: var(--bt-color-warning-subtle);
      color: var(--bt-color-warning-text);
    }
  `,
})
export class TurnBannerComponent {
  readonly players = input.required<readonly SessionPlayer[]>();
  readonly gameover = input.required<unknown>();

  private readonly current = computed(() => this.players().find((p) => p.isCurrent));
  protected readonly isMine = computed(
    () => this.gameover() === undefined && !!this.current()?.isYou,
  );
  protected readonly text = computed(() => {
    if (this.gameover() !== undefined) return describeGameOver(this.gameover(), this.players());
    const current = this.current();
    if (!current) return '';
    return current.isYou ? 'Your turn' : `${current.name}’s turn`;
  });
}
