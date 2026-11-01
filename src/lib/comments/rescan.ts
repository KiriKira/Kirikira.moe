import { aiSpamCheck } from './ai';
import { judgeComment, type SpamSignals } from './spam';
import * as store from './store';
import type { CommentRow, SpamRule } from './types';

/**
 * Re-judge published comments that the AI hasn't seen yet (e.g. everything imported from
 * the old site) with the content rules plus Clef-flash. Request-level signals (proof of
 * work, timing, IP bursts) don't exist for old rows, so they count as clean. Comments judged
 * spam move to the spam list, where the admin can restore them.
 */
export interface RescanResult {
  checked: number;
  flagged: number;
  remaining: number;
  error?: 'ai-unavailable';
}

const NEUTRAL: SpamSignals = {
  honeypot: '',
  pow: 'ok',
  elapsedMs: null,
  ipHash: null,
  recentFromIp: { lastMinute: 0, lastHour: 0 },
  duplicate: false,
};

async function scanOne(row: CommentRow, ai: Ai, rules: SpamRule[], titles: Record<string, string>) {
  const result = await aiSpamCheck(ai, { name: row.name, url: row.url ?? '', body: row.body, postTitle: titles[row.post_id] });
  const input = { postId: row.post_id, parentId: row.parent_id, name: row.name, email: row.email ?? '', url: row.url ?? '', body: row.body };
  const verdict = judgeComment(input, { ...NEUTRAL, ipHash: row.ip_hash, ai: result }, rules);
  return { row, result, verdict };
}

export async function rescanBatch(
  db: D1Database,
  ai: Ai,
  titles: Record<string, string>,
  limit = 20,
  concurrency = 5,
): Promise<RescanResult> {
  const [rows, rules] = await Promise.all([store.listUnscanned(db, limit), store.listRules(db)]);
  if (!rows.length) return { checked: 0, flagged: 0, remaining: 0 };

  // Probe with the first row: if the model is down, stop instead of marking everything as checked.
  const first = await scanOne(rows[0], ai, rules, titles);
  if (!first.result) return { checked: 0, flagged: 0, remaining: await store.countUnscanned(db), error: 'ai-unavailable' };

  const scanned = [first];
  for (let i = 1; i < rows.length; i += concurrency) {
    scanned.push(...(await Promise.all(rows.slice(i, i + concurrency).map((r) => scanOne(r, ai, rules, titles)))));
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
  return { checked: scanned.length, flagged, remaining: await store.countUnscanned(db) };
}
