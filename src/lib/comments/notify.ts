/**
 * Notification emails: "someone replied to your comment" (to readers) and "new comment"
 * (to the site owner, see notifyOwner at the end).
 *
 * Reply emails:
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
import { AI_KINDS } from './ai';
import { reasons } from './reasons';
import { hasHardReason } from './spam';
import * as store from './store';
import type { CommentRow } from './types';

export const PER_RECIPIENT_PER_DAY = 5;
export const DEFAULT_DAILY_LIMIT = 90;
/** A reply restored from spam later than this notifies nobody (old/imported comments). */
export const MAX_REPLY_AGE_DAYS = 7;
/** Owner notifications per 24h; the rest of the daily limit stays for readers' reply emails. */
export const DEFAULT_OWNER_DAILY_LIMIT = 30;

export interface NotifyContext {
  db: D1Database;
  secret: string;
  mailer: Mailer | null;
  /** https://kirikira.moe — links in the email point here. */
  origin: string;
  thread: (postId: string) => Promise<{ url: string; title: string } | undefined>;
  dailyLimit?: number;
  /** Site owner's address for "new comment" emails (secret ADMIN_EMAIL); unset = off. */
  ownerEmail?: string;
  ownerDailyLimit?: number;
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
  | 'daily-limit'
  | 'bot'
  | 'own-comment';

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

// ---------- "new comment" emails to the site owner ----------

export function composeOwnerEmail(p: {
  siteName: string;
  postTitle: string;
  comment: Pick<CommentRow, 'id' | 'parent_id' | 'name' | 'email' | 'url' | 'body' | 'status' | 'spam_score' | 'spam_reasons' | 'ai_spam' | 'ai_kind'>;
  link: string;
  admin: string;
}): { subject: string; text: string; html: string } {
  const c = p.comment;
  const spam = c.status === 'spam';
  const subject = `${spam ? '【已拦截】' : '【新评论】'}《${p.postTitle}》· ${c.name}`;
  const why = reasons(c.spam_reasons);
  const kind = c.ai_kind && c.ai_kind in AI_KINDS ? AI_KINDS[c.ai_kind as keyof typeof AI_KINDS] : c.ai_kind;
  const facts: [string, string][] = [
    ['状态', spam ? `判为垃圾，已隐藏（只有对方自己看得到）· 分数 ${c.spam_score}` : `已公开${c.spam_score > 0 ? ` · 分数 ${c.spam_score}` : ''}`],
    ...(why.length ? [['原因', why.join('；')] as [string, string]] : []),
    ...(c.ai_spam !== null ? [['AI', `不是真实读者的概率 ${Math.round(c.ai_spam * 100)}%${kind ? `（${kind}）` : ''}`] as [string, string]] : []),
    ['作者', c.name],
    ['邮箱', c.email || '（未填）'],
    ['网址', c.url || '（未填）'],
    ...(c.parent_id !== null ? [['回复', `#${c.parent_id}`] as [string, string]] : []),
  ];
  const text = [
    `《${p.postTitle}》收到一条评论（#${c.id}）：`,
    '',
    ...facts.map(([k, v]) => `${k}：${v}`),
    '',
    excerpt(c.body, 3000),
    '',
    ...(spam ? [] : [`查看：${p.link}`]),
    `后台处理（恢复/标为垃圾/删除）：${p.admin}`,
    '',
    `—— ${p.siteName}${c.email ? '。直接回复这封邮件会发给评论者。' : ''}`,
  ].join('\n');

  const block = (s: string) => escapeHtml(s).replace(/\n/g, '<br>');
  const color = spam ? '#e53935' : '#26a69a';
  const html = `<!doctype html><html lang="zh-CN"><body style="margin:0;padding:24px;background:#f5f5f5;font:15px/1.7 -apple-system,'PingFang SC','Microsoft YaHei',sans-serif;color:#333">
<div style="max-width:600px;margin:0 auto;background:#fff;padding:24px 28px;border-radius:4px;border-top:4px solid ${color}">
<p style="margin:0 0 12px">《${escapeHtml(p.postTitle)}》收到一条评论（#${c.id}）：</p>
<table style="border-collapse:collapse;margin:0 0 16px;font-size:14px">${facts
    .map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#888;white-space:nowrap;vertical-align:top">${k}</td><td style="padding:2px 0${k === '状态' ? `;color:${color};font-weight:bold` : ''}">${escapeHtml(v)}</td></tr>`)
    .join('')}</table>
