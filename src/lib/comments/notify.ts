/**
 * "Someone replied to your comment" emails.
 *
 * Sent only when all of these hold:
 *  - the reply is published (spam never notifies; restoring one from the admin does,
 *    if it is under MAX_REPLY_AGE_DAYS old);
 *  - the comment replied to is published, has an email, and its author left
 *    "email me about replies" ticked;
 *  - the address hasn't unsubscribed (one click, link in every email);
 *  - it isn't someone replying to themselves (same email, or same name from the same IP);
 *  - this reply hasn't notified before, the recipient got fewer than PER_RECIPIENT_PER_DAY
 *    emails today, and the site sent fewer than the daily limit (Resend free: 100/day).
 *
 * The email shows the reply as plain text (no clickable links from strangers) and links
 * only to the comment on this site. Addresses are never logged, only their HMAC.
 */
import { hmacHex } from './hash';
import type { Mailer } from './mail';
import * as store from './store';
import type { CommentRow } from './types';

export const PER_RECIPIENT_PER_DAY = 5;
export const DEFAULT_DAILY_LIMIT = 90;
/** A reply restored from spam later than this notifies nobody (old/imported comments). */
export const MAX_REPLY_AGE_DAYS = 7;

export interface NotifyContext {
  db: D1Database;
  secret: string;
  mailer: Mailer | null;
  /** https://kirikira.moe — links in the email point here. */
  origin: string;
  thread: (postId: string) => Promise<{ url: string; title: string } | undefined>;
  dailyLimit?: number;
  siteName?: string;
  now?: number;
}

export type NotifyOutcome =
  | 'sent'
  | 'failed'
  | 'off'
  | 'not-a-reply'
  | 'reply-not-published'
  | 'stale'
  | 'parent-unavailable'
  | 'no-email'
  | 'opted-out'
  | 'self-reply'
  | 'already-sent'
  | 'recipient-limit'
  | 'daily-limit';

const normEmail = (e: string) => e.trim().toLowerCase();

export const emailHash = (secret: string, email: string) => hmacHex(`${secret}:email`, normEmail(email));

/** Token for the unsubscribe link, bound to one comment (whose email gets unsubscribed). */
export async function unsubscribeToken(secret: string, commentId: number): Promise<string> {
  return (await hmacHex(`${secret}:unsubscribe`, String(commentId))).slice(0, 32);
}

