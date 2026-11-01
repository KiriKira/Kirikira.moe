import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

/**
 * Admin auth = Cloudflare Access (Zero Trust). Access sits in front of /admin/* and
 * /api/admin/* and forwards a signed JWT; we verify it here too, so a misconfigured
 * Access policy (or a request to the bare workers.dev hostname) can't reach admin.
 *
 * Preview escape hatch: a *.workers.dev hostname cannot sit behind Access, so when Access
 * isn't configured these pages also accept `ADMIN_TOKEN` (a Worker secret) via `?token=`
 * or the cookie it sets. Production never sets ADMIN_TOKEN, so the path stays dead there.
 */
let jwks: { team: string; get: JWTVerifyGetKey } | null = null;

export interface AccessEnv {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ADMIN_TOKEN?: string;
}

export const ADMIN_COOKIE = 'kirikira_admin';

function readCookie(request: Request, name: string): string | null {
  const raw = request.headers.get('cookie');
  if (!raw) return null;
  for (const part of raw.split(/;\s*/)) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq) === name) return decodeURIComponent(part.slice(eq + 1));
  }
  return null;
}

/** Shared-token identity, used where Access can't be installed (preview deployments). */
export function adminTokenIdentity(request: Request, env: AccessEnv): string | null {
  const expected = env.ADMIN_TOKEN?.trim();
  if (!expected) return null;
  const given = new URL(request.url).searchParams.get('token') ?? readCookie(request, ADMIN_COOKIE);
  return given && given === expected ? 'token@preview' : null;
}

/** Persist `?token=` into a cookie so in-page fetches to /api/admin/* stay authorised. */
export function rememberAdminToken(
  cookies: { set: (name: string, value: string, opts: Record<string, unknown>) => void },
  request: Request,
  env: AccessEnv,
): void {
  const token = new URL(request.url).searchParams.get('token');
  if (!token || !env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN.trim()) return;
  cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: true,
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function adminIdentity(request: Request, env: AccessEnv, dev = import.meta.env.DEV): Promise<string | null> {
  const team = env.ACCESS_TEAM_DOMAIN?.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  const aud = env.ACCESS_AUD?.trim();
  if (!team || !aud) return dev ? 'dev@localhost' : adminTokenIdentity(request, env);

  const token =
    request.headers.get('cf-access-jwt-assertion') ??
    request.headers
      .get('cookie')
      ?.split(/;\s*/)
      .find((c) => c.startsWith('CF_Authorization='))
      ?.slice('CF_Authorization='.length);
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
