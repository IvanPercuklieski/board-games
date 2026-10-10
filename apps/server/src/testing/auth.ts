import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createAccessTokenVerifier } from '../auth/access-token';

export const TEST_SUPABASE_URL = 'https://abc.supabase.co';

/** A verifier backed by a local test key pair, plus a way to mint valid access tokens. */
export async function createTestAuth() {
  const issuer = `${TEST_SUPABASE_URL}/auth/v1`;
  const { publicKey, privateKey } = await generateKeyPair('ES256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'ES256' };
  const verifier = createAccessTokenVerifier({
    issuer,
    keys: createLocalJWKSet({ keys: [jwk] }),
  });
  const tokenFor = (userId: string) =>
    new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);
  return { verifier, tokenFor };
}
