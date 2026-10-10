import { Injectable } from '@angular/core';
import { seatCredentialsSchema, type SeatCredentials } from '@board-table/shared';

export type StoredSeat = SeatCredentials;

const seatKey = (roomId: string) => `bt-seat:${roomId}`;
const inviteKey = (roomId: string) => `bt-invite:${roomId}`;
const pendingTokenKey = (roomId: string) => `bt-join-token:${roomId}`;

/**
 * Remembers this browser's seat (and, for hosts, the latest invite link) per room.
 * Storage may be unavailable (private mode, blocked site data): then nothing is remembered.
 */
@Injectable({ providedIn: 'root' })
export class SeatStore {
  seat(roomId: string): StoredSeat | undefined {
    const raw = read(seatKey(roomId));
    if (raw === undefined) return undefined;
    try {
      const parsed = seatCredentialsSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : undefined;
    } catch {
      return undefined; // not JSON
    }
  }

  saveSeat(roomId: string, seat: StoredSeat) {
    write(seatKey(roomId), JSON.stringify(seat));
  }

  inviteUrl(roomId: string): string | undefined {
    return read(inviteKey(roomId));
  }

  saveInviteUrl(roomId: string, url: string) {
    write(inviteKey(roomId), url);
  }

  /**
   * Keeps an invite token while the player logs in before joining. Session storage (this tab
   * only, gone when it closes), never the login URL: query strings reach the server.
   */
  stashInviteToken(roomId: string, token: string) {
    try {
      sessionStorage.setItem(pendingTokenKey(roomId), token);
    } catch {
      // storage blocked: after logging in the player opens the invite link again
    }
  }

  /** The stashed invite token, removed as it is read. */
  takeInviteToken(roomId: string): string | undefined {
    try {
      const token = sessionStorage.getItem(pendingTokenKey(roomId)) ?? undefined;
      sessionStorage.removeItem(pendingTokenKey(roomId));
      return token;
    } catch {
      return undefined; // storage blocked: nothing was kept
    }
  }

  forget(roomId: string) {
    remove(seatKey(roomId));
    remove(inviteKey(roomId));
  }
}

function read(key: string): string | undefined {
  try {
    return localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined; // storage blocked (private mode, site data off): nothing stored here
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // not remembered in this browser
  }
}

function remove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // nothing to remove
  }
}
