import { Dialog } from '@angular/cdk/dialog';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ConfirmDialogComponent, type ConfirmOptions } from './confirm-dialog.component';

/** Asks the user to confirm a consequential action. Resolves false on cancel/Escape/backdrop. */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly dialog = inject(Dialog);

  async confirm(options: ConfirmOptions): Promise<boolean> {
    const ref = this.dialog.open<boolean, ConfirmOptions>(ConfirmDialogComponent, {
      data: options,
      // our component carries role/aria itself; the CDK container stays neutral
      role: 'dialog',
      ariaModal: false,
      backdropClass: 'bt-dialog-backdrop',
      autoFocus: 'first-tabbable',
      restoreFocus: true,
    });
    return (await firstValueFrom(ref.closed)) === true;
  }

  closeAll() {
    this.dialog.closeAll();
  }
}
