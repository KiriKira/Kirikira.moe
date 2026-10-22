import type { APIRoute } from 'astro';
import { env, commentSecret } from '../../../lib/env';
import { clientIp, json } from '../../../lib/http';
import { submitComment, toPublic } from '../../../lib/comments/service';
import { listPublished } from '../../../lib/comments/store';
import { getThreads } from '../../../lib/comments/threads';

export const prerender = false;

/** GET /api/comments?post=<cid> — public comments of one thread. */
export const GET: APIRoute = async ({ url }) => {
  const post = url.searchParams.get('post');
  if (!post) return json({ error: 'missing post' }, { status: 400 });
  const rows = await listPublished(env.DB, post);
  return json(
    { comments: rows.map(toPublic) },
    // Short shared cache; a new comment shows up for its author immediately via localStorage anyway.
    { headers: { 'cache-control': 'public, max-age=15' } },
  );
};

/** POST /api/comments — submit. Spam gets the same 200 response as everything else. */
export const POST: APIRoute = async ({ request, url }) => {
  if (!request.headers.get('content-type')?.includes('application/json')) {
    // Plain form posts come from bots that never ran our script; pretend all is well.
    return json({ ok: true });
  }
  let raw: Record<string, unknown>;
  try {
    raw = (await request.json()) as Record<string, unknown>;
    if (!raw || typeof raw !== 'object') throw new Error();
  } catch {
    return json({ error: 'bad json' }, { status: 400 });
  }

  const result = await submitComment(raw, {
    db: env.DB,
    secret: commentSecret(),
    ip: clientIp(request),
    userAgent: request.headers.get('user-agent'),
    threadExists: async (id) => id in (await getThreads(env, url)),
  });

  if (result.status === 400) return json({ errors: result.errors }, { status: 400 });
  if (result.status === 404) return json({ error: 'post not found' }, { status: 404 });
  return json({ ok: true, comment: result.comment });
};
