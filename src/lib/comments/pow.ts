import { createChallenge, randomInt, verifySolution } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/web/pbkdf2';
import type { Challenge, Solution } from 'altcha-lib/types';
import type { PowStatus } from './spam';

/**
 * Invisible, self-hosted proof of work (ALTCHA v2 algorithm, no third-party calls).
 * The browser spends roughly half a second of CPU per comment, which is nothing for
 * a person but makes bulk spamming expensive. The signed challenge also carries the
 * post id and issue time, so it doubles as the anti-CSRF / time-trap form token.
 */
export const POW = {
  algorithm: 'PBKDF2/SHA-256',
  cost: 1_000,
  counterMin: 1_000,
  counterMax: 3_000,
  ttlSeconds: 6 * 60 * 60,
} as const;

export interface PowPayload {
  challenge: Challenge;
  solution: Solution;
}

export interface PowCheck {
  status: PowStatus;
  /** Unique per challenge; stored to block replays. */
  nonce: string | null;
  /** ms since the challenge was issued, when the challenge is authentic. */
  elapsedMs: number | null;
}

const keySecret = (secret: string) => `${secret}:altcha-key`;

export async function issueChallenge(secret: string, postId: string, now = Date.now()): Promise<Challenge> {
  return createChallenge({
    algorithm: POW.algorithm,
    cost: POW.cost,
    counter: randomInt(POW.counterMin, POW.counterMax),
    deriveKey,
    hmacSignatureSecret: secret,
    hmacKeySignatureSecret: keySecret(secret),
    expiresAt: Math.floor(now / 1000) + POW.ttlSeconds,
    data: { post: postId, iat: now },
  });
}

function isPayload(v: unknown): v is PowPayload {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  const c = p.challenge as Record<string, unknown> | undefined;
  return !!c && typeof c === 'object' && !!c.parameters && typeof c.parameters === 'object' && !!p.solution;
}

export async function checkPow(payload: unknown, secret: string, postId: string, now = Date.now()): Promise<PowCheck> {
  if (!isPayload(payload)) return { status: 'missing', nonce: null, elapsedMs: null };
  let result;
  try {
    result = await verifySolution({
      challenge: payload.challenge,
      solution: payload.solution,
      deriveKey,
      hmacSignatureSecret: secret,
      hmacKeySignatureSecret: keySecret(secret),
    });
  } catch {
    return { status: 'invalid', nonce: null, elapsedMs: null };
  }
  if (result.expired) return { status: 'expired', nonce: null, elapsedMs: null };
  if (!result.verified) return { status: 'invalid', nonce: null, elapsedMs: null };

  // From here on the parameters are authenticated by the HMAC signature.
  const { data, nonce } = payload.challenge.parameters;
  const iat = typeof data?.iat === 'number' ? data.iat : null;
  const elapsedMs = iat === null ? null : now - iat;
  if (data?.post !== postId) return { status: 'wrong-post', nonce, elapsedMs };
  return { status: 'ok', nonce, elapsedMs };
}
