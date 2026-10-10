import { inject, signal, type Signal } from '@angular/core';
import { ErrorService } from './error.service';

export interface AsyncAction<A extends unknown[], R> {
  /** True while the task runs: bind to the button's [loading]. */
  readonly busy: Signal<boolean>;
  /** Runs the task unless it is already running; resolves undefined if it failed or was ignored. */
  run(...args: A): Promise<R | undefined>;
}

export interface AsyncActionOptions {
  /** What failed, as the start of the error toast, e.g. "The room couldn't be closed." */
  context: string;
  /**
   * Called with the error before it is reported, e.g. to change the page state. Return true
   * when the page already shows this error inline, to skip the toast.
   */
  onError?: (error: unknown) => boolean | void;
}

/**
 * A user action that waits on the server (CLAUDE.md "Errors & loading"): busy state for the
 * button, no double runs, and failures reported through ErrorService. Create it in an
 * injection context (e.g. a component field). It holds no timers or subscriptions.
 */
export function asyncAction<A extends unknown[], R>(
  task: (...args: A) => Promise<R>,
  { context, onError }: AsyncActionOptions,
): AsyncAction<A, R> {
  const errors = inject(ErrorService);
  const busy = signal(false);
  return {
    busy: busy.asReadonly(),
    async run(...args: A) {
      if (busy()) return undefined;
      busy.set(true);
      try {
        return await task(...args);
      } catch (error) {
        if (onError?.(error) !== true) errors.report(error, { context });
        return undefined;
      } finally {
        busy.set(false);
      }
    },
  };
}
