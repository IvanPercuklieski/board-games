import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Original cover art: a hand-drawn grid mid-game, in seat colours. */
@Component({
  selector: 'bt-tictactoe-cover',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <g class="grid" stroke-linecap="round">
        <path d="M44 18 C43 46 45 76 43 102" />
        <path d="M77 17 C78 47 76 75 78 103" />
        <path d="M18 44 C46 43 76 45 102 43" />
        <path d="M17 77 C47 78 75 76 103 78" />
      </g>
      <g class="x" stroke-linecap="round">
        <path d="M23 23 L38 38 M38 23 L23 38" />
        <path d="M54 54 L68 68 M68 54 L54 68" />
      </g>
      <g class="o">
        <circle cx="94" cy="28" r="9" />
        <circle cx="28" cy="94" r="9" />
      </g>
      <path class="x pending" d="M86 86 L100 100 M100 86 L86 100" stroke-linecap="round" />
    </svg>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    svg {
      width: 100%;
      height: 100%;
    }
    .grid {
      fill: none;
      stroke: var(--bt-color-border-strong);
      stroke-width: 3;
    }
    .x {
      fill: none;
      stroke: var(--bt-color-seat-0);
      stroke-width: 5;
    }
    .o {
      fill: none;
      stroke: var(--bt-color-seat-1);
      stroke-width: 5;
    }
    .pending {
      opacity: 0.35;
    }
  `,
})
export class TicTacToeCoverComponent {}
