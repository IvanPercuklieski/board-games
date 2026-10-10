import { TestBed } from '@angular/core/testing';
import { AuthService, SUPABASE_AUTH, type SupabaseAuth } from './auth.service';

type Listener = (event: string, session: FakeSession | null) => void;
interface FakeSession {
  access_token: string;
  user: { id: string; email: string; user_metadata: Record<string, unknown> };
}

const session = (email = 'ivan@example.com', token = 'token-1'): FakeSession => ({
  access_token: token,
  user: { id: 'u1', email, user_metadata: { display_name: 'Ivan' } },
});

function fakeAuth(initial: FakeSession | null = null) {
  let current = initial;
  let listener: Listener | undefined;
  const unsubscribe = vi.fn();
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: current }, error: null })),
    onAuthStateChange: vi.fn((cb: Listener) => {
      listener = cb;
      return { data: { subscription: { unsubscribe } } };
    }),
    signInWithPassword: vi.fn(async ({ email, password }: { email: string; password: string }) => {
      if (password !== 'right') {
        return { data: { session: null }, error: { code: 'invalid_credentials', status: 400 } };
      }
      current = session(email);
      listener?.('SIGNED_IN', current);
      return { data: { session: current }, error: null };
    }),
    signOut: vi.fn(async () => {
      current = null;
      listener?.('SIGNED_OUT', null);
      return { error: null };
    }),
  };
  return { auth: auth as unknown as SupabaseAuth, mocks: auth, unsubscribe };
}

async function setup(initial: FakeSession | null = null) {
  const fake = fakeAuth(initial);
  TestBed.configureTestingModule({ providers: [{ provide: SUPABASE_AUTH, useValue: fake.auth }] });
  const service = TestBed.inject(AuthService);
  await service.ready;
  return { service, ...fake };
}

describe('AuthService', () => {
  it('starts signed out when there is no stored session', async () => {
    const { service } = await setup();
    expect(service.isSignedIn()).toBe(false);
    expect(service.user()).toBeNull();
  });

  it('restores a stored session', async () => {
    const { service } = await setup(session());
    expect(service.isSignedIn()).toBe(true);
    expect(service.user()).toEqual({ id: 'u1', email: 'ivan@example.com', displayName: 'Ivan' });
  });

  it('signs in with email and password', async () => {
    const { service } = await setup();
    await expect(service.signIn('ivan@example.com', 'right')).resolves.toBe('ok');
    expect(service.isSignedIn()).toBe(true);
  });

  it('reports wrong credentials without throwing', async () => {
    const { service } = await setup();
    await expect(service.signIn('ivan@example.com', 'wrong')).resolves.toBe('invalid_credentials');
    expect(service.isSignedIn()).toBe(false);
  });

  it('signs out', async () => {
    const { service } = await setup(session());
    await service.signOut();
    expect(service.isSignedIn()).toBe(false);
  });

  it('gives the current access token for API calls', async () => {
    const { service } = await setup(session('a@b.c', 'fresh-token'));
    await expect(service.accessToken()).resolves.toBe('fresh-token');
  });

  it('stops listening to auth changes when destroyed', async () => {
    const { unsubscribe } = await setup();
    TestBed.resetTestingModule();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
