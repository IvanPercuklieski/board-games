import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
} from '@angular/core';
import { SpinnerComponent } from '../feedback/spinner.component';
import { BUTTON_STYLES } from './button.styles';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * Styles a native `<button>` or `<a>` (so semantics, focus and keyboard stay native).
 * Buttons default to type="button"; while `loading` they are disabled and aria-busy.
 */
@Component({
  selector: 'button[bt-button], a[bt-button]',
  imports: [SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': 'classes()',
    '[attr.type]': 'type()',
    '[attr.aria-busy]': 'loading() ? "true" : null',
    '[attr.disabled]': 'isButton && (loading() || disabled()) ? "" : null',
  },
  template: `
    @if (loading()) {
      <bt-spinner size="sm" />
    }
    <ng-content />
  `,
  styles: BUTTON_STYLES,
})
export class ButtonComponent {
  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<ButtonSize>('md');
  readonly loading = input(false);
  readonly disabled = input(false);
  /** Native button type; ignored on links. */
  readonly buttonType = input<'button' | 'submit' | 'reset'>('button', { alias: 'type' });

  protected readonly isButton = inject(ElementRef<HTMLElement>).nativeElement.tagName === 'BUTTON';
  protected readonly classes = computed(
    () => `bt-button bt-button--${this.variant()} bt-button--${this.size()}`,
  );
  protected readonly type = computed(() => (this.isButton ? this.buttonType() : null));
}
