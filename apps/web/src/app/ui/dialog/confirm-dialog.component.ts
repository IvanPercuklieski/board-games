import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ButtonComponent } from '../button/button.component';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
}

let nextId = 0;

/** Content of the confirm dialog; the CDK dialog provides focus trap, Escape and backdrop. */
@Component({
  selector: 'bt-confirm-dialog',
  imports: [ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'dialog',
    'aria-modal': 'true',
    '[attr.aria-labelledby]': 'titleId',
    '[attr.aria-describedby]': 'messageId',
  },
  template: `
    <h2 class="title" [id]="titleId">{{ data.title }}</h2>
    <p class="message" [id]="messageId">{{ data.message }}</p>
    <div class="actions">
      <button bt-button variant="ghost" (click)="ref.close(false)">
        {{ data.cancelLabel ?? 'Cancel' }}
      </button>
      <button bt-button [variant]="data.tone ?? 'primary'" (click)="ref.close(true)">
        {{ data.confirmLabel }}
      </button>
    </div>
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--bt-space-3);
      width: min(28rem, calc(100vw - 2 * var(--bt-space-4)));
      padding: var(--bt-space-6);
      border: var(--bt-border-width) solid var(--bt-color-border);
      border-radius: var(--bt-radius-lg);
      background: var(--bt-color-surface-raised);
      box-shadow: var(--bt-shadow-lg);
    }
    .title {
      font-size: var(--bt-text-xl);
    }
    .message {
      color: var(--bt-color-text-muted);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--bt-space-2);
      margin-top: var(--bt-space-3);
    }
  `,
})
export class ConfirmDialogComponent {
  protected readonly data = inject<ConfirmOptions>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly titleId = `bt-dialog-title-${nextId}`;
  protected readonly messageId = `bt-dialog-message-${nextId++}`;
}
