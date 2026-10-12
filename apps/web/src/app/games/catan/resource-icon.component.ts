import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { HarbourKind, Resource } from '@board-table/games';

/**
 * Original line icons for the five resources, drawn on a 24×24 grid as single paths (stroke
 * only), so the map's SVG can reuse the same data: a log, bricks, a fleece, a wheat ear, rocks.
 */
export const RESOURCE_ICON_PATHS: Record<Resource, string> = {
  timber: 'M18 8a3 4 0 1 1 0 8a3 4 0 1 1 0-8z M18 8H6a3 4 0 0 0 0 8h12 M18 11v2',
  clay: 'M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z M3 12h18 M9 6v6 M15 12v6',
  wool: 'M7 16a3 3 0 0 1-.5-6A4 4 0 0 1 14 8a3.5 3.5 0 0 1 4 6.5A2.5 2.5 0 0 1 16 16z M9 16v3 M15 16v3',
  grain:
    'M12 21V6 M12 9c-2-1-3-3-3-5 2 0 3 2 3 5z M12 9c2-1 3-3 3-5-2 0-3 2-3 5z M12 14c-2-1-3-3-3-5 2 0 3 2 3 5z M12 14c2-1 3-3 3-5-2 0-3 2-3 5z',
  ore: 'M3 18l5-9 4 3 3-6 6 12z M10 12l2 6',
};

/** "Any resource" (3:1 harbours): a question mark on the same grid. */
export const ANY_RESOURCE_PATH = 'M9 9a3 3 0 1 1 4.5 2.6c-1 .6-1.5 1.2-1.5 2.4 M12 18v.5';

export function iconPathFor(kind: HarbourKind): string {
  return kind === 'any' ? ANY_RESOURCE_PATH : RESOURCE_ICON_PATHS[kind];
}

/** A resource icon in the current text colour, 1em square (decorative: name it in text). */
@Component({
  selector: 'bt-resource-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: ` <svg viewBox="0 0 24 24" focusable="false"><path [attr.d]="path()" /></svg> `,
  styles: `
    :host {
      display: inline-flex;
      width: 1em;
      height: 1em;
      flex: none;
    }
    svg {
      width: 100%;
      height: 100%;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  `,
})
export class ResourceIconComponent {
  readonly resource = input.required<HarbourKind>();
  protected readonly path = computed(() => iconPathFor(this.resource()));
}
