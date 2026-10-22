import { env } from 'cloudflare:workers';

/** COMMENT_SECRET, refusing to run with a missing or toy value in production. */
export function commentSecret(): string {
  const secret = env.COMMENT_SECRET;
  if (!secret || (!import.meta.env.DEV && secret.length < 32)) {
    throw new Error('COMMENT_SECRET is not set (wrangler secret put COMMENT_SECRET).');
  }
  return secret;
}

export { env };
