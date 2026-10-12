import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { getGeometry, type CatanState } from '@board-table/games';
import { PlacePieceDirective } from '../../game-kit/place-piece.directive';
import { edgeName, harbourName, hexName, hexPlace, vertexName } from './catan-labels';
import { mapLayout, towards, type Point } from './map-layout';
import { iconPathFor } from './resource-icon.component';

/** Spots the player can pick on the map right now. */
export interface MapTargets {
  kind: 'vertex' | 'edge' | 'hex';
  ids: readonly number[];
  /** Start of each button's label, e.g. "Build a settlement". */
  verb: string;
}

/** Small original motifs drawn on each terrain (relative to the hex centre). */
const MOTIF: Record<string, string> = {
  forest: 'M-3.6,-3.9 l1.5,-2.8 l1.5,2.8 z M0.6,-4.3 l1.6,-3 l1.6,3 z',
  hills: 'M-3.4,-4.3 q1.7,-2.2 3.4,0 q1.7,-2.2 3.4,0',
  pasture: 'M-3,-4.4 q0.6,-1.7 1.2,0 q0.6,-1.7 1.2,0 M0.8,-4.9 q0.6,-1.7 1.2,0 q0.6,-1.7 1.2,0',
  fields: 'M-2.6,-3.8 q0,-2.2 0.9,-3.2 M0,-3.8 q0,-2.2 0.9,-3.2 M2.6,-3.8 q0,-2.2 0.9,-3.2',
  mountains: 'M-3.8,-3.8 l2.1,-3.2 l1.6,2.1 l1.3,-1.7 l2.5,2.8',
  desert: 'M-4,0.6 q2,-1.6 4,0 q2,1.6 4,0 M-2.6,-2.4 q1.3,-1 2.6,0',
};

/** Dots under a number: how many of the 36 dice outcomes roll it, out of 6. */
function pips(token: number): number[] {
  const n = 6 - Math.abs(7 - token);
  return Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * 0.85);
}

/**
 * The island: terrains, numbers, harbours, the Bandit, roads and buildings in seat colours.
 * Legal spots (`targets`) are real buttons laid over the drawing, labelled with where they are.
 */
