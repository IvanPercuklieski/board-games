import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ToastService, type ToastAction } from '../ui/toast/toast.service';
import { ApiError } from './api-client';
import { describeError, isChunkLoadError } from './error-messages';

/** The same message is shown at most once in this window (polling can't flood the screen). */
const REPEAT_WINDOW_MS = 5_000;
const DURATION_MS = 6_000;
const DURATION_WITH_ACTION_MS = 10_000;

/**
 * Every error in the web app is reported here: it is logged to the browser console (no
 * external error tracking; never tokens, secrets or invite links) and shown as a danger toast.
 */
@Injectable({ providedIn: 'root' })
export class ErrorService {
  private readonly toasts = inject(ToastService);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  /** message -> when it was last shown; pruned on every report, so it stays tiny. */
  private readonly recent = new Map<string, number>();

  report(error: unknown, { context }: { context?: string } = {}) {
    console.error('[board-table]', summary(error));
    const message = describeError(error, context);
    if (this.shownRecently(message)) return;
    const action = this.actionFor(error);
    this.toasts.show({
      message,
      tone: 'danger',
      action,
      durationMs: action ? DURATION_WITH_ACTION_MS : DURATION_MS,
    });
  }

  /** A known failure that isn't an exception, e.g. copying to the clipboard didn't work. */
  notice(message: string) {
    if (this.shownRecently(message)) return;
    this.toasts.show({ message, tone: 'danger', durationMs: DURATION_MS });
  }

  private actionFor(error: unknown): ToastAction | undefined {
    if (isChunkLoadError(error)) {
      return { label: 'Reload', run: () => this.document.location.reload() };
    }
    if (error instanceof ApiError && error.code === 'unauthorized') {
      return {
        label: 'Log in',
        run: () =>
          void this.router.navigateByUrl(`/login?next=${encodeURIComponent(this.router.url)}`),
      };
    }
    return undefined;
  }

  private shownRecently(message: string): boolean {
    const now = Date.now();
    for (const [text, at] of this.recent) {
      if (now - at >= REPEAT_WINDOW_MS) this.recent.delete(text);
    }
    if (this.recent.has(message)) return true;
    this.recent.set(message, now);
    return false;
  }
}

/** What goes to the console: API errors only by code and status (no request details). */
function summary(error: unknown): unknown {
  return error instanceof ApiError ? `API error ${error.code} (${error.status})` : error;
}
