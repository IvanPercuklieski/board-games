import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent } from '../icon/icon.component';
import type { IconName } from '../icon/icons';

/** Friendly explanation when there is nothing to show (no results, invalid link, ...). */
@Component({
  selector: 'bt-empty-state',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (icon(); as icon) {
      <span class="icon"><bt-icon [name]="icon" /></span>
    }
    <h2 class="title">{{ title() }}</h2>
    @if (description()) {
      <p class="description">{{ description() }}</p>
    }
    <div class="actions"><ng-content /></div>
  `,
  styles: `
    :host {
      display: grid;
      justify-items: center;
      gap: var(--bt-space-3);
      max-width: 28rem;
      margin: 0 auto;
      padding: var(--bt-space-12) var(--bt-space-6);
      text-align: center;
    }
    .icon {
      display: grid;
      place-items: center;
      width: 3.5rem;
      height: 3.5rem;
      margin-bottom: var(--bt-space-2);
      border-radius: 50%;
      background: var(--bt-color-surface-sunken);
      color: var(--bt-color-text-muted);
      font-size: var(--bt-text-xl);
    }
    .title {
      font-size: var(--bt-text-xl);
    }
    .description {
      color: var(--bt-color-text-muted);
    }
    .actions:not(:empty) {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: var(--bt-space-3);
      margin-top: var(--bt-space-3);
    }
  `,
})
export class EmptyStateComponent {
  readonly title = input.required<string>();
  readonly description = input<string>();
  readonly icon = input<IconName>();
}
