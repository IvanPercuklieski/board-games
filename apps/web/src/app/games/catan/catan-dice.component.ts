import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Dot positions on a 0-10 die face. */
const PIPS: Record<number, [number, number][]> = {
  1: [[5, 5]],
  2: [
    [2.8, 2.8],
    [7.2, 7.2],
  ],
  3: [
    [2.8, 2.8],
    [5, 5],
    [7.2, 7.2],
  ],
  4: [
    [2.8, 2.8],
    [7.2, 2.8],
    [2.8, 7.2],
    [7.2, 7.2],
  ],
  5: [
    [2.8, 2.8],
    [7.2, 2.8],
    [5, 5],
    [2.8, 7.2],
    [7.2, 7.2],
  ],
  6: [
    [2.8, 2.6],
    [7.2, 2.6],
    [2.8, 5],
    [7.2, 5],
    [2.8, 7.4],
    [7.2, 7.4],
  ],
};

/** The last roll as two dice and their sum. */
@Component({
  selector: 'bt-catan-dice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'img', '[attr.aria-label]': 'label()' },
  template: `
    @if (roll(); as r) {
      @for (die of r; track $index) {
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <rect x="0.5" y="0.5" width="9" height="9" rx="2" />
          @for (p of pips(die); track $index) {
            <circle [attr.cx]="p[0]" [attr.cy]="p[1]" r="0.95" />
          }
        </svg>
      }
      <span class="sum" aria-hidden="true">{{ r[0] + r[1] }}</span>
    } @else {
      <span class="none" aria-hidden="true">No roll yet</span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: var(--bt-space-2);
    }
    svg {
      width: 2rem;
      height: 2rem;
    }
    rect {
      fill: var(--bt-color-surface-raised);
      stroke: var(--bt-color-border-strong);
      stroke-width: 0.5;
    }
    circle {
      fill: var(--bt-color-text);
    }
    .sum {
      min-width: 2ch;
      font-family: var(--bt-font-display);
      font-size: var(--bt-text-2xl);
      font-weight: 600;
    }
    .none {
      color: var(--bt-color-text-muted);
      font-size: var(--bt-text-sm);
    }
  `,
})
export class CatanDiceComponent {
  readonly roll = input<[number, number] | null>(null);

  protected readonly label = computed(() => {
    const r = this.roll();
    return r ? `Last roll: ${r[0]} and ${r[1]}, ${r[0] + r[1]}` : 'No roll yet';
  });

  protected pips(die: number): [number, number][] {
    return PIPS[die] ?? [];
  }
}
