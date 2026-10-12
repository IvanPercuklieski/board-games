import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { Resource } from '@board-table/games';

/** A small square in the colour of the land a resource comes from (decorative). */
@Component({
  selector: 'bt-resource-swatch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', '[class]': 'resource()' },
  template: ``,
  styles: `
    :host {
      display: inline-block;
      flex: none;
      width: 0.8rem;
      height: 0.8rem;
      border-radius: 2px;
      box-shadow: inset 0 0 0 1px rgb(var(--bt-shadow-color) / 0.3);
    }
    :host(.timber) {
      background: var(--bt-color-terrain-forest);
    }
    :host(.clay) {
      background: var(--bt-color-terrain-hills);
    }
    :host(.wool) {
      background: var(--bt-color-terrain-pasture);
    }
    :host(.grain) {
      background: var(--bt-color-terrain-fields);
    }
    :host(.ore) {
      background: var(--bt-color-terrain-mountains);
    }
  `,
})
export class ResourceSwatchComponent {
  readonly resource = input.required<Resource>();
}
