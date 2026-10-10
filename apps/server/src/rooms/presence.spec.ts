import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomPresence, type PresenceChange } from './presence';

const GRACE = 10_000;
const STARTUP = 30_000;
const FREE_AFTER = 120_000;

describe('RoomPresence', () => {
  let changes: PresenceChange[];
  let presence: RoomPresence;

  const create = () =>
    new RoomPresence({
      graceMs: GRACE,
      startupGraceMs: STARTUP,
      freeSeatAfterMs: FREE_AFTER,
      onChange: (change) => changes.push(change),
    });

  beforeEach(() => {
    vi.useFakeTimers();
    changes = [];
    presence = create();
    vi.advanceTimersByTime(STARTUP); // past the startup grace unless a test needs it
  });

  afterEach(() => {
    presence.stop();
    vi.useRealTimers();
  });

  it('a connected seat is present and never changes', () => {
    presence.connected('r1', 'seat-a', 's1');
    vi.advanceTimersByTime(FREE_AFTER * 2);
    expect(presence.isAway('r1', 'seat-a')).toBe(false);
    expect(changes).toEqual([]);
  });

  it('a seat is away once its last socket has been gone for the grace period', () => {
    presence.connected('r1', 'seat-a', 's1');
    presence.disconnected('r1', 'seat-a', 's1');
    vi.advanceTimersByTime(GRACE - 1);
    expect(presence.isAway('r1', 'seat-a')).toBe(false);
    vi.advanceTimersByTime(1);
    expect(presence.isAway('r1', 'seat-a')).toBe(true);
    expect(changes).toEqual([{ roomId: 'r1', seatKey: 'seat-a', kind: 'away' }]);
  });

  it('a reload within the grace period never shows as away', () => {
    presence.connected('r1', 'seat-a', 's1');
    presence.disconnected('r1', 'seat-a', 's1');
    vi.advanceTimersByTime(GRACE / 2);
    presence.connected('r1', 'seat-a', 's2');
    vi.advanceTimersByTime(FREE_AFTER * 2);
    expect(presence.isAway('r1', 'seat-a')).toBe(false);
    expect(changes).toEqual([]);
  });

  it('a seat with another open tab stays present', () => {
    presence.connected('r1', 'seat-a', 's1');
    presence.connected('r1', 'seat-a', 's2');
    presence.disconnected('r1', 'seat-a', 's1');
    vi.advanceTimersByTime(FREE_AFTER);
    expect(presence.isAway('r1', 'seat-a')).toBe(false);
    expect(presence.socketCount('r1', 'seat-a')).toBe(1);
  });

  it('coming back after being away is reported', () => {
    presence.connected('r1', 'seat-a', 's1');
    presence.disconnected('r1', 'seat-a', 's1');
    vi.advanceTimersByTime(GRACE);
    presence.connected('r1', 'seat-a', 's2');
    expect(presence.isAway('r1', 'seat-a')).toBe(false);
    expect(changes.map((c) => c.kind)).toEqual(['away', 'back']);
    vi.advanceTimersByTime(FREE_AFTER);
    expect(changes.map((c) => c.kind)).toEqual(['away', 'back']);
  });

  it('reports an expired seat after the free-seat period (counted from the disconnect)', () => {
    presence.connected('r1', 'seat-a', 's1');
    presence.disconnected('r1', 'seat-a', 's1');
    vi.advanceTimersByTime(FREE_AFTER - 1);
    expect(changes.map((c) => c.kind)).toEqual(['away']);
    vi.advanceTimersByTime(1);
    expect(changes.map((c) => c.kind)).toEqual(['away', 'expired']);
  });

  it('a tracked seat that never connects goes away after the grace period', () => {
    presence.track('r1', 'seat-a');
    vi.advanceTimersByTime(GRACE);
    expect(presence.isAway('r1', 'seat-a')).toBe(true);
  });

  it('tracking a connected seat changes nothing', () => {
    presence.connected('r1', 'seat-a', 's1');
    presence.track('r1', 'seat-a');
    vi.advanceTimersByTime(FREE_AFTER);
    expect(changes).toEqual([]);
  });

  it('gives every seat the startup grace right after the server starts', () => {
    presence.stop();
    changes = [];
    presence = create(); // "server start" now
    presence.track('r1', 'seat-a');
    vi.advanceTimersByTime(GRACE);
    expect(presence.isAway('r1', 'seat-a')).toBe(false);
    vi.advanceTimersByTime(STARTUP - GRACE);
    expect(presence.isAway('r1', 'seat-a')).toBe(true);
  });

  it('forgetting a seat or a room stops its timers and drops its entries', () => {
    presence.track('r1', 'seat-a');
    presence.track('r1', 'seat-b');
    presence.track('r2', 'seat-c');
    presence.forgetSeat('r1', 'seat-a');
    presence.forgetRoom('r2');
    vi.advanceTimersByTime(FREE_AFTER);
    expect(changes).toEqual([
      { roomId: 'r1', seatKey: 'seat-b', kind: 'away' },
      { roomId: 'r1', seatKey: 'seat-b', kind: 'expired' },
    ]);
    expect(presence.size()).toBe(1);
    presence.forgetRoom('r1');
    expect(presence.size()).toBe(0);
  });

  it('a disconnect of an unknown socket is ignored', () => {
    presence.disconnected('r1', 'seat-a', 'nope');
    vi.advanceTimersByTime(FREE_AFTER);
    expect(changes).toEqual([]);
    expect(presence.size()).toBe(0);
  });

  it('lists seats whose free-seat period has passed (e.g. while a game was running)', () => {
    presence.connected('r1', 'seat-a', 's1');
    presence.track('r1', 'seat-b');
    presence.disconnected('r1', 'seat-a', 's1');
    vi.advanceTimersByTime(FREE_AFTER - 1);
    expect(presence.expiredSeats('r1')).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(presence.expiredSeats('r1')).toEqual(['seat-a', 'seat-b']);
    presence.connected('r1', 'seat-a', 's2');
    expect(presence.expiredSeats('r1')).toEqual(['seat-b']);
    expect(presence.expiredSeats('r2')).toEqual([]);
  });

  it('lists the tracked seats of a room', () => {
    presence.track('r1', 'seat-a');
    presence.connected('r1', 'seat-b', 's1');
    expect(presence.seatKeys('r1')).toEqual(['seat-a', 'seat-b']);
    expect(presence.seatKeys('r2')).toEqual([]);
  });

  it('isAway is false for seats it does not know', () => {
    expect(presence.isAway('r1', 'unknown')).toBe(false);
  });

  it('stop clears every timer', () => {
    presence.track('r1', 'seat-a');
    presence.stop();
    vi.advanceTimersByTime(FREE_AFTER);
    expect(changes).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
