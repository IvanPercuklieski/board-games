import { TestBed } from '@angular/core/testing';
import { SeatStore } from './seat-store';

const roomId = 'AbCdEfGhIjKlMnOpQrSt_-';
const credentials = 'A'.repeat(43);

describe('SeatStore', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  it('remembers the seat for a room', () => {
    const store = TestBed.inject(SeatStore);
    store.saveSeat(roomId, { seatIndex: 1, credentials });
    expect(store.seat(roomId)).toEqual({ seatIndex: 1, credentials });
    expect(store.seat('BbCdEfGhIjKlMnOpQrSt_-')).toBeUndefined();
  });

  describe('one seat per window', () => {
    const other = 'B'.repeat(43);

    it('prefers this window’s seat, and falls back to the browser’s for new tabs', () => {
      const store = TestBed.inject(SeatStore);
      store.saveSeat(roomId, { seatIndex: 1, credentials });
      expect(store.seatInThisWindow(roomId)).toEqual({ seatIndex: 1, credentials });
      sessionStorage.clear(); // a new tab of the same browser
      expect(store.seatInThisWindow(roomId)).toBeUndefined();
      expect(store.seat(roomId)).toEqual({ seatIndex: 1, credentials });
    });

    it('never overwrites another window’s seat in the browser', () => {
      const store = TestBed.inject(SeatStore);
      store.saveSeat(roomId, { seatIndex: 1, credentials }); // window A
      sessionStorage.clear(); // window B (e.g. another incognito window)
      store.saveSeat(roomId, { seatIndex: 2, credentials: other });
      expect(store.seat(roomId)).toEqual({ seatIndex: 2, credentials: other }); // B plays seat 2
      sessionStorage.clear(); // window A again after a reload of a third tab
      expect(store.seat(roomId)).toEqual({ seatIndex: 1, credentials }); // A's seat survived
    });

    it('replaces the browser’s seat with fresh credentials for the same seat', () => {
      const store = TestBed.inject(SeatStore);
      store.saveSeat(roomId, { seatIndex: 0, credentials });
      store.saveSeat(roomId, { seatIndex: 0, credentials: other });
      sessionStorage.clear();
      expect(store.seat(roomId)).toEqual({ seatIndex: 0, credentials: other });
    });

    it('forgets this window’s seat, and the browser’s only if it is the same one', () => {
      const store = TestBed.inject(SeatStore);
      store.saveSeat(roomId, { seatIndex: 1, credentials }); // window A (also the browser's)
      sessionStorage.clear();
      store.saveSeat(roomId, { seatIndex: 2, credentials: other }); // window B
      store.forget(roomId); // B's seat was freed
      expect(store.seatInThisWindow(roomId)).toBeUndefined();
      expect(store.seat(roomId)).toEqual({ seatIndex: 1, credentials }); // A keeps playing
      store.forget(roomId); // now A's (from the browser) goes
      expect(store.seat(roomId)).toBeUndefined();
    });
  });

  it('ignores corrupted or tampered entries', () => {
    localStorage.setItem(`bt-seat:${roomId}`, '{"seatIndex":"x"}');
    expect(TestBed.inject(SeatStore).seat(roomId)).toBeUndefined();
    localStorage.setItem(`bt-seat:${roomId}`, 'not json');
    expect(TestBed.inject(SeatStore).seat(roomId)).toBeUndefined();
  });

  it('keeps an invite token across a login, in this tab only, and hands it out once', () => {
    const store = TestBed.inject(SeatStore);
    store.stashInviteToken(roomId, 'T'.repeat(43));
    expect(localStorage.length).toBe(0); // never in localStorage
    expect(store.takeInviteToken(roomId)).toBe('T'.repeat(43));
    expect(store.takeInviteToken(roomId)).toBeUndefined();
    expect(store.takeInviteToken('BbCdEfGhIjKlMnOpQrSt_-')).toBeUndefined();
  });

  it('works without session storage (nothing kept)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const store = TestBed.inject(SeatStore);
    store.stashInviteToken(roomId, 'x');
    expect(store.takeInviteToken(roomId)).toBeUndefined();
  });

  it("remembers the host's latest invite link", () => {
    const store = TestBed.inject(SeatStore);
    store.saveInviteUrl(roomId, 'https://x.test/join/abc#t=1');
    expect(store.inviteUrl(roomId)).toBe('https://x.test/join/abc#t=1');
  });

  it('forgets everything about a room', () => {
    const store = TestBed.inject(SeatStore);
    store.saveSeat(roomId, { seatIndex: 0, credentials });
    store.saveInviteUrl(roomId, 'https://x.test/join/abc#t=1');
    store.forget(roomId);
    expect(store.seat(roomId)).toBeUndefined();
    expect(store.inviteUrl(roomId)).toBeUndefined();
  });

  it('works (without remembering) when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const store = TestBed.inject(SeatStore);
    expect(() => store.saveSeat(roomId, { seatIndex: 0, credentials })).not.toThrow();
    expect(store.seat(roomId)).toBeUndefined();
  });
});
