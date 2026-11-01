import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createD1 } from './helpers/d1';
import * as store from '../src/lib/comments/store';
import { getMailer, type MailMessage, type Mailer } from '../src/lib/comments/mail';
import {
  composeReplyEmail,
  emailHash,
  notifyReply,
  PER_RECIPIENT_PER_DAY,
  unsubscribeToken,
  verifyUnsubscribe,
  type NotifyContext,
} from '../src/lib/comments/notify';
import { validateComment } from '../src/lib/comments/validate';
import type { CommentRow } from '../src/lib/comments/types';

const SECRET = 'test-secret-0123456789abcdef0123456789';
const NOW = Date.parse('2026-11-01T12:00:00Z');

let db: D1Database;
let sent: MailMessage[];
let mailer: Mailer;
let ctx: NotifyContext;

async function comment(over: Partial<store.NewComment> = {}): Promise<CommentRow> {
  const row: store.NewComment = {
    post_id: '12', parent_id: null, name: '路人甲', email: null, url: null, body: '写得真好',
    body_fp: null, status: 'published', spam_score: 0, spam_reasons: null, ip_hash: null, user_agent: null,
    pow_nonce: null, ai_spam: null, ai_kind: null, ai_checked_at: null, notify: 1,
    created_at: new Date(NOW - 60_000).toISOString(), ...over,
  };
  const id = await store.insertComment(db, row);
  return (await store.getComment(db, id))!;
}

beforeEach(() => {
  db = createD1().d1;
  sent = [];
  mailer = { provider: 'resend', send: vi.fn(async (m: MailMessage) => void sent.push(m)) };
  ctx = {
    db, secret: SECRET, mailer, origin: 'https://kirikira.moe', now: NOW, siteName: 'Kiri 的博客',
    thread: async () => ({ url: '/post/12/', title: 'V2Ray 的 MITM 功能' }),
  };
});

