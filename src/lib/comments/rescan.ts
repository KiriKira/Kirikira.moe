import { aiSpamCheck, type AiResult } from './ai';
import { judgeComment, type SpamSignals } from './spam';
import * as store from './store';
import type { CommentRow, SpamRule } from './types';

/**
 * Re-judge published comments (e.g. everything imported from the old site, or after the
 * rules changed) with the current content rules plus Clef-flash when it's available.
 * Walks the table with an id cursor so it can be repeated at any time. Request-level
 * signals (proof of work, timing, IP bursts) don't exist for old rows and count as clean.
 * Comments judged spam move to the spam list, where the admin can restore them.
 */
export interface RescanResult {
  checked: number;
  flagged: number;
  /** Pass back as `after` to continue; null when done. */
  next: number | null;
  remaining: number;
  /** Whether the AI answered in this batch (rules-only otherwise). */
  ai: boolean;
}

export type PostContext = Record<string, { title: string; excerpt?: string }>;

const NEUTRAL: SpamSignals = {
  honeypot: '',
  pow: 'ok',
  elapsedMs: null,
  ipHash: null,
  recentFromIp: { lastMinute: 0, lastHour: 0 },
  duplicate: false,
};

async function scanOne(row: CommentRow, ai: Ai | null, rules: SpamRule[], posts: PostContext) {
  const post = posts[row.post_id];
  const result: AiResult | null = ai
    ? await aiSpamCheck(ai, {
        name: row.name,
        url: row.url ?? '',
        email: row.email ?? '',
        body: row.body,
        postTitle: post?.title,
        postExcerpt: post?.excerpt,
      })
    : null;
  const input = { postId: row.post_id, parentId: row.parent_id, name: row.name, email: row.email ?? '', url: row.url ?? '', body: row.body };
  const verdict = judgeComment(input, { ...NEUTRAL, ipHash: row.ip_hash, ai: result }, rules);
  return { row, result, verdict };
}

export async function rescanBatch(
  db: D1Database,
  ai: Ai | null,
  posts: PostContext,
  after = 0,
  concurrency = 5,
): Promise<RescanResult> {
  // AI calls are subrequests: keep AI batches small; rules-only batches can be large.
  const limit = ai ? 20 : 200;
  const [rows, rules] = await Promise.all([store.listPublishedAfter(db, after, limit), store.listRules(db)]);
  if (!rows.length) return { checked: 0, flagged: 0, next: null, remaining: 0, ai: !!ai };

  // Probe with the first row: if the model is down (or out of quota), carry on rules-only.
  const first = await scanOne(rows[0], ai, rules, posts);
  const useAi = ai && first.result ? ai : null;
  const scanned = [first];
  for (let i = 1; i < rows.length; i += concurrency) {
    scanned.push(...(await Promise.all(rows.slice(i, i + concurrency).map((r) => scanOne(r, useAi, rules, posts)))));
  }

  let flagged = 0;
  for (const { row, result, verdict } of scanned) {
    if (verdict.isSpam) flagged++;
    await store.saveScan(db, row.id, {
      aiSpam: result?.spam ?? null,
      aiKind: result?.kind ?? null,
      spam: verdict.isSpam,
      score: verdict.score,
      reasons: verdict.reasons,
    });
  }
  const last = rows[rows.length - 1].id;
  const remaining = await store.countPublishedAfter(db, last);
  return { checked: scanned.length, flagged, next: remaining ? last : null, remaining, ai: !!useAi };
}
