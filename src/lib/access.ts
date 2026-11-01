import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

/**
 * Admin lives under one prefix, /admine (the old Django admin path): the CMS at /admine/,
 * comments at /admine/comments, rules at /admine/rules, their form API at /admine/api/*.
 * src/worker.ts checks every request under it with adminGate() before Astro or the static
 * assets see it, and answers the ordinary 404 page to anyone else, so crawlers can't tell
 * an admin exists.
 *
 * Who counts as admin:
 *  - Cloudflare Access (production): Access sits in front of /admine* and forwards a signed
 *    JWT, which we verify too, so a misconfigured policy or the bare workers.dev hostname
 *    can't get in.
 *  - ADMIN_TOKEN (preview): a *.workers.dev hostname can't sit behind Access, so when Access
 *    isn't configured, visiting /admine/?token=<ADMIN_TOKEN> once sets a cookie. Production
 *    never sets ADMIN_TOKEN, so that path stays dead there.
 *  - `astro dev`: everyone.
 */
export const ADMIN_PREFIX = '/admine';
export const ADMIN_COOKIE = 'kirikira_admin';

let jwks: { team: string; get: JWTVerifyGetKey } | null = null;

export interface AccessEnv {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ADMIN_TOKEN?: string;
}

export const isAdminPath = (pathname: string) => pathname === ADMIN_PREFIX || pathname.startsWith(`${ADMIN_PREFIX}/`);

function readCookie(request: Request, name: string): string | null {
  const raw = request.headers.get('cookie');
  if (!raw) return null;
  for (const part of raw.split(/;\s*/)) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq) === name) return decodeURIComponent(part.slice(eq + 1));
  }
  return null;
}

/** Constant-time string comparison (both sides are short secrets). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function tokenIdentity(request: Request, env: AccessEnv): string | null {
  const expected = env.ADMIN_TOKEN?.trim();
  if (!expected) return null;
  const given = new URL(request.url).searchParams.get('token') ?? readCookie(request, ADMIN_COOKIE);
  return given && safeEqual(given, expected) ? 'token@preview' : null;
}

export async function adminIdentity(request: Request, env: AccessEnv, dev = import.meta.env.DEV): Promise<string | null> {
  const team = env.ACCESS_TEAM_DOMAIN?.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  const aud = env.ACCESS_AUD?.trim();
  if (!team || !aud) return dev ? 'dev@localhost' : tokenIdentity(request, env);

  const token = request.headers.get('cf-access-jwt-assertion') ?? readCookie(request, 'CF_Authorization');
  if (!token) return null;

  if (!jwks || jwks.team !== team) {
    jwks = { team, get: createRemoteJWKSet(new URL(`https://${team}/cdn-cgi/access/certs`)) };
  }
  try {
    const { payload } = await jwtVerify(token, jwks.get, { issuer: `https://${team}`, audience: aud });
    return typeof payload.email === 'string' ? payload.email : (payload.sub ?? 'unknown');
  } catch {
    return null;
  }
}

export type GateResult = { allow: true } | { allow: false; response: Response | null };

/**
 * Decide what happens to a request under /admine before it reaches the app:
 * allow it, redirect it (after turning ?token= into a cookie), or reject it
 * (response null = caller should answer its normal 404 page).
 */
export async function adminGate(request: Request, env: AccessEnv, dev = import.meta.env.DEV): Promise<GateResult> {
  const url = new URL(request.url);
  if (!isAdminPath(url.pathname)) return { allow: true };
  if (!(await adminIdentity(request, env, dev))) return { allow: false, response: null };

  const token = url.searchParams.get('token');
  if (token !== null) {
    // Logged in via ?token=: keep it in a cookie and drop it from the address bar/history.
    url.searchParams.delete('token');
    const headers = new Headers({ location: url.pathname + url.search });
    headers.append(
      'set-cookie',
      `${ADMIN_COOKIE}=${encodeURIComponent(token)}; Path=${ADMIN_PREFIX}; Max-Age=${60 * 60 * 24 * 30}; HttpOnly; Secure; SameSite=Lax`,
    );
    return { allow: false, response: new Response(null, { status: 303, headers }) };
  }
  return { allow: true };
}
