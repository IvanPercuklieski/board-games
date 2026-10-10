import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

export interface SegmentedOption<T> {
  value: T;
  label: string;
}

let nextId = 0;

/**
 * A small set of mutually exclusive choices (e.g. number of seats). Built on native radio
 * inputs, so keyboard (arrow keys) and screen readers work without extra code.
 */
@Component({
  selector: 'bt-segmented',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset role="radiogroup" [attr.aria-label]="label()">
      <legend class="bt-visually-hidden">{{ label() }}</legend>
      @for (option of options(); track option.value) {
        <label class="segment" [class.checked]="option.value === value()">
          <input
            type="radio"
            class="bt-visually-hidden"
            [name]="name"
            [checked]="option.value === value()"
            (change)="value.set(option.value)"
          />
          <span>{{ option.label }}</span>
        </label>
      }
    </fieldset>
  `,
  styles: `
    fieldset {
      display: inline-flex;
      margin: 0;
      padding: var(--bt-space-1);
      gap: var(--bt-space-1);
      border: var(--bt-border-width) solid var(--bt-color-border);
      border-radius: var(--bt-radius-md);
      background: var(--bt-color-surface-sunken);
    }
    .segment {
      position: relative;
      display: grid;
      place-items: center;
      min-width: 2.75rem;
      min-height: 2.25rem;
      padding: 0 var(--bt-space-3);
      border-radius: calc(var(--bt-radius-md) - 2px);
      font-weight: 600;
      font-size: var(--bt-text-sm);
      color: var(--bt-color-text-muted);
      cursor: pointer;
      transition:
        background-color var(--bt-duration-fast) var(--bt-ease-standard),
        color var(--bt-duration-fast) var(--bt-ease-standard);
    }
    .segment:hover {
      color: var(--bt-color-text);
    }
    .segment.checked {
      background: var(--bt-color-surface-raised);
      color: var(--bt-color-text);
      box-shadow: var(--bt-shadow-sm);
    }
    .segment:has(input:focus-visible) {
      box-shadow: var(--bt-focus-ring);
    }
  `,
})
export class SegmentedComponent<T> {
  readonly label = input.required<string>();
  readonly options = input.required<readonly SegmentedOption<T>[]>();
  readonly value = model<T>();
  protected readonly name = `bt-segmented-${nextId++}`;
}
