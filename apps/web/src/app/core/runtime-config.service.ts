import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { publicConfigSchema, type PublicConfig } from '@board-table/shared';
import { firstValueFrom } from 'rxjs';

/** Waits between attempts to load the config. */
const RETRY_DELAYS_MS = [1_000, 2_000];

/**
 * Public settings served by our server at GET /api/config (Supabase URL + publishable key),
 * so the same build works for dev and prod. Loaded once at startup.
 */
@Injectable({ providedIn: 'root' })
export class RuntimeConfigService {
  private readonly http = inject(HttpClient);
  private loaded: PublicConfig | undefined;

  /** Tries up to 3 times (the free server may be waking up); an invalid config fails at once. */
  async load(): Promise<void> {
    const raw = await this.fetchWithRetry();
    const parsed = publicConfigSchema.safeParse(raw);
    if (!parsed.success) throw new Error('Invalid runtime config from /api/config');
    this.loaded = parsed.data;
  }

  private async fetchWithRetry(): Promise<unknown> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await firstValueFrom(this.http.get<unknown>('/api/config'));
      } catch (e) {
        if (attempt >= RETRY_DELAYS_MS.length + 1) throw e; // startup shows "couldn't start"
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt - 1]));
      }
    }
  }

  get config(): PublicConfig {
    if (!this.loaded) throw new Error('Runtime config not loaded yet');
    return this.loaded;
  }
}
