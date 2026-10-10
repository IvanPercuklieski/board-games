import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from 'jose';

/** The request has no valid login. Maps to HTTP 401. */
export class AuthError extends Error {}

export interface AccessTokenVerifier {
  /** Resolves with the Supabase user id, or rejects with AuthError. */
  verify(token: string): Promise<{ userId: string }>;
}

const MAX_TOKEN_LENGTH = 4096;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Asymmetric algorithms only: the server never holds a shared JWT secret. */
const ALGORITHMS = ['ES256', 'RS256', 'EdDSA'];

export function supabaseJwksUrl(supabaseUrl: string): URL {
  return new URL('/auth/v1/.well-known/jwks.json', supabaseUrl);
}

/**
 * Verifies Supabase access tokens locally against public signing keys (no per-request call
 * to Supabase). Only logged-in users (`role: authenticated`) are accepted.
 */
export function createAccessTokenVerifier({
  issuer,
  keys,
}: {
  issuer: string;
  keys: JWTVerifyGetKey;
}): AccessTokenVerifier {
  return {
    async verify(token) {
      if (token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
        throw new AuthError('Invalid access token');
      }
      let payload;
      try {
        ({ payload } = await jwtVerify(token, keys, {
          issuer,
          audience: 'authenticated',
          algorithms: ALGORITHMS,
        }));
      } catch (e) {
        // Key-fetch problems are server-side failures, not a bad token.
        if (e instanceof errors.JWKSTimeout || !(e instanceof errors.JOSEError)) throw e;
        throw new AuthError('Invalid access token');
      }
      if (payload['role'] !== 'authenticated' || !payload.sub || !UUID.test(payload.sub)) {
        throw new AuthError('Invalid access token');
      }
      return { userId: payload.sub };
    },
  };
}

/** Verifier for a Supabase project; signing keys are fetched and cached by jose. */
export function createSupabaseAccessTokenVerifier(supabaseUrl: string): AccessTokenVerifier {
  const origin = new URL(supabaseUrl).origin;
  return createAccessTokenVerifier({
    issuer: `${origin}/auth/v1`,
    keys: createRemoteJWKSet(supabaseJwksUrl(origin)),
  });
}

/** Extracts the token from an `Authorization: Bearer <token>` header. */
export function bearerToken(header: string | undefined): string | undefined {
  return /^Bearer (\S+)$/i.exec(header ?? '')?.[1];
}
