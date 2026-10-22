import type { APIRoute } from 'astro';
import { commentThreadId, getPosts, postUrl } from '../lib/posts';

/**
 * Prerendered index of comment threads ({ cid: { url, title } }). The comment API
 * reads it through the ASSETS binding to reject comments for posts that don't
 * exist and to show post titles in the admin page.
 */
export const GET: APIRoute = async () => {
  const threads: Record<string, { url: string; title: string }> = {};
  for (const post of await getPosts()) {
    threads[commentThreadId(post)] = { url: postUrl(post), title: post.data.title };
  }
  return new Response(JSON.stringify(threads), { headers: { 'content-type': 'application/json; charset=utf-8' } });
};
