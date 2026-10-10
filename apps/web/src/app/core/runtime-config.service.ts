import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { publicConfigSchema, type PublicConfig } from '@board-table/shared';
import { firstValueFrom } from 'rxjs';

/**
 * Public settings served by our server at GET /api/config (Supabase URL + publishable key),
 * so the same build works for dev and prod. Loaded once at startup.
 */
@Injectable({ providedIn: 'root' })
export class RuntimeConfigService {
  private readonly http = inject(HttpClient);
  private loaded: PublicConfig | undefined;

  async load(): Promise<void> {
    const raw = await firstValueFrom(this.http.get<unknown>('/api/config'));
    const parsed = publicConfigSchema.safeParse(raw);
    if (!parsed.success) throw new Error('Invalid runtime config from /api/config');
    this.loaded = parsed.data;
  }

  get config(): PublicConfig {
    if (!this.loaded) throw new Error('Runtime config not loaded yet');
    return this.loaded;
  }
}
