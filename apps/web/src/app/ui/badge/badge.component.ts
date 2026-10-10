import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type BadgeTone = 'neutral' | 'accent' | 'danger' | 'warning';

/** Short status or tag label. */
@Component({
  selector: 'bt-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"bt-badge--" + tone()' },
  template: `<ng-content />`,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: var(--bt-space-1);
      min-height: 1.5rem;
      padding: 0 var(--bt-space-2);
      border-radius: var(--bt-radius-sm);
      font-size: var(--bt-text-xs);
      font-weight: 600;
      letter-spacing: 0.02em;
      white-space: nowrap;
      background: var(--bt-color-surface-sunken);
      color: var(--bt-color-text);
    }
    :host(.bt-badge--accent) {
      background: var(--bt-color-accent-subtle);
      color: var(--bt-color-accent-text);
    }
    :host(.bt-badge--danger) {
      background: var(--bt-color-danger-subtle);
      color: var(--bt-color-danger-text);
    }
    :host(.bt-badge--warning) {
      background: var(--bt-color-warning-subtle);
      color: var(--bt-color-warning-text);
    }
  `,
})
export class BadgeComponent {
  readonly tone = input<BadgeTone>('neutral');
}
