import type { CommentRow, CommentStatus, SpamRule, SpamRuleKind } from './types';

const minutesAgo = (now: number, m: number) => new Date(now - m * 60_000).toISOString();

export async function listPublished(db: D1Database, postId: string): Promise<CommentRow[]> {
  const { results } = await db
    .prepare(`SELECT * FROM comments WHERE post_id = ? AND status = 'published' ORDER BY created_at ASC, id ASC`)
    .bind(postId)
    .all<CommentRow>();
  return results;
}

export async function getComment(db: D1Database, id: number): Promise<CommentRow | null> {
  return db.prepare(`SELECT * FROM comments WHERE id = ?`).bind(id).first<CommentRow>();
}

/**
 * The author's other comments (by email, or by name when there's no email), newest first:
 * the total and a few bodies. Given to the AI as context: bots give themselves away across
 * comments (the same pitch in a different language every time).
 */
export async function authorRecent(
  db: D1Database,
  author: { email: string; name: string },
  excludeId = 0,
): Promise<{ total: number; samples: string[] }> {
  const byEmail = author.email.trim() !== '';
  const where = `${byEmail ? 'lower(email) = lower(?1)' : 'name = ?1'} AND id != ?2`;
  const key = byEmail ? author.email.trim() : author.name;
  const [count, recent] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS n FROM comments WHERE ${where}`).bind(key, excludeId),
    db.prepare(`SELECT body FROM comments WHERE ${where} ORDER BY id DESC LIMIT 3`).bind(key, excludeId),
  ]);
  return {
    total: (count.results[0] as { n: number } | undefined)?.n ?? 0,
    samples: (recent.results as { body: string }[]).map((r) => r.body),
  };
}

export interface SubmissionContext {
  /** The proof-of-work nonce was already used by a stored comment (a replayed solution). */
  nonceUsed: boolean;
  recentFromIp: { lastMinute: number; lastHour: number; spamLastHour: number };
  /** Same body (fingerprint) within the last 7 days. */
  duplicate: boolean;
  rules: SpamRule[];
  /** The author's other comments, for the AI (see authorRecent). */
  history: { total: number; samples: string[] };
}

/**
 * Everything the spam checks need to read, in ONE D1 round trip. Each D1 call costs CPU
 * inside the Worker (request/response serialisation), and the free plan allows 10 ms per
 * request; seven separate queries were most of a submission's CPU time.
 */
export async function submissionContext(
  db: D1Database,
  q: { nonce: string | null; ipHash: string | null; bodyFp: string; author: { email: string; name: string } },
  now = Date.now(),
): Promise<SubmissionContext> {
  const byEmail = q.author.email.trim() !== '';
  const authorWhere = byEmail ? 'lower(email) = lower(?1)' : 'name = ?1';
  const authorKey = byEmail ? q.author.email.trim() : q.author.name;
  const [nonce, ip, dup, rules, authorCount, authorSamples] = await db.batch([
    db.prepare(`SELECT 1 AS hit FROM comments WHERE pow_nonce = ? LIMIT 1`).bind(q.nonce),
    db
      .prepare(
        `SELECT SUM(CASE WHEN created_at >= ?2 THEN 1 ELSE 0 END) AS last_minute, COUNT(*) AS last_hour,
                SUM(CASE WHEN status = 'spam' THEN 1 ELSE 0 END) AS spam_last_hour
         FROM comments WHERE ip_hash = ?1 AND created_at >= ?3`,
      )
      .bind(q.ipHash, minutesAgo(now, 1), minutesAgo(now, 60)),
    db.prepare(`SELECT 1 AS hit FROM comments WHERE body_fp = ? AND created_at >= ? LIMIT 1`).bind(q.bodyFp, minutesAgo(now, 7 * 24 * 60)),
    db.prepare(`SELECT * FROM spam_rules ORDER BY id DESC`),
    db.prepare(`SELECT COUNT(*) AS n FROM comments WHERE ${authorWhere}`).bind(authorKey),
    db.prepare(`SELECT body FROM comments WHERE ${authorWhere} ORDER BY id DESC LIMIT 3`).bind(authorKey),
  ]);
  const ipRow = ip.results[0] as { last_minute: number | null; last_hour: number; spam_last_hour: number | null } | undefined;
  return {
    nonceUsed: q.nonce !== null && nonce.results.length > 0,
    // An unknown IP can't be rate limited (and NULL matches nothing anyway).
    recentFromIp: q.ipHash
      ? { lastMinute: ipRow?.last_minute ?? 0, lastHour: ipRow?.last_hour ?? 0, spamLastHour: ipRow?.spam_last_hour ?? 0 }
      : { lastMinute: 0, lastHour: 0, spamLastHour: 0 },
    // "+1", "谢谢" etc. are legitimately repeated.
    duplicate: q.bodyFp.length >= 8 && dup.results.length > 0,
    rules: rules.results as SpamRule[],
    history: {
      total: (authorCount.results[0] as { n: number } | undefined)?.n ?? 0,
      samples: (authorSamples.results as { body: string }[]).map((r) => r.body),
    },
  };
}

export async function listRules(db: D1Database): Promise<SpamRule[]> {
  const { results } = await db.prepare(`SELECT * FROM spam_rules ORDER BY id DESC`).all<SpamRule>();
  return results;
}

export type NewComment = Omit<CommentRow, 'id' | 'legacy_id'>;

export async function insertComment(db: D1Database, c: NewComment): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO comments
         (post_id, parent_id, name, email, url, body, body_fp, status, spam_score, spam_reasons,
          ip_hash, user_agent, pow_nonce, ai_spam, ai_kind, ai_checked_at, notify, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
    )
    .bind(
      c.post_id, c.parent_id, c.name, c.email, c.url, c.body, c.body_fp, c.status, c.spam_score,
      c.spam_reasons, c.ip_hash, c.user_agent, c.pow_nonce, c.ai_spam, c.ai_kind, c.ai_checked_at, c.notify, c.created_at,
    )
    .first<{ id: number }>();
  return row!.id;
}

// ---------- admin ----------

export interface AdminQuery {
  status?: CommentStatus | 'all';
  postId?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export async function adminList(db: D1Database, query: AdminQuery): Promise<{ rows: CommentRow[]; total: number }> {
  const where: string[] = [];
  const args: unknown[] = [];
  if (query.status && query.status !== 'all') {
    where.push('status = ?');
    args.push(query.status);
  }
  if (query.postId) {
    where.push('post_id = ?');
    args.push(query.postId);
  }
  if (query.q) {
    where.push(`(name LIKE ? OR body LIKE ? OR email LIKE ? OR url LIKE ?)`);
    const like = `%${query.q}%`;
    args.push(like, like, like, like);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = Math.min(query.limit ?? 50, 200);
  const offset = query.offset ?? 0;
  const [rows, total] = await db.batch([
    db.prepare(`SELECT * FROM comments ${clause} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`).bind(...args, limit, offset),
    db.prepare(`SELECT COUNT(*) AS n FROM comments ${clause}`).bind(...args),
  ]);
  return {
    rows: rows.results as CommentRow[],
    total: (total.results[0] as { n: number }).n,
  };
}

/** Comments per status, plus published ones the AI hasn't scored yet: one query. */
export async function countByStatus(db: D1Database): Promise<Record<CommentStatus, number> & { unscanned: number }> {
  const row = await db
    .prepare(
      `SELECT SUM(status = 'published') AS published, SUM(status = 'spam') AS spam,
              SUM(status = 'published' AND ai_checked_at IS NULL) AS unscanned
       FROM comments`,
    )
    .first<{ published: number | null; spam: number | null; unscanned: number | null }>();
  return { published: row?.published ?? 0, spam: row?.spam ?? 0, unscanned: row?.unscanned ?? 0 };
}

const placeholders = (n: number) => Array.from({ length: n }, () => '?').join(',');

export async function setStatus(db: D1Database, ids: number[], status: CommentStatus): Promise<void> {
  if (!ids.length) return;
  await db.prepare(`UPDATE comments SET status = ? WHERE id IN (${placeholders(ids.length)})`).bind(status, ...ids).run();
}

export async function deleteComments(db: D1Database, ids: number[]): Promise<void> {
  if (!ids.length) return;
  // parent_id is ON DELETE SET NULL, so replies survive as top-level comments.
  await db.prepare(`DELETE FROM comments WHERE id IN (${placeholders(ids.length)})`).bind(...ids).run();
}

export async function addRule(
  db: D1Database,
  rule: { kind: SpamRuleKind; pattern: string; weight: number; note?: string | null },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO spam_rules (kind, pattern, weight, note, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (kind, pattern) DO UPDATE SET weight = excluded.weight, note = excluded.note`,
    )
    .bind(rule.kind, rule.pattern, rule.weight, rule.note ?? null, new Date().toISOString())
    .run();
}

