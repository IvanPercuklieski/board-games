interface Window {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window rate limiter kept in memory (one server instance on Render). Expired keys are
 * swept periodically, so memory stays proportional to recently active clients.
 */
export class RateLimiter {
  private readonly windows = new Map<string, Window>();
  private readonly now: () => number;
  private readonly sweepIntervalMs: number;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor({ now = Date.now, sweepIntervalMs = 60_000 } = {}) {
    this.now = now;
    this.sweepIntervalMs = sweepIntervalMs;
  }

  /** Counts a hit for `key`; refused once more than `limit` hits fall into the current window. */
  consume(key: string, limit: number, windowMs: number) {
    const now = this.now();
    let window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + windowMs };
      this.windows.set(key, window);
    }
    window.count++;
    return window.count <= limit
      ? { allowed: true as const, retryAfterSeconds: 0 }
      : { allowed: false as const, retryAfterSeconds: Math.ceil((window.resetAt - now) / 1000) };
  }

  get size() {
    return this.windows.size;
  }

  sweep() {
    const now = this.now();
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key);
    }
  }

  start() {
    this.stop();
    this.timer = setInterval(() => this.sweep(), this.sweepIntervalMs);
    this.timer.unref(); // never keeps the process alive on its own
  }

  stop() {
    clearInterval(this.timer);
    this.timer = undefined;
  }
}
