import { env, commentSecret } from '../env';
import { getMailer } from './mail';
import { DEFAULT_DAILY_LIMIT, notifyReply, type NotifyContext } from './notify';
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
    siteName: 'Kiri 的博客',
  };
}

/**
 * Notify the authors of the comments these replies answer, after the response has been
 * sent (ctx.waitUntil), so a slow mail API never delays posting a comment.
 */
export function notifyInBackground(locals: unknown, requestUrl: URL, replies: CommentRow[]): void {
  const todo = replies.filter((r) => r.parent_id !== null && r.status === 'published');
  if (!todo.length || !notificationsEnabled()) return;
  const ctx = context(requestUrl);
  const job = (async () => {
    for (const r of todo) await notifyReply(ctx, r);
  })();
  const cf = (locals as { cfContext?: ExecutionContext } | undefined)?.cfContext;
  if (cf) cf.waitUntil(job);
  else void job; // dev server without an execution context: just let it run
}
