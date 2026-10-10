import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Placeholder block while content loads. Pair it with a labelled spinner or status text. */
@Component({
  selector: 'bt-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
    '[style.width]': 'width()',
    '[style.height]': 'height()',
  },
  template: ``,
  styles: `
    :host {
      display: block;
      border-radius: var(--bt-radius-md);
      background: var(--bt-color-surface-sunken);
      animation: pulse 1.6s var(--bt-ease-standard) infinite;
    }
    @keyframes pulse {
      50% {
        opacity: 0.55;
      }
    }
  `,
})
export class SkeletonComponent {
  readonly width = input('100%');
  readonly height = input('1rem');
}
