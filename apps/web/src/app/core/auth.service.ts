import { DestroyRef, Injectable, InjectionToken, computed, inject, signal } from '@angular/core';
import { AuthClient, type GoTrueClient, type Session } from '@supabase/auth-js';
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

export type SignInResult = 'ok' | 'invalid_credentials' | 'error';

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
    if (error) return error.code === 'invalid_credentials' ? 'invalid_credentials' : 'error';
    this.session.set(data.session);
    return 'ok';
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
    this.session.set(null);
  }

  /** A current (auto-refreshed) access token for API calls, or null when signed out. */
  async accessToken(): Promise<string | null> {
    const { data } = await this.auth.getSession();
    return data.session?.access_token ?? null;
  }
}
