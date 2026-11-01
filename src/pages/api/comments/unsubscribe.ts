import type { APIRoute } from 'astro';
import { env, commentSecret } from '../../../lib/env';
import { emailHash, verifyUnsubscribe } from '../../../lib/comments/notify';
import * as store from '../../../lib/comments/store';

export const prerender = false;

/**
 * Unsubscribe link from reply notification emails: /api/comments/unsubscribe?c=<comment id>&t=<hmac>.
 * GET only shows a confirm button (mail scanners prefetch links); POST unsubscribes. Mail
 * clients' one-click unsubscribe (RFC 8058, List-Unsubscribe-Post) POSTs to the same URL.
 * The opt-out covers the address, i.e. every comment written with it.
 */
const page = (title: string, body: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${title} · Kiri 的博客</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.7 -apple-system,'PingFang SC','Microsoft YaHei',sans-serif;background:#f5f5f5;color:#333}
main{background:#fff;padding:32px 36px;max-width:420px;margin:16px;border-radius:4px;box-shadow:0 2px 5px rgba(0,0,0,.16)}
h1{font-size:20px;margin:0 0 12px}button{font:inherit;padding:8px 20px;border:0;border-radius:2px;background:#26a69a;color:#fff;cursor:pointer}
a{color:#26a69a}@media (prefers-color-scheme:dark){body{background:#1a1a1a;color:#ddd}main{background:#262626}}</style></head>
<body><main><h1>${title}</h1>${body}</main></body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } },
  );

async function check(url: URL) {
  const id = Number(url.searchParams.get('c'));
  const token = url.searchParams.get('t') ?? '';
  if (!(await verifyUnsubscribe(commentSecret(), id, token))) return null;
  return store.getComment(env.DB, id);
}

const invalid = () => page('链接无效', '<p>这个退订链接无效或已失效。</p><p><a href="/">返回首页</a></p>', 400);

export const GET: APIRoute = async ({ url }) => {
  const comment = await check(url);
  if (!comment) return invalid();
  return page(
    '退订回复通知',
    `<p>以后有人回复你在本站的评论时，不再发邮件通知你。</p>
<form method="post"><button type="submit">确认退订</button></form>`,
  );
};

export const POST: APIRoute = async ({ url }) => {
  const comment = await check(url);
  if (!comment) return invalid();
  if (comment.email?.trim()) await store.optOut(env.DB, await emailHash(commentSecret(), comment.email));
  return page('已退订', '<p>不会再给你发送回复通知了。</p><p><a href="/">返回首页</a></p>');
};