export async function verifyUnsubscribe(secret: string, commentId: number, token: string): Promise<boolean> {
  if (!Number.isSafeInteger(commentId) || commentId <= 0 || !/^[0-9a-f]{32}$/.test(token)) return false;
  const expected = await unsubscribeToken(secret, commentId);
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const excerpt = (s: string, max: number) => {
  const t = s.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
};

export function composeReplyEmail(p: {
  siteName: string;
  postTitle: string;
  parent: Pick<CommentRow, 'name' | 'body'>;
  reply: Pick<CommentRow, 'name' | 'body'>;
  link: string;
  unsubscribe: string;
}): { subject: string; text: string; html: string } {
  const subject = `${p.reply.name} 回复了你在《${p.postTitle}》下的评论`;
  const yours = excerpt(p.parent.body, 300);
  const theirs = excerpt(p.reply.body, 1500);
  const text = [
    `${p.parent.name}，你好：`,
    '',
    `${p.reply.name} 回复了你在《${p.postTitle}》下的评论。`,
    '',
    '你的评论：',
    ...yours.split('\n').map((l) => `> ${l}`),
    '',
    `${p.reply.name} 的回复：`,
    theirs,
    '',
    `查看并回复：${p.link}`,
    '',
    `—— ${p.siteName}（这封邮件由系统自动发送，直接回复对方收不到）`,
    `不想再收到回复通知：${p.unsubscribe}`,
  ].join('\n');

  const block = (s: string) => escapeHtml(s).replace(/\n/g, '<br>');
  const html = `<!doctype html><html lang="zh-CN"><body style="margin:0;padding:24px;background:#f5f5f5;font:15px/1.7 -apple-system,'PingFang SC','Microsoft YaHei',sans-serif;color:#333">
<div style="max-width:560px;margin:0 auto;background:#fff;padding:24px 28px;border-radius:4px">
<p style="margin:0 0 12px">${escapeHtml(p.parent.name)}，你好：</p>
<p style="margin:0 0 16px"><b>${escapeHtml(p.reply.name)}</b> 回复了你在《${escapeHtml(p.postTitle)}》下的评论。</p>
<div style="margin:0 0 16px;padding:8px 12px;border-left:3px solid #ddd;color:#888">${block(yours)}</div>
<div style="margin:0 0 20px;padding:12px 14px;background:#f7f7f7;border-radius:4px">${block(theirs)}</div>
<p style="margin:0 0 24px"><a href="${escapeHtml(p.link)}" style="display:inline-block;padding:8px 18px;background:#26a69a;color:#fff;text-decoration:none;border-radius:2px">查看并回复</a></p>
<p style="margin:0;font-size:12px;color:#999">—— ${escapeHtml(p.siteName)}。这封邮件由系统自动发送，直接回复对方收不到。<br><a href="${escapeHtml(p.unsubscribe)}" style="color:#999">不想再收到回复通知</a></p>
</div></body></html>`;
  return { subject, text, html };
}

/** Never throws: a failed email must not affect the comment itself. */
export async function notifyReply(ctx: NotifyContext, reply: CommentRow): Promise<NotifyOutcome> {
  try {
    return await notify(ctx, reply);
  } catch (err) {
    console.error('reply notification failed', err);
    return 'failed';
  }
}

async function notify(ctx: NotifyContext, reply: CommentRow): Promise<NotifyOutcome> {
  if (!ctx.mailer) return 'off';
  if (reply.parent_id === null) return 'not-a-reply';
  if (reply.status !== 'published') return 'reply-not-published';
  const now = ctx.now ?? Date.now();
  if (now - Date.parse(reply.created_at) > MAX_REPLY_AGE_DAYS * 86_400_000) return 'stale';
  const parent = await store.getComment(ctx.db, reply.parent_id);
  if (!parent || parent.status !== 'published') return 'parent-unavailable';
  const to = parent.email?.trim() ?? '';
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || parent.notify === 0) return 'no-email';
  if (reply.email && normEmail(reply.email) === normEmail(to)) return 'self-reply';
  if (reply.ip_hash && reply.ip_hash === parent.ip_hash && reply.name.trim() === parent.name.trim()) return 'self-reply';

  const toHash = await emailHash(ctx.secret, to);
  if (await store.isOptedOut(ctx.db, toHash)) return 'opted-out';
  if (await store.wasNotified(ctx.db, reply.id)) return 'already-sent';
  const sent = await store.sentLastDay(ctx.db, toHash, now);
  if (sent.toRecipient >= PER_RECIPIENT_PER_DAY) return 'recipient-limit';
  if (sent.total >= (ctx.dailyLimit ?? DEFAULT_DAILY_LIMIT)) return 'daily-limit';

  const thread = await ctx.thread(reply.post_id);
  const link = new URL(`${thread?.url ?? '/'}#comment-${reply.id}`, ctx.origin).href;
  const unsubscribe = new URL(
    `/api/comments/unsubscribe?c=${parent.id}&t=${await unsubscribeToken(ctx.secret, parent.id)}`,
    ctx.origin,
  ).href;
  const mail = composeReplyEmail({
    siteName: ctx.siteName ?? new URL(ctx.origin).hostname,
    postTitle: thread?.title ?? '文章',
    parent,
    reply,
    link,
    unsubscribe,
  });

  try {
    await ctx.mailer.send({
      to,
      ...mail,
      headers: {
        'List-Unsubscribe': `<${unsubscribe}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        'Auto-Submitted': 'auto-generated',
      },
      idempotencyKey: `reply-${reply.id}`,
    });
  } catch (err) {
    await store.logNotification(ctx.db, { commentId: reply.id, toHash, status: 'failed', error: String(err) }, new Date(now).toISOString());
    console.error('reply notification failed', err);
    return 'failed';
  }
  await store.logNotification(ctx.db, { commentId: reply.id, toHash, status: 'sent' }, new Date(now).toISOString());
  return 'sent';
}
