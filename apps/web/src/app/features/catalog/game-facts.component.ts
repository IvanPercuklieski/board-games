import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { GameCatalogEntry } from '@board-table/games/catalog';
import { BadgeComponent } from '../../ui/badge/badge.component';
import { IconComponent } from '../../ui/icon/icon.component';

/** Player count, play time and complexity as small badges. */
@Component({
  selector: 'bt-game-facts',
  imports: [BadgeComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <bt-badge><bt-icon name="users" />{{ players() }}</bt-badge>
    <bt-badge><bt-icon name="clock" />{{ playTime() }}</bt-badge>
    <bt-badge [tone]="game().complexity === 'light' ? 'accent' : 'warning'">{{
      complexity()
    }}</bt-badge>
  `,
  styles: `
    :host {
      display: flex;
      flex-wrap: wrap;
      gap: var(--bt-space-2);
    }
  `,
})
export class GameFactsComponent {
  readonly game = input.required<GameCatalogEntry>();

  protected readonly players = computed(() => {
    const { minPlayers: min, maxPlayers: max } = this.game();
    return min === max ? `${min} players` : `${min}–${max} players`;
  });

  protected readonly playTime = computed(() => {
    const { min, max } = this.game().playTimeMinutes;
    return min === max ? `${max} min` : `${min}–${max} min`;
  });

  protected readonly complexity = computed(
    () => ({ light: 'Light', medium: 'Medium weight', heavy: 'Heavy' })[this.game().complexity],
  );
}