describe('notifyReply', () => {
  it('emails the author of the comment replied to, once', async () => {
    const parent = await comment({ name: 'Alice', email: 'Alice@Example.com', body: '请问新版还能用吗？' });
    const reply = await comment({ parent_id: parent.id, name: 'Kiri', email: 'kiri@kirikira.moe', body: '可以，见 **新文档**' });

    expect(await notifyReply(ctx, reply)).toBe('sent');
    expect(sent).toHaveLength(1);
    const m = sent[0];
    expect(m.to).toBe('Alice@Example.com');
    expect(m.subject).toBe('Kiri 回复了你在《V2Ray 的 MITM 功能》下的评论');
    expect(m.text).toContain(`https://kirikira.moe/post/12/#comment-${reply.id}`);
    expect(m.text).toContain('> 请问新版还能用吗？');
    const token = await unsubscribeToken(SECRET, parent.id);
    expect(m.headers?.['List-Unsubscribe']).toBe(`<https://kirikira.moe/api/comments/unsubscribe?c=${parent.id}&t=${token}>`);
    expect(m.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(m.idempotencyKey).toBe(`reply-${reply.id}`);

    expect(await notifyReply(ctx, reply)).toBe('already-sent');
    expect(sent).toHaveLength(1);
  });

  it('never notifies for spam, missing emails, opted-out or unticked authors', async () => {
    const noEmail = await comment();
    expect(await notifyReply(ctx, await comment({ parent_id: noEmail.id }))).toBe('no-email');

    const unticked = await comment({ email: 'a@example.com', notify: 0 });
    expect(await notifyReply(ctx, await comment({ parent_id: unticked.id }))).toBe('no-email');

    const parent = await comment({ email: 'b@example.com' });
    expect(await notifyReply(ctx, await comment({ parent_id: parent.id, status: 'spam' }))).toBe('reply-not-published');

    const hidden = await comment({ email: 'c@example.com', status: 'spam' });
    expect(await notifyReply(ctx, await comment({ parent_id: hidden.id }))).toBe('parent-unavailable');

    await store.optOut(db, await emailHash(SECRET, ' B@EXAMPLE.com'));
    expect(await notifyReply(ctx, await comment({ parent_id: parent.id }))).toBe('opted-out');

    expect(await notifyReply(ctx, await comment())).toBe('not-a-reply');
    expect(await notifyReply({ ...ctx, mailer: null }, await comment({ parent_id: parent.id }))).toBe('off');
    expect(sent).toHaveLength(0);
  });

  it('skips people replying to themselves', async () => {
    const parent = await comment({ name: 'Bob', email: 'bob@example.com', ip_hash: 'ip1' });
    expect(await notifyReply(ctx, await comment({ parent_id: parent.id, email: 'BOB@example.com' }))).toBe('self-reply');
    expect(await notifyReply(ctx, await comment({ parent_id: parent.id, name: 'Bob', ip_hash: 'ip1' }))).toBe('self-reply');
    expect(await notifyReply(ctx, await comment({ parent_id: parent.id, name: 'Carol', ip_hash: 'ip1' }))).toBe('sent');
  });

  it('does not notify about old replies restored from spam', async () => {
    const parent = await comment({ email: 'd@example.com' });
    const old = await comment({ parent_id: parent.id, created_at: '2019-05-02T07:39:00Z' });
    expect(await notifyReply(ctx, old)).toBe('stale');
  });

  it('caps emails per recipient and per day', async () => {
    const parent = await comment({ email: 'e@example.com' });
    for (let i = 0; i < PER_RECIPIENT_PER_DAY; i++) {
      expect(await notifyReply(ctx, await comment({ parent_id: parent.id }))).toBe('sent');
    }
    expect(await notifyReply(ctx, await comment({ parent_id: parent.id }))).toBe('recipient-limit');

    const other = await comment({ email: 'f@example.com' });
    expect(await notifyReply({ ...ctx, dailyLimit: PER_RECIPIENT_PER_DAY }, await comment({ parent_id: other.id }))).toBe('daily-limit');
  });

  it('logs failures without throwing, and a later attempt can still send', async () => {
    const parent = await comment({ email: 'g@example.com' });
    const reply = await comment({ parent_id: parent.id });
    const broken: Mailer = { provider: 'resend', send: async () => { throw new Error('Resend 500'); } };
    expect(await notifyReply({ ...ctx, mailer: broken }, reply)).toBe('failed');
    expect(await notifyReply(ctx, reply)).toBe('sent');
  });
});

describe('unsubscribe links', () => {
  it('verifies only the token for that comment', async () => {
    const t = await unsubscribeToken(SECRET, 42);
    expect(await verifyUnsubscribe(SECRET, 42, t)).toBe(true);
    expect(await verifyUnsubscribe(SECRET, 43, t)).toBe(false);
    expect(await verifyUnsubscribe('other-secret', 42, t)).toBe(false);
    expect(await verifyUnsubscribe(SECRET, 42, 'nope')).toBe(false);
  });
});

describe('composeReplyEmail', () => {
  it('shows strangers\' text as plain text, never as HTML', () => {
    const m = composeReplyEmail({
      siteName: 'Kiri 的博客', postTitle: 'T', link: 'https://kirikira.moe/post/1/#comment-2', unsubscribe: 'https://kirikira.moe/u',
      parent: { name: 'A', body: 'hi' },
      reply: { name: '<b>Eve</b>', body: '<a href="https://evil.example">click</a>' },
    });
    expect(m.html).not.toContain('<a href="https://evil.example"');
    expect(m.html).toContain('&lt;a href=&quot;https://evil.example&quot;&gt;');
    expect(m.html).toContain('&lt;b&gt;Eve&lt;/b&gt;');
  });
});

describe('getMailer', () => {
  it('is off without a sender or a provider', () => {
    expect(getMailer({ RESEND_API_KEY: 'k' } as Env)).toBeNull();
    expect(getMailer({ MAIL_FROM: 'Kiri <noreply@kirikira.moe>' } as Env)).toBeNull();
  });

  it('sends through Resend with an idempotency key', async () => {
    const fetchMock = vi.fn(async () => new Response('{"id":"1"}', { status: 200 }));
    const m = getMailer({ RESEND_API_KEY: 'key', MAIL_FROM: 'Kiri <noreply@kirikira.moe>' } as Env, fetchMock as typeof fetch)!;
    expect(m.provider).toBe('resend');
    await m.send({ to: 'a@example.com', subject: 's', text: 't', html: 'h', idempotencyKey: 'reply-1' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>)['idempotency-key']).toBe('reply-1');
    expect(JSON.parse(init.body as string)).toMatchObject({ from: 'Kiri <noreply@kirikira.moe>', to: ['a@example.com'] });
  });

  it('reports Resend errors', async () => {
    const m = getMailer({ RESEND_API_KEY: 'key', MAIL_FROM: 'x@kirikira.moe' } as Env, (async () => new Response('bad', { status: 422 })) as typeof fetch)!;
    await expect(m.send({ to: 'a@example.com', subject: 's', text: 't', html: 'h' })).rejects.toThrow('Resend 422');
  });

  it('falls back to the Cloudflare send_email binding', async () => {
    const send = vi.fn(async () => ({ messageId: 'x' }));
    const m = getMailer({ EMAIL: { send } as unknown as SendEmail, MAIL_FROM: 'x@kirikira.moe' } as Env)!;
    expect(m.provider).toBe('cloudflare');
    await m.send({ to: 'a@example.com', subject: 's', text: 't', html: 'h' });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ from: 'x@kirikira.moe', to: 'a@example.com' }));
  });
});

describe('notify preference in the form', () => {
  const base = { post: '1', name: 'a', body: 'b' };
  it('defaults to on and accepts an explicit opt-out', () => {
    expect(validateComment(base).ok && validateComment(base)).toMatchObject({ value: { notify: true } });
    expect(validateComment({ ...base, notify: false })).toMatchObject({ value: { notify: false } });
  });
});
