import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { RESOURCES, type Resource, type ResourceCounts } from '@board-table/games';
import { IconButtonComponent } from '../../ui/button/icon-button.component';
import { RESOURCE_NAME } from './catan-labels';
import { ResourceSwatchComponent } from './resource-swatch.component';

export function noCounts(): ResourceCounts {
  return { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 };
}

let nextId = 0;

/** Picks a number of each resource with − / + buttons, each limited by `max`. */
@Component({
  selector: 'bt-resource-counter',
  imports: [IconButtonComponent, ResourceSwatchComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset>
      <legend>{{ label() }}</legend>
      @for (row of rows(); track row.resource) {
        <div class="row">
          <bt-resource-swatch [resource]="row.resource" />
          <span class="name" [id]="row.id">{{ row.name }}</span>
          <button
            bt-icon-button
            size="sm"
            icon="minus"
            [label]="'One less ' + row.lower"
            [disabled]="row.count === 0"
            (click)="change(row.resource, -1)"
          ></button>
          <output class="count" [attr.aria-labelledby]="row.id">{{ row.count }}</output>
          <button
            bt-icon-button
            size="sm"
            icon="plus"
            [label]="'One more ' + row.lower"
            [disabled]="row.count >= row.max"
            (click)="change(row.resource, 1)"
          ></button>
        </div>
      }
    </fieldset>
  `,
  styles: `
    fieldset {
      display: grid;
      gap: var(--bt-space-1);
      margin: 0;
      padding: 0;
      border: 0;
      min-width: 0;
    }
    legend {
      margin-bottom: var(--bt-space-2);
      padding: 0;
      font-weight: 600;
      font-size: var(--bt-text-sm);
    }
    .row {
      display: grid;
      grid-template-columns: auto 1fr auto 2ch auto;
      align-items: center;
      gap: var(--bt-space-2);
    }
    .count {
      font-family: var(--bt-font-mono);
      text-align: center;
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class ResourceCounterComponent {
  readonly label = input.required<string>();
  /** Most of each resource that can be picked (e.g. the cards in hand); unlimited if absent. */
  readonly max = input<Partial<ResourceCounts> | null>(null);
  readonly value = model<ResourceCounts>(noCounts());

  private readonly uid = nextId++;

  protected readonly rows = computed(() =>
    RESOURCES.map((resource) => ({
      resource,
      id: `count-${resource}-${this.uid}`,
      name: RESOURCE_NAME[resource],
      lower: RESOURCE_NAME[resource].toLowerCase(),
      count: this.value()[resource],
      max: this.max()?.[resource] ?? 99,
    })),
  );

  protected change(resource: Resource, delta: number) {
    this.value.update((v) => ({ ...v, [resource]: Math.max(0, v[resource] + delta) }));
  }
}
