import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { AuthError, createAccessTokenVerifier, type AccessTokenVerifier } from './access-token';

const SUPABASE_URL = 'https://abc.supabase.co';
const ISSUER = `${SUPABASE_URL}/auth/v1`;
const USER_ID = '11111111-1111-1111-1111-111111111111';

type PrivateKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

let privateKey: PrivateKey;
let otherPrivateKey: PrivateKey;
let verifier: AccessTokenVerifier;

beforeAll(async () => {
  const pair = await generateKeyPair('ES256');
  const other = await generateKeyPair('ES256');
  privateKey = pair.privateKey;
  otherPrivateKey = other.privateKey;
  const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: 'test-key', alg: 'ES256' };
  verifier = createAccessTokenVerifier({
    issuer: ISSUER,
    keys: createLocalJWKSet({ keys: [jwk] }),
  });
});

interface TokenOptions {
  sub?: string | null;
  role?: string;
  aud?: string;
  iss?: string;
  expiresIn?: string;
  key?: PrivateKey;
}

function sign(opts: TokenOptions = {}) {
  const jwt = new SignJWT({ role: opts.role ?? 'authenticated' })
    .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
    .setIssuer(opts.iss ?? ISSUER)
    .setAudience(opts.aud ?? 'authenticated')
    .setIssuedAt()
    .setExpirationTime(opts.expiresIn ?? '1h');
  if (opts.sub !== null) jwt.setSubject(opts.sub ?? USER_ID);
  return jwt.sign(opts.key ?? privateKey);
}

const b64url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

describe('access token verifier', () => {
  it('returns the user id of a valid Supabase access token', async () => {
    await expect(verifier.verify(await sign())).resolves.toEqual({ userId: USER_ID });
  });

  it.each<[string, TokenOptions]>([
    ['an expired token', { expiresIn: '-1m' }],
    ['a token from another issuer', { iss: 'https://evil.supabase.co/auth/v1' }],
    ['a token for another audience', { aud: 'something-else' }],
    ['an anonymous-role token', { role: 'anon' }],
    ['a service-role token', { role: 'service_role' }],
    ['a token without a subject', { sub: null }],
    ['a token whose subject is not a uuid', { sub: 'admin' }],
  ])('rejects %s', async (_case, opts) => {
    await expect(verifier.verify(await sign(opts))).rejects.toThrow(AuthError);
  });

  it('rejects a token signed with an unknown key', async () => {
    await expect(verifier.verify(await sign({ key: otherPrivateKey }))).rejects.toThrow(AuthError);
  });

  it('rejects an unsigned token (alg none)', async () => {
    const payload = { sub: USER_ID, role: 'authenticated', aud: 'authenticated', iss: ISSUER };
    const unsigned = `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(payload)}.`;
    await expect(verifier.verify(unsigned)).rejects.toThrow(AuthError);
  });

  it('rejects a symmetric (HS256) token even with valid-looking claims', async () => {
    const hs = await new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(USER_ID)
      .setIssuer(ISSUER)
      .setAudience('authenticated')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('guessable-shared-secret-guessable-shared'));
    await expect(verifier.verify(hs)).rejects.toThrow(AuthError);
  });

  it.each(['', 'not-a-jwt', 'a.b.c', 'x'.repeat(10_000)])('rejects garbage %#', async (token) => {
    await expect(verifier.verify(token)).rejects.toThrow(AuthError);
  });
});

describe('bearerToken', () => {
  it('extracts the token from an Authorization header', async () => {
    const { bearerToken } = await import('./access-token');
    expect(bearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    expect(bearerToken('bearer abc.def.ghi')).toBe('abc.def.ghi');
  });

  it.each([undefined, '', 'Basic abc', 'Bearer', 'Bearer ', 'Bearer a b'])(
    'returns undefined for %j',
    async (header) => {
      const { bearerToken } = await import('./access-token');
      expect(bearerToken(header)).toBeUndefined();
    },
  );
});