<div style="margin:0 0 20px;padding:12px 14px;background:#f7f7f7;border-radius:4px;overflow-wrap:anywhere">${block(excerpt(c.body, 3000))}</div>
<p style="margin:0 0 20px">${spam ? '' : `<a href="${escapeHtml(p.link)}" style="display:inline-block;padding:8px 18px;background:#26a69a;color:#fff;text-decoration:none;border-radius:2px;margin-right:8px">查看评论</a>`}<a href="${escapeHtml(p.admin)}" style="display:inline-block;padding:8px 18px;background:#455a64;color:#fff;text-decoration:none;border-radius:2px">后台处理</a></p>
<p style="margin:0;font-size:12px;color:#999">—— ${escapeHtml(p.siteName)}${c.email ? '。直接回复这封邮件会发给评论者。' : ''}</p>
</div></body></html>`;
  return { subject, text, html };
}

/**
 * Tell the site owner about a new comment, published or caught as spam. Skipped for bots
 * that failed the hard checks (proof of work, honeypot, timing, IP burst: no real browser,
 * possibly hundreds a day) and for the owner's own comments; capped per day so readers'
 * reply notifications keep most of the mail quota. Never throws.
 */
export async function notifyOwner(ctx: NotifyContext, comment: CommentRow): Promise<NotifyOutcome> {
  try {
    const to = ctx.ownerEmail?.trim() ?? '';
    if (!ctx.mailer || !to) return 'off';
    let codes: string[] = [];
    try {
      codes = comment.spam_reasons ? (JSON.parse(comment.spam_reasons) as string[]) : [];
    } catch {
      /* unreadable reasons: treat as none */
    }
    if (comment.status === 'spam' && hasHardReason(codes)) return 'bot';
    if (comment.email && normEmail(comment.email) === normEmail(to)) return 'own-comment';

    const now = ctx.now ?? Date.now();
    const toHash = await emailHash(ctx.secret, to);
    // One query for both caps; each comment triggers this once (at submission), and the
    // provider's idempotency key covers retries.
    const sent = await store.sentLastDay(ctx.db, toHash, now, 'owner');
    if (sent.ofKind >= (ctx.ownerDailyLimit ?? DEFAULT_OWNER_DAILY_LIMIT) || sent.total >= (ctx.dailyLimit ?? DEFAULT_DAILY_LIMIT)) {
      return 'daily-limit';
    }

    const thread = await ctx.thread(comment.post_id);
    const mail = composeOwnerEmail({
      siteName: ctx.siteName ?? new URL(ctx.origin).hostname,
      postTitle: thread?.title ?? comment.post_id,
      comment,
      link: new URL(`${thread?.url ?? '/'}#comment-${comment.id}`, ctx.origin).href,
      admin: new URL(`/admine/comments?post=${encodeURIComponent(comment.post_id)}&status=${comment.status}`, ctx.origin).href,
    });
    const at = new Date(now).toISOString();
    try {
      await ctx.mailer.send({
        to,
        ...mail,
        replyTo: comment.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(comment.email) ? comment.email : undefined,
        headers: { 'Auto-Submitted': 'auto-generated' },
        idempotencyKey: `owner-${comment.id}`,
      });
    } catch (err) {
      await store.logNotification(ctx.db, { commentId: comment.id, toHash, status: 'failed', error: String(err), kind: 'owner' }, at);
      console.error('owner notification failed', err);
      return 'failed';
    }
    await store.logNotification(ctx.db, { commentId: comment.id, toHash, status: 'sent', kind: 'owner' }, at);
    return 'sent';
  } catch (err) {
    console.error('owner notification failed', err);
    return 'failed';
  }
}
