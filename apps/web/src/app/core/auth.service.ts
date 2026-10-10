import { DestroyRef, Injectable, InjectionToken, computed, inject, signal } from '@angular/core';
import {
  AuthClient,
  isAuthRetryableFetchError,
  type GoTrueClient,
  type Session,
} from '@supabase/auth-js';
import { RuntimeConfigService } from './runtime-config.service';

/** The parts of the Supabase auth client we use (a fake is injected in tests). */
export type SupabaseAuth = Pick<
  GoTrueClient,
  'getSession' | 'onAuthStateChange' | 'signInWithPassword' | 'signOut'
>;

/** Only the auth client is needed (no database/realtime/storage clients in the browser). */
export const SUPABASE_AUTH = new InjectionToken<SupabaseAuth>('SUPABASE_AUTH', {
  providedIn: 'root',
  factory: () => {
    const { supabaseUrl, supabaseAnonKey } = inject(RuntimeConfigService).config;
    return new AuthClient({
      url: `${supabaseUrl}/auth/v1`,
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` },
      storageKey: 'bt-auth',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    });
  },
});

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

export type SignInResult = 'ok' | 'invalid_credentials' | 'network' | 'error';

/** Host login state as signals. Guests never log in; they use invite links. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(SUPABASE_AUTH);
  private readonly session = signal<Session | null>(null);

  readonly isSignedIn = computed(() => this.session() !== null);
  readonly user = computed<AuthUser | null>(() => {
    const user = this.session()?.user;
    if (!user) return null;
    const email = user.email ?? '';
    const metaName = user.user_metadata?.['display_name'];
    return {
      id: user.id,
      email,
      displayName: typeof metaName === 'string' && metaName ? metaName : email.split('@')[0]!,
    };
  });

  /** Resolves once the stored session (if any) has been restored. */
  readonly ready: Promise<void>;

  constructor() {
    const { data } = this.auth.onAuthStateChange((_event, session) => this.session.set(session));
    inject(DestroyRef).onDestroy(() => data.subscription.unsubscribe());
    this.ready = this.auth.getSession().then(({ data: { session } }) => this.session.set(session));
  }

  async signIn(email: string, password: string): Promise<SignInResult> {
    const { data, error } = await this.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.code === 'invalid_credentials') return 'invalid_credentials';
      return isAuthRetryableFetchError(error) ? 'network' : 'error';
    }
    this.session.set(data.session);
    return 'ok';
  }

  /**
   * Ends the session everywhere; if the server can't be reached, at least on this device
   * (Supabase keeps the stored session when the global sign-out fails).
   */
  async signOut(): Promise<void> {
    const { error } = await this.auth.signOut();
    if (error) await this.auth.signOut({ scope: 'local' });
    this.session.set(null);
  }

  /** A current (auto-refreshed) access token for API calls, or null when signed out. */
  async accessToken(): Promise<string | null> {
    const { data } = await this.auth.getSession();
    return data.session?.access_token ?? null;
  }
}
