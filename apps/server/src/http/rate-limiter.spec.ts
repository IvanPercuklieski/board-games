import { afterEach, describe, expect, it, vi } from 'vitest';
import { RateLimiter } from './rate-limiter';

describe('RateLimiter', () => {
  let now = 0;
  const clock = () => now;
  let limiter: RateLimiter;

  afterEach(() => {
    limiter?.stop();
    vi.useRealTimers();
  });

  it('allows up to `limit` hits per window, then refuses with a retry time', () => {
    limiter = new RateLimiter({ now: clock });
    now = 1_000;
    for (let i = 0; i < 3; i++) expect(limiter.consume('ip:a', 3, 60_000).allowed).toBe(true);
    const refused = limiter.consume('ip:a', 3, 60_000);
    expect(refused).toEqual({ allowed: false, retryAfterSeconds: 60 });
    now = 31_000;
    expect(limiter.consume('ip:a', 3, 60_000)).toEqual({ allowed: false, retryAfterSeconds: 30 });
  });

  it('starts a fresh window after the old one ends', () => {
    limiter = new RateLimiter({ now: clock });
    now = 0;
    for (let i = 0; i < 2; i++) limiter.consume('k', 2, 1_000);
    expect(limiter.consume('k', 2, 1_000).allowed).toBe(false);
    now = 1_000;
    expect(limiter.consume('k', 2, 1_000).allowed).toBe(true);
  });

  it('counts keys independently', () => {
    limiter = new RateLimiter({ now: clock });
    now = 0;
    expect(limiter.consume('a', 1, 1_000).allowed).toBe(true);
    expect(limiter.consume('a', 1, 1_000).allowed).toBe(false);
    expect(limiter.consume('b', 1, 1_000).allowed).toBe(true);
  });

  it('forgets expired keys so memory does not grow without bound', () => {
    limiter = new RateLimiter({ now: clock });
    now = 0;
    for (let i = 0; i < 1_000; i++) limiter.consume(`ip:${i}`, 5, 1_000);
    expect(limiter.size).toBe(1_000);
    now = 999;
    limiter.sweep();
    expect(limiter.size).toBe(1_000);
    now = 1_000;
    limiter.sweep();
    expect(limiter.size).toBe(0);
  });

  it('sweeps periodically once started and stops cleanly', () => {
    vi.useFakeTimers();
    limiter = new RateLimiter({ now: clock, sweepIntervalMs: 10_000 });
    now = 0;
    limiter.consume('k', 1, 1_000);
    limiter.start();
    now = 5_000;
    vi.advanceTimersByTime(10_000);
    expect(limiter.size).toBe(0);
    limiter.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
