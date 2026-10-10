import { Injector, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { RuntimeConfigService } from './runtime-config.service';

/**
 * Startup: load the public config (Supabase URL/key), then restore a saved host session.
 * AuthService can only be created once the config is loaded, so it is resolved from the
 * injector after the await (inject() itself only works before the first await).
 */
export async function initializeApp(): Promise<void> {
  const injector = inject(Injector);
  await injector.get(RuntimeConfigService).load();
  await injector.get(AuthService).ready;
}
