import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { IconComponent } from '../icon/icon.component';
import { ToastService } from './toast.service';

/** Renders toasts once per app, in a polite live region at the bottom of the screen. */
@Component({
  selector: 'bt-toast-outlet',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-label="Notifications" aria-live="polite" class="region">
      @for (toast of toasts.toasts(); track toast.id) {
        <div class="toast" [class]="'toast--' + toast.tone" animate.enter="enter">
          @if (toast.tone === 'success') {
            <bt-icon name="check-circle" />
          } @else if (toast.tone === 'danger') {
            <bt-icon name="warning-circle" />
          }
          <p class="message">{{ toast.message }}</p>
          <button
            type="button"
            class="dismiss"
            aria-label="Dismiss"
            (click)="toasts.dismiss(toast.id)"
          >
            <bt-icon name="x" />
          </button>
        </div>
      }
    </section>
  `,
  styles: `
    .region {
      position: fixed;
      inset: auto var(--bt-space-4) var(--bt-space-4) auto;
      z-index: 1000;
      display: grid;
      gap: var(--bt-space-2);
      width: min(24rem, calc(100vw - 2 * var(--bt-space-4)));
    }
    .toast {
      display: flex;
      align-items: center;
      gap: var(--bt-space-3);
      padding: var(--bt-space-3) var(--bt-space-3) var(--bt-space-3) var(--bt-space-4);
      border: var(--bt-border-width) solid var(--bt-color-border);
      border-left-width: 4px;
      border-radius: var(--bt-radius-md);
      background: var(--bt-color-surface-raised);
      box-shadow: var(--bt-shadow-lg);
    }
    .toast--success {
      border-left-color: var(--bt-color-accent);
      color: var(--bt-color-accent-text);
    }
    .toast--danger {
      border-left-color: var(--bt-color-danger);
      color: var(--bt-color-danger-text);
    }
    .message {
      flex: 1;
      color: var(--bt-color-text);
      font-size: var(--bt-text-sm);
    }
    .dismiss {
      display: grid;
      place-items: center;
      width: 2rem;
      height: 2rem;
      border: 0;
      border-radius: var(--bt-radius-sm);
      background: transparent;
      color: var(--bt-color-text-muted);
      cursor: pointer;
    }
    .dismiss:hover {
      background: var(--bt-color-surface-sunken);
      color: var(--bt-color-text);
    }
    .enter {
      animation: slide-in var(--bt-duration-slow) var(--bt-ease-emphasized);
    }
    @keyframes slide-in {
      from {
        opacity: 0;
        transform: translateY(0.5rem);
      }
    }
  `,
})
export class ToastOutletComponent {
  protected readonly toasts = inject(ToastService);
}
