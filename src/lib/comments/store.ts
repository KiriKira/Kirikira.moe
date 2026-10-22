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

export async function recentFromIp(
  db: D1Database,
  ipHash: string | null,
  now = Date.now(),
): Promise<{ lastMinute: number; lastHour: number; spamLastHour: number }> {
  if (!ipHash) return { lastMinute: 0, lastHour: 0, spamLastHour: 0 };
  const row = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN created_at >= ?2 THEN 1 ELSE 0 END) AS last_minute,
         COUNT(*) AS last_hour,
         SUM(CASE WHEN status = 'spam' THEN 1 ELSE 0 END) AS spam_last_hour
       FROM comments WHERE ip_hash = ?1 AND created_at >= ?3`,
    )
    .bind(ipHash, minutesAgo(now, 1), minutesAgo(now, 60))
    .first<{ last_minute: number | null; last_hour: number; spam_last_hour: number | null }>();
  return {
    lastMinute: row?.last_minute ?? 0,
    lastHour: row?.last_hour ?? 0,
    spamLastHour: row?.spam_last_hour ?? 0,
  };
}

export async function hasRecentDuplicate(db: D1Database, bodyFp: string, now = Date.now()): Promise<boolean> {
  if (bodyFp.length < 8) return false; // "+1", "谢谢" etc. are legitimately repeated.
  const row = await db
    .prepare(`SELECT 1 AS hit FROM comments WHERE body_fp = ? AND created_at >= ? LIMIT 1`)
    .bind(bodyFp, minutesAgo(now, 7 * 24 * 60))
    .first<{ hit: number }>();
  return !!row;
}

export async function powNonceUsed(db: D1Database, nonce: string): Promise<boolean> {
  const row = await db.prepare(`SELECT 1 AS hit FROM comments WHERE pow_nonce = ? LIMIT 1`).bind(nonce).first();
  return !!row;
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
          ip_hash, user_agent, pow_nonce, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
    )
    .bind(
      c.post_id, c.parent_id, c.name, c.email, c.url, c.body, c.body_fp, c.status, c.spam_score,
      c.spam_reasons, c.ip_hash, c.user_agent, c.pow_nonce, c.created_at,
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

export async function countByStatus(db: D1Database): Promise<Record<CommentStatus, number>> {
  const { results } = await db
    .prepare(`SELECT status, COUNT(*) AS n FROM comments GROUP BY status`)
    .all<{ status: CommentStatus; n: number }>();
  const out: Record<CommentStatus, number> = { published: 0, spam: 0 };
  for (const r of results) out[r.status] = r.n;
  return out;
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
