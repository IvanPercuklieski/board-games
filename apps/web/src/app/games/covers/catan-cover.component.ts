import { ChangeDetectionStrategy, Component } from '@angular/core';

const R = 17; // hex corner radius
const HALF_W = (R * Math.sqrt(3)) / 2;

/** Pointy-top hexagon around (cx, cy). */
function hexPoints(cx: number, cy: number): string {
  return [
    [cx, cy - R],
    [cx + HALF_W, cy - R / 2],
    [cx + HALF_W, cy + R / 2],
    [cx, cy + R],
    [cx - HALF_W, cy + R / 2],
    [cx - HALF_W, cy - R / 2],
  ]
    .map(([x, y]) => `${x!.toFixed(2)},${y!.toFixed(2)}`)
    .join(' ');
}

const C = 60;
const TILES = [
  { terrain: 'fields', x: C, y: C },
  { terrain: 'forest', x: C + 2 * HALF_W, y: C },
  { terrain: 'hills', x: C - 2 * HALF_W, y: C },
  { terrain: 'pasture', x: C + HALF_W, y: C - 1.5 * R },
  { terrain: 'mountains', x: C - HALF_W, y: C - 1.5 * R },
  { terrain: 'pasture', x: C + HALF_W, y: C + 1.5 * R },
  { terrain: 'forest', x: C - HALF_W, y: C + 1.5 * R },
].map((t) => ({ ...t, points: hexPoints(t.x, t.y) }));

/** Original cover art: a small island of seven lands with a road, a settlement and a city. */
@Component({
  selector: 'bt-catan-cover',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      @for (tile of tiles; track $index) {
        <polygon [attr.points]="tile.points" [class]="'tile ' + tile.terrain" />
      }
      <circle class="token" [attr.cx]="c" [attr.cy]="c" r="6.5" />
      <text class="number" [attr.x]="c" [attr.y]="c + 2.4">8</text>
      <line class="road-outline" [attr.x1]="road.x" y1="53.5" [attr.x2]="road.x" y2="66.5" />
      <line class="road" [attr.x1]="road.x" y1="53.5" [attr.x2]="road.x" y2="66.5" />
      <path
        class="settlement"
        [attr.transform]="settlement"
        d="M-4,3.4 v-4.5 l4,-3.6 l4,3.6 v4.5 z"
      />
      <path
        class="city"
        [attr.transform]="city"
        d="M-5.6,3.6 v-5.2 l2.8,-2.6 l2.8,2.6 v1.1 h5.6 v4.1 z"
      />
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
    .tile {
      stroke: var(--bt-color-terrain-ink);
      stroke-opacity: 0.35;
      stroke-width: 0.8;
      stroke-linejoin: round;
    }
    .tile.forest {
      fill: var(--bt-color-terrain-forest);
    }
    .tile.pasture {
      fill: var(--bt-color-terrain-pasture);
    }
    .tile.fields {
      fill: var(--bt-color-terrain-fields);
    }
    .tile.hills {
      fill: var(--bt-color-terrain-hills);
    }
    .tile.mountains {
      fill: var(--bt-color-terrain-mountains);
    }
    .token {
      fill: var(--bt-color-token-bg);
    }
    .number {
      fill: var(--bt-color-token-hot);
      font-family: var(--bt-font-display);
      font-size: 7px;
      font-weight: 600;
      text-anchor: middle;
    }
    .road-outline,
    .road {
      stroke-linecap: round;
    }
    .road-outline {
      stroke: var(--bt-color-piece-outline);
      stroke-width: 5;
    }
    .road {
      stroke: var(--bt-color-seat-0);
      stroke-width: 3;
    }
    .settlement,
    .city {
      stroke: var(--bt-color-piece-outline);
      stroke-width: 1;
      stroke-linejoin: round;
    }
    .settlement {
      fill: var(--bt-color-seat-0);
    }
    .city {
      fill: var(--bt-color-seat-1);
    }
  `,
})
export class CatanCoverComponent {
  protected readonly tiles = TILES;
  protected readonly c = C;
  protected readonly road = { x: (C + HALF_W).toFixed(2) };
  protected readonly settlement = `translate(${(C + HALF_W).toFixed(2)} ${C - R / 2})`;
  protected readonly city = `translate(${(C - HALF_W).toFixed(2)} ${C - R / 2})`;
}
