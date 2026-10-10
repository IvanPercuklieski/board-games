import { Component, inject } from '@angular/core';
import type { Meta, StoryObj } from '@storybook/angular-vite';
import { ButtonComponent } from './button/button.component';
import { ConfirmService } from './dialog/confirm.service';
import { ToastOutletComponent } from './toast/toast-outlet.component';
import { ToastService } from './toast/toast.service';

@Component({
  selector: 'bt-overlays-demo',
  imports: [ButtonComponent, ToastOutletComponent],
  template: `
    <div style="display:flex;gap:var(--bt-space-3);flex-wrap:wrap">
      <button bt-button variant="danger" (click)="ask()">Close room…</button>
      <button bt-button variant="secondary" (click)="toast('success')">Show success toast</button>
      <button bt-button variant="secondary" (click)="toast('danger')">Show error toast</button>
      <button bt-button variant="secondary" (click)="actionToast()">Show toast with action</button>
    </div>
    <p style="margin-top:var(--bt-space-4);color:var(--bt-color-text-muted)">
      Last answer: {{ answer }}
    </p>
    <bt-toast-outlet />
  `,
})
class OverlaysDemoComponent {
  private readonly confirmService = inject(ConfirmService);
  private readonly toasts = inject(ToastService);
  protected answer = '—';

  async ask() {
    const ok = await this.confirmService.confirm({
      title: 'Close this room?',
      message: 'Everyone in it will be removed and the game is lost.',
      confirmLabel: 'Close room',
      tone: 'danger',
    });
    this.answer = ok ? 'confirmed' : 'cancelled';
  }

  actionToast() {
    this.toasts.show({
      message: 'A new version of board·table is available. Reload to continue.',
      tone: 'danger',
      action: { label: 'Reload', run: () => (this.answer = 'reload clicked') },
    });
  }

  toast(tone: 'success' | 'danger') {
    this.toasts.show(
      tone === 'success'
        ? { message: 'Invite link copied', tone }
        : { message: 'That invite link no longer works', tone },
    );
  }
}

const meta: Meta<OverlaysDemoComponent> = {
  title: 'UI/Overlays',
  component: OverlaysDemoComponent,
};
export default meta;

export const DialogAndToasts: StoryObj<OverlaysDemoComponent> = { name: 'Dialog & toasts' };
