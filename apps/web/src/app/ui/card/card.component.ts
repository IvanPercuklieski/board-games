import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * A paper surface. `interactive` adds hover/focus-within lift for cards that contain a link
 * or button covering them (the link stays the focus target, the card only looks clickable).
 */
@Component({
  selector: 'bt-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.bt-card--interactive]': 'interactive()' },
  template: `<ng-content />`,
  styles: `
    :host {
      position: relative;
      display: block;
      padding: var(--bt-space-5);
      border: var(--bt-border-width) solid var(--bt-color-border);
      border-radius: var(--bt-radius-lg);
      background: var(--bt-color-surface);
      box-shadow: var(--bt-shadow-sm);
    }
    :host(.bt-card--interactive) {
      transition:
        box-shadow var(--bt-duration-base) var(--bt-ease-standard),
        transform var(--bt-duration-base) var(--bt-ease-standard),
        border-color var(--bt-duration-base) var(--bt-ease-standard);
    }
    :host(.bt-card--interactive:hover),
    :host(.bt-card--interactive:focus-within) {
      border-color: var(--bt-color-border-strong);
      box-shadow: var(--bt-shadow-md);
      transform: translateY(-2px);
    }
  `,
})
export class CardComponent {
  readonly interactive = input(false);
}
