import type { APIRoute } from 'astro';
import { env, commentSecret } from '../../../lib/env';
import { json } from '../../../lib/http';
import { issueChallenge } from '../../../lib/comments/pow';
import { getThreads } from '../../../lib/comments/threads';

export const prerender = false;

/** GET /api/comments/challenge?post=<cid> — a signed proof-of-work challenge bound to the post. */
export const GET: APIRoute = async ({ url }) => {
  const post = url.searchParams.get('post');
  if (!post || !(post in (await getThreads(env, url)))) return json({ error: 'post not found' }, { status: 404 });
  return json(await issueChallenge(commentSecret(), post));
};