export async function deleteRule(db: D1Database, id: number): Promise<void> {
  await db.prepare(`DELETE FROM spam_rules WHERE id = ?`).bind(id).run();
}

export async function purgeOldSpam(db: D1Database, days: number, now = Date.now()): Promise<number> {
  const res = await db
    .prepare(`DELETE FROM comments WHERE status = 'spam' AND created_at < ?`)
    .bind(minutesAgo(now, days * 24 * 60))
    .run();
  return res.meta.changes ?? 0;
}

// ---------- re-scan of existing comments ----------

/** Published comments after `afterId`, oldest first: the re-scan walks the table with this cursor. */
export async function listPublishedAfter(db: D1Database, afterId: number, limit: number): Promise<CommentRow[]> {
  const { results } = await db
    .prepare(`SELECT * FROM comments WHERE status = 'published' AND id > ? ORDER BY id LIMIT ?`)
    .bind(afterId, limit)
    .all<CommentRow>();
  return results;
}

export async function countPublishedAfter(db: D1Database, afterId: number): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM comments WHERE status = 'published' AND id > ?`)
    .bind(afterId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** Published comments the AI hasn't scored yet (shown as a hint in the admin). */
export async function countUnscanned(db: D1Database): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM comments WHERE status = 'published' AND ai_checked_at IS NULL`)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function saveScan(
  db: D1Database,
  id: number,
  scan: { aiSpam: number | null; aiKind: string | null; spam: boolean; score: number; reasons: string[] },
  now = new Date().toISOString(),
): Promise<void> {
  await db
    .prepare(
      `UPDATE comments SET ai_spam = COALESCE(?, ai_spam), ai_kind = COALESCE(?, ai_kind),
         ai_checked_at = CASE WHEN ? IS NULL THEN ai_checked_at ELSE ? END,
         status = CASE WHEN ? THEN 'spam' ELSE status END,
         spam_score = CASE WHEN ? THEN ? ELSE spam_score END,
         spam_reasons = CASE WHEN ? THEN ? ELSE spam_reasons END
       WHERE id = ?`,
    )
    .bind(
      scan.aiSpam, scan.aiKind, scan.aiSpam, now,
      scan.spam ? 1 : 0, scan.spam ? 1 : 0, scan.score, scan.spam ? 1 : 0, JSON.stringify(scan.reasons), id,
    )
    .run();
}

