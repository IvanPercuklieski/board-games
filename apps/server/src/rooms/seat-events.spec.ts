import { describe, expect, it, vi } from 'vitest';
import { SeatEvents } from './seat-events';

describe('SeatEvents', () => {
  it('tells listeners which seat was revoked until they unsubscribe', () => {
    const events = new SeatEvents();
    const listener = vi.fn();
    const unsubscribe = events.onRevoked(listener);
    events.revoked('room-1', '1');
    expect(listener).toHaveBeenCalledWith('room-1', '1');
    unsubscribe();
    events.revoked('room-1', '0');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('tells listeners which match ended until they unsubscribe', () => {
    const events = new SeatEvents();
    const listener = vi.fn();
    const unsubscribe = events.onMatchEnded(listener);
    events.matchEnded('room-1');
    expect(listener).toHaveBeenCalledWith('room-1');
    unsubscribe();
    events.matchEnded('room-2');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
