import { createHash, randomBytes } from 'node:crypto';

/** 16 random bytes, base64url (22 chars). Room IDs double as boardgame.io match IDs. */
export const newRoomId = () => randomBytes(16).toString('base64url');

/** 32 random bytes, base64url (43 chars). Invite tokens and seat credentials. */
export const newSecret = () => randomBytes(32).toString('base64url');

/** Secrets are only ever stored as SHA-256 hex digests. */
export const hashSecret = (secret: string) => createHash('sha256').update(secret).digest('hex');
