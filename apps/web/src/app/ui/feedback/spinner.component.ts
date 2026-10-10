import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Activity indicator. With a `label` it is announced as a status; without, it is decorative. */
@Component({
  selector: 'bt-spinner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': '"bt-spinner--" + size()',
    '[attr.role]': 'label() ? "status" : null',
    '[attr.aria-hidden]': 'label() ? null : "true"',
  },
  template: `
    <span class="ring"></span>
    @if (label()) {
      <span class="bt-visually-hidden">{{ label() }}</span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      width: 1.5rem;
      height: 1.5rem;
      flex: none;
    }
    :host(.bt-spinner--sm) {
      width: 1em;
      height: 1em;
    }
    :host(.bt-spinner--lg) {
      width: 2.5rem;
      height: 2.5rem;
    }
    .ring {
      width: 100%;
      height: 100%;
      border: 2px solid currentColor;
      border-right-color: transparent;
      border-radius: 50%;
      opacity: 0.8;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to {
        transform: rotate(1turn);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .ring {
        animation-duration: 2.4s !important;
        animation-iteration-count: infinite !important;
      }
    }
  `,
})
export class SpinnerComponent {
  readonly label = input<string>();
  readonly size = input<'sm' | 'md' | 'lg'>('md');
}
