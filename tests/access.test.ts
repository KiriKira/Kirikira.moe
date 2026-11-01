import { describe, expect, it } from 'vitest';
import { adminGate, adminIdentity, isAdminPath } from '../src/lib/access';

const req = (path: string, cookie?: string) =>
  new Request(`https://kirikira-moe-preview.example.workers.dev${path}`, { headers: cookie ? { cookie } : {} });
const env = { ADMIN_TOKEN: 's3cret-token' };
// Production mode: `astro dev` (and vitest) would otherwise let everyone in.
const gate = (r: Request, e: object) => adminGate(r, e, false);

describe('admin gate (/admine)', () => {
  it('only guards the /admine prefix', () => {
    expect(isAdminPath('/admine')).toBe(true);
    expect(isAdminPath('/admine/comments')).toBe(true);
    expect(isAdminPath('/admine/api/comments')).toBe(true);
    expect(isAdminPath('/admin/')).toBe(false);
    expect(isAdminPath('/adminer')).toBe(false);
    expect(isAdminPath('/post/1/')).toBe(false);
  });

  it('rejects anonymous visitors (caller answers its 404 page)', async () => {
    expect(await gate(req('/admine/'), env)).toEqual({ allow: false, response: null });
    expect(await gate(req('/admine/', 'kirikira_admin=wrong'), env)).toEqual({ allow: false, response: null });
    expect(await gate(req('/admine/'), {})).toEqual({ allow: false, response: null }); // production without Access
  });

  it('turns ?token= into a cookie and strips it from the URL', async () => {
    const g = await gate(req('/admine/comments?status=spam&token=s3cret-token'), env);
    expect(g.allow).toBe(false);
    const res = (g as { response: Response }).response;
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/admine/comments?status=spam');
    expect(res.headers.get('set-cookie')).toMatch(/^kirikira_admin=s3cret-token; Path=\/admine; .*HttpOnly; Secure; SameSite=Lax/);
  });

  it('lets the cookie through for every admin page, the CMS included', async () => {
    for (const p of ['/admine/', '/admine/config.yml', '/admine/rules', '/admine/api/comments']) {
      expect(await gate(req(p, 'kirikira_admin=s3cret-token'), env)).toEqual({ allow: true });
    }
  });

  it('never accepts a token when Access is configured', async () => {
    const accessEnv = { ...env, ACCESS_TEAM_DOMAIN: 'kiri.cloudflareaccess.com', ACCESS_AUD: 'aud' };
    expect(await adminIdentity(req('/admine/?token=s3cret-token'), accessEnv, false)).toBeNull();
  });
});
