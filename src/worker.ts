import { handle } from '@astrojs/cloudflare/handler';
import { adminGate, isAdminPath } from './lib/access';
import { purgeOldSpam } from './lib/comments/store';

/** The site's ordinary 404 page, so a locked admin URL looks like any missing page. */
async function notFound(request: Request, env: Env): Promise<Response> {
  const page = await env.ASSETS.fetch(new URL('/404.html', request.url));
  return new Response(page.body, { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

export default {
  async fetch(request, env, ctx) {
    if (!isAdminPath(new URL(request.url).pathname)) return handle(request, env, ctx);

    // Everything under /admine (CMS, comment admin, its API) shares this one check.
    const gate = await adminGate(request, env);
    if (!gate.allow) return gate.response ?? notFound(request, env);

    const res = await handle(request, env, ctx);
    const out = new Response(res.body, res);
    out.headers.set('x-robots-tag', 'noindex, nofollow');
    out.headers.set('cache-control', 'no-store');
    return out;
  },

  async scheduled(_controller, env, ctx) {
    const days = Number(env.SPAM_RETENTION_DAYS) || 30;
    ctx.waitUntil(purgeOldSpam(env.DB, days));
  },
} satisfies ExportedHandler<Env>;
