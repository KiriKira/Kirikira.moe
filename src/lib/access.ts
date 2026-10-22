import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

/**
 * Admin auth = Cloudflare Access (Zero Trust). Access sits in front of /admin/* and
 * /api/admin/* and forwards a signed JWT; we verify it here too, so a misconfigured
 * Access policy (or a request to the bare workers.dev hostname) can't reach admin.
 */
let jwks: { team: string; get: JWTVerifyGetKey } | null = null;

export interface AccessEnv {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
}

export async function adminIdentity(request: Request, env: AccessEnv, dev = import.meta.env.DEV): Promise<string | null> {
  const team = env.ACCESS_TEAM_DOMAIN?.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  const aud = env.ACCESS_AUD?.trim();
  if (!team || !aud) return dev ? 'dev@localhost' : null;

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
