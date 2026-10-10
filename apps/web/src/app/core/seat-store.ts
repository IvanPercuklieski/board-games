import { Injectable } from '@angular/core';
import { seatCredentialsSchema, type SeatCredentials } from '@board-table/shared';

export type StoredSeat = SeatCredentials;

const seatKey = (roomId: string) => `bt-seat:${roomId}`;
const inviteKey = (roomId: string) => `bt-invite:${roomId}`;

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

  forget(roomId: string) {
    remove(seatKey(roomId));
    remove(inviteKey(roomId));
  }
}

function read(key: string): string | undefined {
  try {
    return localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
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
