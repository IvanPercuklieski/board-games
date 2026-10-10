import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IconComponent } from '../icon/icon.component';
import type { IconName } from '../icon/icons';
import { BUTTON_STYLES } from './button.styles';
import type { ButtonVariant } from './button.component';

/** Square icon-only button. `label` is required: it is the accessible name and the tooltip. */
@Component({
  selector: 'button[bt-icon-button]',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': 'classes()',
    '[attr.aria-label]': 'label()',
    '[attr.title]': 'label()',
    '[attr.type]': '"button"',
  },
  template: `<bt-icon [name]="icon()" />`,
  styles: [
    BUTTON_STYLES,
    `
      :host {
        width: 2.5rem;
        padding: 0;
        font-size: var(--bt-text-base);
      }
      :host(.bt-button--sm) {
        width: 2rem;
        padding: 0;
      }
    `,
  ],
})
export class IconButtonComponent {
  readonly icon = input.required<IconName>();
  readonly label = input.required<string>();
  readonly variant = input<ButtonVariant>('ghost');
  readonly size = input<'sm' | 'md'>('md');
  protected readonly classes = computed(
    () => `bt-button bt-button--${this.variant()} bt-button--${this.size()}`,
  );
}
