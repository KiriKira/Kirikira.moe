/**
 * Just enough of D1's API over node:sqlite (in memory) to test store/notify code against
 * the real schema: every migration in migrations/ is applied in order.
 */
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATIONS = resolve(import.meta.dirname, '../../migrations');

class Stmt {
  constructor(
    private db: DatabaseSync,
    private sql: string,
    private args: SQLInputValue[] = [],
  ) {}
  bind(...args: unknown[]) {
    return new Stmt(this.db, this.sql, args.map((a) => (a === undefined ? null : typeof a === 'boolean' ? Number(a) : a)) as SQLInputValue[]);
  }
  async first<T>(col?: string): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.args) as Record<string, unknown> | undefined;
    if (!row) return null;
    return (col ? row[col] : { ...row }) as T;
  }
  async all<T>() {
    return { results: this.db.prepare(this.sql).all(...this.args).map((r) => ({ ...r })) as T[], success: true, meta: {} };
  }
  async run() {
    const r = this.db.prepare(this.sql).run(...this.args);
    return { success: true, results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
}

export function createD1(): { d1: D1Database; sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(resolve(MIGRATIONS, f), 'utf8'));
  }
  const d1 = {
    prepare: (sql: string) => new Stmt(sqlite, sql),
    batch: async (stmts: Stmt[]) => Promise.all(stmts.map((s) => s.all())),
  };
  return { d1: d1 as unknown as D1Database, sqlite };
}
