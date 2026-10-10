import { ErrorHandler, Injectable, Injector, inject } from '@angular/core';
import type { NavigationError } from '@angular/router';
import { ErrorService } from './error.service';

/**
 * Last line of defence: errors nothing else handled (bugs, unhandled promise rejections;
 * provideBrowserGlobalErrorListeners forwards window errors here) are logged and shown as one
 * toast. ErrorService is resolved lazily: it needs the Router, which itself needs ErrorHandler.
 */
@Injectable()
export class AppErrorHandler implements ErrorHandler {
  private readonly injector = inject(Injector);

  handleError(error: unknown): void {
    try {
      this.injector.get(ErrorService).report(error);
    } catch (reportingFailed) {
      // Reporting must never throw from here (it would loop); the console is all that's left.
      console.error('[board-table]', error, reportingFailed);
    }
  }
}

/** Router: a page that couldn't be opened (e.g. its chunk is gone after a deploy). */
export function reportNavigationError(navigation: NavigationError): void {
  inject(ErrorService).report(navigation.error, { context: 'The page couldn’t be opened.' });
}
