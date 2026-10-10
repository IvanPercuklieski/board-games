import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  computed,
  contentChild,
  forwardRef,
  inject,
  input,
} from '@angular/core';

let nextId = 0;

/** Label + input + hint/error, with the label, description and invalid state connected. */
@Component({
  selector: 'bt-text-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="label" [attr.for]="control()?.id">{{ label() }}</label>
    <ng-content />
    @if (error()) {
      <p class="message error" [id]="messageId">{{ error() }}</p>
    } @else if (hint()) {
      <p class="message" [id]="messageId">{{ hint() }}</p>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--bt-space-2);
    }
    .label {
      font-size: var(--bt-text-sm);
      font-weight: 600;
    }
    .message {
      font-size: var(--bt-text-sm);
      color: var(--bt-color-text-muted);
    }
    .error {
      color: var(--bt-color-danger-text);
    }
  `,
})
export class TextFieldComponent {
  readonly label = input.required<string>();
  readonly hint = input<string>();
  readonly error = input<string | null>();

  readonly messageId = `bt-field-message-${nextId++}`;
  readonly describedBy = computed(() => (this.error() || this.hint() ? this.messageId : null));
  protected readonly control = contentChild(forwardRef(() => InputDirective));
}

/** The native input/textarea inside a `<bt-text-field>`; gets its id, description and state. */
@Directive({
  selector: 'input[btInput], textarea[btInput]',
  host: {
    class: 'bt-input',
    '[id]': 'id',
    '[attr.aria-describedby]': 'field?.describedBy() ?? null',
    '[attr.aria-invalid]': 'field?.error() ? "true" : null',
  },
})
export class InputDirective {
  readonly id = `bt-input-${nextId++}`;
  protected readonly field = inject(TextFieldComponent, { optional: true });
}