@Component({
  selector: 'bt-catan-map',
  imports: [PlacePieceDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="map" [style.aspect-ratio]="layout().width + ' / ' + layout().height">
      <svg
        [attr.viewBox]="'0 0 ' + layout().width + ' ' + layout().height"
        role="img"
        [attr.aria-label]="summary()"
      >
        <rect class="sea" [attr.width]="layout().width" [attr.height]="layout().height" rx="6" />

        @for (h of harbours(); track h.slot) {
          <g class="harbour">
            <line [attr.x1]="h.label.x" [attr.y1]="h.label.y" [attr.x2]="h.a.x" [attr.y2]="h.a.y" />
            <line [attr.x1]="h.label.x" [attr.y1]="h.label.y" [attr.x2]="h.b.x" [attr.y2]="h.b.y" />
            <circle
              [attr.cx]="h.label.x"
              [attr.cy]="h.label.y"
              r="4.2"
              [class]="'ring ' + h.kind"
            />
            <path class="icon" [attr.d]="h.icon" [attr.transform]="h.iconAt" />
            <text [attr.x]="h.label.x" [attr.y]="h.label.y + 2.85">{{ h.ratio }}</text>
          </g>
        }

        @for (hex of hexes(); track hex.id) {
          <g [attr.transform]="'translate(' + hex.x + ' ' + hex.y + ')'">
            <polygon [attr.points]="hex.points" [class]="'tile ' + hex.terrain" />
            <path class="motif" [attr.d]="hex.motif" />
            @if (hex.token !== null) {
              <g class="token" [class.hot]="hex.hot">
                <circle r="3.3" />
                <text y="0.6">{{ hex.token }}</text>
                @for (dx of hex.pips; track $index) {
                  <circle class="pip" [attr.cx]="dx" cy="1.95" r="0.28" />
                }
              </g>
            }
          </g>
        }

        @for (road of roads(); track road.id) {
          <g class="road piece" btPlacePiece>
            <line
              class="outline"
              [attr.x1]="road.a.x"
              [attr.y1]="road.a.y"
              [attr.x2]="road.b.x"
              [attr.y2]="road.b.y"
            />
            <line
              class="fill"
              [style.stroke]="road.color"
              [attr.x1]="road.a.x"
              [attr.y1]="road.a.y"
              [attr.x2]="road.b.x"
              [attr.y2]="road.b.y"
            />
          </g>
        }

        @for (b of buildings(); track b.id + b.kind) {
          <g [attr.transform]="'translate(' + b.x + ' ' + b.y + ')'">
            <path
              class="building piece"
              btPlacePiece
              [style.fill]="b.color"
              [attr.d]="b.kind === 'city' ? CITY : SETTLEMENT"
            />
          </g>
        }

        <g
          class="bandit piece"
          [attr.transform]="'translate(' + bandit().x + ' ' + bandit().y + ')'"
        >
          <circle cy="-2.2" r="1.15" />
          <path d="M-1.5,1.9 q0,-3.3 1.5,-3.3 q1.5,0 1.5,3.3 z" />
        </g>
      </svg>

      @if (targets(); as t) {
        <div class="targets" role="group" [attr.aria-label]="t.verb">
          @for (spot of spots(); track spot.id) {
            <button
              type="button"
              [class]="'target ' + t.kind"
              [style.left.%]="spot.left"
              [style.top.%]="spot.top"
              [attr.aria-label]="spot.label"
              (click)="picked.emit(spot.id)"
            ></button>
          }
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }
    .map {
      position: relative;
      width: 100%;
    }
    svg {
      display: block;
      width: 100%;
      height: 100%;
    }
    .sea {
      fill: var(--bt-color-sea);
    }
    .tile {
      stroke: var(--bt-color-terrain-ink);
      stroke-opacity: 0.35;
      stroke-width: 0.35;
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
    .tile.desert {
      fill: var(--bt-color-terrain-desert);
    }
    .motif {
      fill: none;
      stroke: var(--bt-color-terrain-ink);
      stroke-opacity: 0.45;
      stroke-width: 0.45;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .token circle {
      fill: var(--bt-color-token-bg);
      stroke: var(--bt-color-terrain-ink);
      stroke-opacity: 0.4;
      stroke-width: 0.25;
    }
    .token text {
      fill: var(--bt-color-token-text);
      font-family: var(--bt-font-display);
      font-size: 3px;
      font-weight: 600;
      text-anchor: middle;
    }
    .token .pip {
      fill: var(--bt-color-token-text);
      stroke: none;
    }
    .token.hot text,
    .token.hot .pip {
      fill: var(--bt-color-token-hot);
    }
    .harbour line {
      stroke: var(--bt-color-terrain-ink);
      stroke-opacity: 0.55;
      stroke-width: 0.5;
      stroke-dasharray: 0.9 0.6;
    }
    .harbour .ring {
      fill: var(--bt-color-token-bg);
      stroke-width: 0.9;
    }
    .harbour .ring.any {
      stroke: var(--bt-color-terrain-ink);
      stroke-width: 0.35;
    }
    .harbour .ring.timber {
      stroke: var(--bt-color-terrain-forest);
    }
    .harbour .ring.clay {
      stroke: var(--bt-color-terrain-hills);
    }
    .harbour .ring.wool {
      stroke: var(--bt-color-terrain-pasture);
    }
    .harbour .ring.grain {
      stroke: var(--bt-color-terrain-fields);
    }
    .harbour .ring.ore {
      stroke: var(--bt-color-terrain-mountains);
    }
    .harbour .icon {
      fill: none;
      stroke: var(--bt-color-token-text);
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .harbour text {
      fill: var(--bt-color-token-text);
      font-family: var(--bt-font-sans);
      font-size: 1.8px;
      font-weight: 600;
      text-anchor: middle;
    }
    .piece {
      transform-box: fill-box;
      transform-origin: center;
    }
    .road line {
      stroke-linecap: round;
    }
    .road .outline {
      stroke: var(--bt-color-piece-outline);
      stroke-width: 2.4;
    }
    .road .fill {
      stroke-width: 1.5;
    }
    .building {
      stroke: var(--bt-color-piece-outline);
      stroke-width: 0.5;
      stroke-linejoin: round;
    }
    .bandit {
      fill: var(--bt-color-terrain-ink);
      stroke: var(--bt-color-piece-outline);
      stroke-width: 0.4;
      transition: transform var(--bt-duration-slow) var(--bt-ease-emphasized);
    }
    .targets {
      position: absolute;
      inset: 0;
    }
    .target {
      position: absolute;
      translate: -50% -50%;
      padding: 0;
      border: 2px solid var(--bt-color-accent);
      border-radius: 50%;
      background: color-mix(in srgb, var(--bt-color-surface-raised) 55%, transparent);
      cursor: pointer;
      transition:
        background-color var(--bt-duration-fast) var(--bt-ease-standard),
        scale var(--bt-duration-fast) var(--bt-ease-standard);
    }
    .target:hover {
      background: var(--bt-color-accent-subtle);
      scale: 1.15;
    }
    .target:focus-visible {
      outline: none;
      box-shadow: var(--bt-focus-ring);
      scale: 1.15;
    }
    .target.vertex {
      width: clamp(1.5rem, 3.4%, 1.75rem); /* at least 24px to tap */
      aspect-ratio: 1;
    }
    .target.edge {
      width: 1.5rem;
      aspect-ratio: 1;
      border-style: dashed;
    }
    .target.hex {
      width: clamp(2rem, 6%, 2.75rem);
      aspect-ratio: 1;
    }
  `,
})
export class CatanMapComponent {
  readonly state = input.required<CatanState>();
  readonly targets = input<MapTargets | null>(null);
  readonly picked = output<number>();

  protected readonly SETTLEMENT = 'M-1.7,1.4 v-1.9 l1.7,-1.5 l1.7,1.5 v1.9 z';
  protected readonly CITY = 'M-2.6,1.6 v-2.4 l1.3,-1.2 l1.3,1.2 v0.5 h2.6 v1.9 z';

  protected readonly layout = computed(() => mapLayout(this.state().board.size));

  protected readonly hexes = computed(() => {
    const G = this.state();
    return this.layout().hexes.map((h) => {
      const { terrain, token } = G.board.hexes[h.id]!;
      const local = h.points
        .split(' ')
        .map((p) => p.split(',').map(Number) as [number, number])
        .map(([x, y]) => `${round(x - h.x)},${round(y - h.y)}`)
        .join(' ');
      return {
        id: h.id,
        x: h.x,
        y: h.y,
        points: local,
        terrain,
        token,
        hot: token === 6 || token === 8,
        motif: MOTIF[terrain] ?? '',
        pips: token === null ? [] : pips(token),
      };
    });
  });

  protected readonly harbours = computed(() =>
    this.layout().harbours.map((h) => {
      const kind = this.state().board.harbours[h.slot]!;
      return {
        slot: h.slot,
        label: h.label,
        a: towards(h.label, h.corners[0], 0.8),
        b: towards(h.label, h.corners[1], 0.8),
        kind,
        ratio: kind === 'any' ? '3:1' : '2:1',
        // the 24-unit icon scaled into the top half of the ring
        icon: iconPathFor(kind),
        iconAt: `translate(${h.label.x - 1.92} ${h.label.y - 3.85}) scale(0.16)`,
      };
    }),
  );

  protected readonly roads = computed(() => {
    const { edges } = this.layout();
    return this.state().roads.flatMap((owner, id) => {
      if (owner === null) return [];
      const { a, b } = edges[id]!;
      return [{ id, a: towards(a, b, 0.16), b: towards(b, a, 0.16), color: seatColor(owner) }];
    });
  });

  protected readonly buildings = computed(() => {
    const { vertices } = this.layout();
    return this.state().buildings.flatMap((b, id) =>
      b ? [{ ...vertices[id]!, kind: b.kind, color: seatColor(b.owner) }] : [],
    );
  });

  /** Sits beside the number so both stay readable. */
  protected readonly bandit = computed<Point>(() => {
    const hex = this.layout().hexes[this.state().bandit]!;
    const hasToken = this.state().board.hexes[this.state().bandit]!.token !== null;
    return { x: hex.x + (hasToken ? -5 : 0), y: hex.y + 1 };
  });

  protected readonly spots = computed(() => {
    const t = this.targets();
    if (!t) return [];
    const G = this.state();
    const { width, height, vertices, edges, hexes } = this.layout();
    return t.ids.map((id) => {
      const [p, where] =
        t.kind === 'vertex'
          ? [vertices[id]!, vertexName(G, id)]
          : t.kind === 'edge'
            ? [edges[id]!.mid, edgeName(G, id)]
            : [hexes[id]!, hexPlace(G, id)];
      return {
        id,
        left: (p.x / width) * 100,
        top: (p.y / height) * 100,
        label: `${t.verb}: ${where}`,
      };
    });
  });

  protected readonly summary = computed(() => {
    const G = this.state();
    const geo = getGeometry(G.board.size);
    const harbours = G.board.harbours.map((kind, slot) => {
      const hex = geo.edges[geo.harbourSlots[slot]!]!.hexes[0]!;
      return `${harbourName(kind)} by ${hexName(G, hex)}`;
    });
    return (
      `Island of ${geo.hexes.length} lands. The Bandit is on ${hexName(G, G.bandit)}. ` +
      `Harbours: ${harbours.join('; ')}.`
    );
  });
}

function seatColor(playerID: string): string {
  return `var(--bt-color-seat-${Number(playerID) % 8})`;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
