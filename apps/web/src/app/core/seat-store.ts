import { Injectable } from '@angular/core';
import { seatCredentialsSchema, type SeatCredentials } from '@board-table/shared';

export type StoredSeat = SeatCredentials;

const seatKey = (roomId: string) => `bt-seat:${roomId}`;
const inviteKey = (roomId: string) => `bt-invite:${roomId}`;
const pendingTokenKey = (roomId: string) => `bt-join-token:${roomId}`;

/**
 * Remembers this browser's seat (and, for hosts, the latest invite link) per room.
 *
 * A seat is kept for this window (session storage: survives a reload, one per tab) and for the
 * browser (local storage: so a new tab finds it). Windows can share one browser storage (every
 * incognito window of a browser does), so the browser entry is never overwritten with another
 * seat: each window keeps playing its own seat.
 * Storage may be unavailable (private mode, blocked site data): then nothing is remembered.
 */
@Injectable({ providedIn: 'root' })
export class SeatStore {
  /** This window's seat, or else the one this browser remembers. */
  seat(roomId: string): StoredSeat | undefined {
    return this.seatInThisWindow(roomId) ?? parseSeat(read(local, seatKey(roomId)));
  }

  seatInThisWindow(roomId: string): StoredSeat | undefined {
    return parseSeat(read(session, seatKey(roomId)));
  }

  /**
   * Seats this window. The browser remembers it too, unless it already remembers a different
   * seat (another window's); fresh credentials for the same seat replace the old ones.
   */
  saveSeat(roomId: string, seat: StoredSeat) {
    const value = JSON.stringify(seat);
    write(session, seatKey(roomId), value);
    const browser = parseSeat(read(local, seatKey(roomId)));
    if (!browser || browser.seatIndex === seat.seatIndex) {
      write(local, seatKey(roomId), value);
    }
  }

  inviteUrl(roomId: string): string | undefined {
    return read(local, inviteKey(roomId));
  }

  saveInviteUrl(roomId: string, url: string) {
    write(local, inviteKey(roomId), url);
  }

  /**
   * Keeps an invite token while the player logs in before joining. Session storage (this tab
   * only, gone when it closes), never the login URL: query strings reach the server.
   */
  stashInviteToken(roomId: string, token: string) {
    write(session, pendingTokenKey(roomId), token);
  }

  /** The stashed invite token, removed as it is read. */
  takeInviteToken(roomId: string): string | undefined {
    const token = read(session, pendingTokenKey(roomId));
    remove(session, pendingTokenKey(roomId));
    return token;
  }

  /** Forgets this window's seat; the browser's too if it is the same seat. */
  forget(roomId: string) {
    const mine = this.seat(roomId);
    remove(session, seatKey(roomId));
    const browser = parseSeat(read(local, seatKey(roomId)));
    if (browser && browser.credentials === mine?.credentials) remove(local, seatKey(roomId));
    remove(local, inviteKey(roomId));
  }
}

function parseSeat(raw: string | undefined): StoredSeat | undefined {
  if (raw === undefined) return undefined;
  try {
    const parsed = seatCredentialsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined; // not JSON
  }
}

// Even reading `localStorage` can throw (private mode, blocked site data), so storages are
// passed as getters and touched only inside try; then nothing is remembered.
type StorageRef = () => Storage;
const local: StorageRef = () => localStorage;
const session: StorageRef = () => sessionStorage;

function read(storage: StorageRef, key: string): string | undefined {
  try {
    return storage().getItem(key) ?? undefined;
  } catch {
    return undefined; // storage blocked: nothing stored here
  }
}

function write(storage: StorageRef, key: string, value: string) {
  try {
    storage().setItem(key, value);
  } catch {
    // storage blocked: not remembered
  }
}

function remove(storage: StorageRef, key: string) {
  try {
    storage().removeItem(key);
  } catch {
    // storage blocked: nothing to remove
  }
}
