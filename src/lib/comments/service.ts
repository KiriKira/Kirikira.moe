import { checkPow } from './pow';
import { renderCommentBody } from './render';
import { aiSpamCheck, type AiResult } from './ai';
import { fingerprintBody, hasHardReason, judgeComment, type SpamSignals, type SpamVerdict } from './spam';
import * as store from './store';
import type { CommentRow, PublicComment } from './types';
import { validateComment } from './validate';
import { hashIp } from './hash';

/** Once an IP has this many spam comments in the last hour, stop storing more (D1 write quota). */
const MAX_STORED_SPAM_PER_IP_HOUR = 20;

export function toPublic(row: Pick<CommentRow, 'id' | 'parent_id' | 'name' | 'body' | 'created_at'>): PublicComment {
  return {
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    html: renderCommentBody(row.body),
    createdAt: row.created_at,
  };
}

export interface SubmitContext {
  db: D1Database;
  secret: string;
  ip: string | null;
  userAgent: string | null;
  threadExists: (postId: string) => Promise<boolean>;
  /** Workers AI binding when the AI check is enabled; omit to judge by rules only. */
  ai?: Ai | null;
  /** Title and summary of the post, given to the AI to judge relevance. */
  postContext?: (postId: string) => Promise<{ title: string; excerpt?: string } | undefined>;
  now?: number;
}

export type SubmitResult =
  | { status: 400; errors: Record<string, string> }
  | { status: 404 }
  | { status: 200; comment: PublicComment; verdict: SpamVerdict; stored: boolean };

/**
 * Handles a comment submission. Anything that looks like spam still gets a normal
 * 200 response containing the comment; it is just stored as `status = 'spam'`,
 * so the sender cannot tell it was filtered.
 */
export async function submitComment(raw: Record<string, unknown>, ctx: SubmitContext): Promise<SubmitResult> {
  const now = ctx.now ?? Date.now();
  const valid = validateComment(raw);
  if (!valid.ok) return { status: 400, errors: valid.errors };
  const input = valid.value;

  if (!(await ctx.threadExists(input.postId))) return { status: 404 };

  if (input.parentId !== null) {
    const parent = await store.getComment(ctx.db, input.parentId);
    if (!parent || parent.post_id !== input.postId) return { status: 400, errors: { parentId: '回复的评论不存在' } };
  }

  const ipHash = await hashIp(ctx.secret, ctx.ip);
  const pow = await checkPow(raw.pow, ctx.secret, input.postId, now);
  if (pow.status === 'ok' && pow.nonce && (await store.powNonceUsed(ctx.db, pow.nonce))) pow.status = 'replayed';

  const bodyFp = fingerprintBody(input.body);
  const [recent, duplicate, rules, history] = await Promise.all([
    store.recentFromIp(ctx.db, ipHash, now),
    store.hasRecentDuplicate(ctx.db, bodyFp, now),
    store.listRules(ctx.db),
    store.authorHistory(ctx.db, { email: input.email, name: input.name }),
  ]);

  const signals: SpamSignals = {
    honeypot: typeof raw.website === 'string' ? raw.website : '',
    pow: pow.status,
    // Only trust the timing when the challenge itself was authentic.
    elapsedMs: pow.status === 'ok' || pow.status === 'replayed' ? pow.elapsedMs : null,
    ipHash,
    recentFromIp: recent,
    duplicate,
    authorHistory: history,
  };
  let verdict = judgeComment(input, signals, rules);

  // Ask the model only about comments that got past the bot checks: bots can't drain the
  // free quota, and a hard failure is spam whatever the model thinks.
  let ai: AiResult | null = null;
  if (ctx.ai && !hasHardReason(verdict.reasons)) {
    const post = await ctx.postContext?.(input.postId);
    ai = await aiSpamCheck(ctx.ai, {
      name: input.name,
      url: input.url,
      email: input.email,
      body: input.body,
      postTitle: post?.title,
      postExcerpt: post?.excerpt,
    });
    if (ai) verdict = judgeComment(input, { ...signals, ai }, rules);
  }

  const createdAt = new Date(now).toISOString();
  const row: store.NewComment = {
    post_id: input.postId,
    parent_id: input.parentId,
    name: input.name,
    email: input.email || null,
    url: input.url || null,
    body: input.body,
    body_fp: bodyFp,
    status: verdict.isSpam ? 'spam' : 'published',
    spam_score: verdict.score,
    spam_reasons: verdict.reasons.length ? JSON.stringify(verdict.reasons) : null,
    ip_hash: ipHash,
    user_agent: ctx.userAgent?.slice(0, 300) ?? null,
    // A replayed nonce is already in the table; storing it again would violate the unique index.
    pow_nonce: pow.status === 'ok' ? pow.nonce : null,
    ai_spam: ai?.spam ?? null,
    ai_kind: ai?.kind ?? null,
    ai_checked_at: ai ? createdAt : null,
    created_at: createdAt,
  };

  const fake = () => ({ ...row, id: -Math.floor(Math.random() * 1e9) - 1 });

  if (verdict.isSpam && recent.spamLastHour >= MAX_STORED_SPAM_PER_IP_HOUR) {
    return { status: 200, comment: toPublic(fake()), verdict, stored: false };
  }

  let id: number;
  try {
    id = await store.insertComment(ctx.db, row);
  } catch (err) {
    // Concurrent replay of the same solved challenge loses the unique-index race.
    if (String(err).includes('UNIQUE')) {
      return { status: 200, comment: toPublic(fake()), verdict: { ...verdict, isSpam: true }, stored: false };
    }
    throw err;
  }
  return { status: 200, comment: toPublic({ ...row, id }), verdict, stored: true };
}