export async function countRecentSpam(db: D1Database, days = 7, now = Date.now()): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM comments WHERE status = 'spam' AND created_at >= ?`)
    .bind(minutesAgo(now, days * 24 * 60))
    .first<{ n: number }>();
  return row?.n ?? 0;
}

// ---------- reply notifications (migration 0003) ----------

export async function isOptedOut(db: D1Database, emailHash: string): Promise<boolean> {
  return !!(await db.prepare(`SELECT 1 AS hit FROM email_optouts WHERE email_hash = ?`).bind(emailHash).first());
}

export async function optOut(db: D1Database, emailHash: string, now = new Date().toISOString()): Promise<void> {
  await db.prepare(`INSERT OR IGNORE INTO email_optouts (email_hash, created_at) VALUES (?, ?)`).bind(emailHash, now).run();
}

export type NotificationKind = 'reply' | 'owner';

/** Whether a comment already triggered a successful notification of this kind (once each). */
export async function wasNotified(db: D1Database, commentId: number, kind: NotificationKind = 'reply'): Promise<boolean> {
  return !!(await db
    .prepare(`SELECT 1 AS hit FROM notifications WHERE comment_id = ? AND kind = ? AND status = 'sent'`)
    .bind(commentId, kind)
    .first());
}

/** Successful sends in the last 24 hours: in total, to one recipient, and of one kind. */
export async function sentLastDay(
  db: D1Database,
  toHash: string,
  now = Date.now(),
  kind: NotificationKind = 'reply',
): Promise<{ total: number; toRecipient: number; ofKind: number }> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN to_hash = ?1 THEN 1 ELSE 0 END) AS to_recipient,
              SUM(CASE WHEN kind = ?3 THEN 1 ELSE 0 END) AS of_kind
       FROM notifications WHERE status = 'sent' AND created_at >= ?2`,
    )
    .bind(toHash, minutesAgo(now, 24 * 60), kind)
    .first<{ total: number; to_recipient: number | null; of_kind: number | null }>();
  return { total: row?.total ?? 0, toRecipient: row?.to_recipient ?? 0, ofKind: row?.of_kind ?? 0 };
}

export async function logNotification(
  db: D1Database,
  n: { commentId: number; toHash: string; status: 'sent' | 'failed'; error?: string | null; kind?: NotificationKind },
  now = new Date().toISOString(),
): Promise<void> {
  await db
    .prepare(`INSERT INTO notifications (comment_id, to_hash, status, error, created_at, kind) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(n.commentId, n.toHash, n.status, n.error?.slice(0, 500) ?? null, now, n.kind ?? 'reply')
    .run();
}
