import { env, commentSecret } from '../env';
import { getMailer } from './mail';
import { DEFAULT_DAILY_LIMIT, DEFAULT_OWNER_DAILY_LIMIT, notifyOwner, notifyReply, type NotifyContext } from './notify';
import { getThreads } from './threads';
import type { CommentRow } from './types';

/** Whether reply notifications are configured (the form only offers the checkbox then). */
export const notificationsEnabled = () => getMailer(env) !== null;

function context(requestUrl: URL): NotifyContext {
  return {
    db: env.DB,
    secret: commentSecret(),
    mailer: getMailer(env),
    origin: requestUrl.origin,
    thread: async (id) => (await getThreads(env, requestUrl))[id],
    dailyLimit: Number(env.MAIL_DAILY_LIMIT) || DEFAULT_DAILY_LIMIT,
    ownerEmail: env.ADMIN_EMAIL,
    ownerDailyLimit: Number(env.ADMIN_EMAIL_DAILY_LIMIT) || DEFAULT_OWNER_DAILY_LIMIT,
    siteName: 'Kiri 的博客',
  };
}

/**
 * After the response has been sent (ctx.waitUntil), so a slow mail API never delays posting
 * a comment: notify the authors of the comments these replies answer, and with
 * `owner: true` (new submissions) tell the site owner about each comment.
 */
export function notifyInBackground(locals: unknown, requestUrl: URL, comments: CommentRow[], opts: { owner?: boolean } = {}): void {
  const replies = comments.filter((r) => r.parent_id !== null && r.status === 'published');
  const owner = opts.owner && env.ADMIN_EMAIL ? comments : [];
  if ((!replies.length && !owner.length) || !notificationsEnabled()) return;
  const ctx = context(requestUrl);
  const job = (async () => {
    for (const c of owner) await notifyOwner(ctx, c);
    for (const r of replies) await notifyReply(ctx, r);
  })();
  const cf = (locals as { cfContext?: ExecutionContext } | undefined)?.cfContext;
  if (cf) cf.waitUntil(job);
  else void job; // dev server without an execution context: just let it run
}
