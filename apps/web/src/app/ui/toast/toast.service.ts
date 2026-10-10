import { Injectable, signal } from '@angular/core';

export type ToastTone = 'neutral' | 'success' | 'danger';

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

const MAX_TOASTS = 3;
const DEFAULT_DURATION_MS = 4000;

/** Short, non-blocking messages. Each toast's timer is cleared when it goes away. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly list = signal<Toast[]>([]);
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();
  private nextId = 0;

  readonly toasts = this.list.asReadonly();

  show({
    message,
    tone = 'neutral',
    durationMs = DEFAULT_DURATION_MS,
  }: {
    message: string;
    tone?: ToastTone;
    durationMs?: number;
  }) {
    const toast: Toast = { id: this.nextId++, message, tone };
    const next = [...this.list(), toast];
    for (const dropped of next.slice(0, Math.max(0, next.length - MAX_TOASTS))) {
      this.clearTimer(dropped.id);
    }
    this.list.set(next.slice(-MAX_TOASTS));
    this.timers.set(
      toast.id,
      setTimeout(() => this.dismiss(toast.id), durationMs),
    );
  }

  dismiss(id: number) {
    this.clearTimer(id);
    this.list.update((list) => list.filter((t) => t.id !== id));
  }

  clear() {
    for (const id of this.timers.keys()) this.clearTimer(id);
    this.list.set([]);
  }

  private clearTimer(id: number) {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
  }
}
