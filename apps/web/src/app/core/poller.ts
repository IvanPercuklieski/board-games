/**
 * Runs `task` now and then every `intervalMs` after the previous run finished (never
 * overlapping). Pauses while the page is hidden and runs again as soon as it is visible.
 * The owner must call stop() (e.g. from DestroyRef) so no timer or listener is left behind.
 */
export class Poller {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private stopped = true;

  private readonly onVisibilityChange = () => {
    if (document.hidden) {
      clearTimeout(this.timer); // paused until visible again
      this.timer = undefined;
    } else {
      void this.runNow();
    }
  };

  constructor(
    private readonly task: () => Promise<void>,
    private readonly intervalMs: number,
  ) {}

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    void this.runNow();
  }

  /** Runs right away (unless a run is in progress), then continues the normal rhythm. */
  async runNow() {
    if (this.stopped || this.running) return;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.running = true;
    try {
      await this.task();
    } catch {
      // the task reports its own errors; polling just continues
    } finally {
      this.running = false;
      this.scheduleNext();
    }
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.timer = undefined;
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  private scheduleNext() {
    if (this.stopped || document.hidden) return; // resumed by onVisibilityChange
    this.timer = setTimeout(() => void this.runNow(), this.intervalMs);
  }
}
