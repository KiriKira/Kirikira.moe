#!/usr/bin/env node
/**
 * Cross-check the migrated content against the Django database.
 *
 *   node scripts/migrate/verify.ts --db data/db.sqlite3 [--check-remote]
 *
 * Exits 1 if anything is missing or inconsistent. Warnings (exit 0) are things that
 * work but deserve a look, e.g. images still served from an external host.
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { findImageUrls } from './lib.ts';

const { values: args } = parseArgs({
  options: {
    db: { type: 'string', default: 'data/db.sqlite3' },
    posts: { type: 'string', default: 'src/content/posts' },
    'comments-sql': { type: 'string', default: 'data/comments.sql' },
    public: { type: 'string', default: 'public' },
    'check-remote': { type: 'boolean', default: false },
  },
});

const root = resolve(import.meta.dirname, '../..');
const p = (rel: string) => resolve(root, rel);
const errors: string[] = [];
const warnings: string[] = [];

const db = new DatabaseSync(p(args.db!), { readOnly: true });
const dbPosts = db.prepare(`SELECT id, title, status FROM blog_post ORDER BY id`).all() as {
  id: number;
  title: string;
  status: string | null;
}[];
const dbCommentCounts = new Map(
  (db.prepare(`SELECT post_id, COUNT(*) AS n FROM comments_comment GROUP BY post_id`).all() as { post_id: number; n: number }[]).map(
    (r) => [String(r.post_id), r.n],
  ),
);
const hasMusic = new Set<number>();
try {
  for (const r of db.prepare(`SELECT post_id FROM aplayer_player WHERE post_id IS NOT NULL`).all() as { post_id: number }[]) {
    hasMusic.add(r.post_id);
  }
} catch {
  /* table optional */
}

// ---------- posts ----------

interface FileInfo {
  file: string;
  legacyId: number | null;
  draft: boolean;
  title: string;
  body: string;
  musicUrl: string | null;
}
const postsDir = p(args.posts!);
const files: FileInfo[] = readdirSync(postsDir)
  .filter((f) => f.endsWith('.md'))
  .map((file) => {
    const text = readFileSync(join(postsDir, file), 'utf8');
    const fm = text.match(/^---\n([\s\S]*?)\n---\n/);
    if (!fm) {
      errors.push(`${file}: no front matter`);
      return { file, legacyId: null, draft: false, title: '', body: text, musicUrl: null };
    }
    const get = (key: string) => fm[1].match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))?.[1]?.trim();
    const legacy = get('legacyId');
    const music = fm[1].match(/^music:\n(?:  .*\n)*?  url:\s*(.*)$/m)?.[1];
    return {
      file,
      legacyId: legacy ? Number(legacy) : null,
      draft: get('draft') === 'true',
      title: (() => {
        try {
          return JSON.parse(get('title') ?? '""');
        } catch {
          return get('title') ?? '';
        }
      })(),
      body: text.slice(fm[0].length),
      musicUrl: music ? JSON.parse(music) : null,
    };
  });

const byLegacy = new Map<number, FileInfo>();
for (const f of files) {
  if (f.legacyId === null) continue;
  if (byLegacy.has(f.legacyId)) errors.push(`legacyId ${f.legacyId} appears in both ${byLegacy.get(f.legacyId)!.file} and ${f.file}`);
  byLegacy.set(f.legacyId, f);
}
for (const post of dbPosts) {
  const f = byLegacy.get(post.id);
  if (!f) {
    errors.push(`post ${post.id} "${post.title}" has no file in ${args.posts}`);
    continue;
  }
  const isDraft = (post.status ?? 'published') !== 'published';
  if (f.draft !== isDraft) errors.push(`${f.file}: draft=${f.draft} but DB status is ${post.status}`);
  if (f.title.trim() !== post.title.trim()) warnings.push(`${f.file}: title differs from DB ("${f.title}" vs "${post.title}")`);
  if (hasMusic.has(post.id) && !f.musicUrl) errors.push(`${f.file}: DB has an APlayer track but front matter has no music`);
}
const nonLegacy = files.filter((f) => f.legacyId === null).map((f) => f.file);
if (nonLegacy.length) warnings.push(`posts without legacyId (new or sample posts): ${nonLegacy.join(', ')}`);

// ---------- comments ----------

const sqlPath = p(args['comments-sql']!);
if (!existsSync(sqlPath)) {
  errors.push(`${args['comments-sql']} not found; run export.ts first`);
} else {
  const sqlText = readFileSync(sqlPath, 'utf8');
  const sqlCounts = new Map<string, number>();
  for (const m of sqlText.matchAll(/^INSERT OR IGNORE INTO comments \([^)]*\) VALUES \('((?:[^']|'')*)'/gm)) {
    sqlCounts.set(m[1], (sqlCounts.get(m[1]) ?? 0) + 1);
  }
  const postIdSet = new Set(dbPosts.map((x) => String(x.id)));
  for (const [postId, n] of dbCommentCounts) {
    if (!postIdSet.has(postId)) continue; // orphans are reported by export.ts
    const got = sqlCounts.get(postId) ?? 0;
    if (got !== n) errors.push(`post ${postId}: ${n} comments in DB but ${got} in ${args['comments-sql']}`);
  }
}

// ---------- images ----------

const external = new Map<string, string[]>();
for (const f of files) {
  for (const url of findImageUrls(f.body)) {
    if (/^(https?:)?\/\//i.test(url)) external.set(url, [...(external.get(url) ?? []), f.file]);
    else if (url.startsWith('/')) {
      const local = join(p(args.public!), decodeURIComponent(url.split(/[?#]/)[0]));
      if (!existsSync(local)) errors.push(`${f.file}: image ${url} does not exist under ${args.public}/`);
    }
  }
}
if (external.size) {
  warnings.push(
    `${external.size} images still load from external hosts (run fetch-images.ts, or accept):\n` +
      [...external].map(([u, fs]) => `    ${u}  [${fs.join(', ')}]`).join('\n'),
  );
}

// ---------- remote checks ----------

if (args['check-remote']) {
  const urls = [...new Set([...files.map((f) => f.musicUrl).filter(Boolean), ...external.keys()])] as string[];
  for (const url of urls) {
    try {
      const res = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(15_000) });
      if (!res.ok) warnings.push(`remote ${url} -> HTTP ${res.status}`);
      await res.body?.cancel();
    } catch (err) {
      warnings.push(`remote ${url} -> ${(err as Error).message}`);
    }
  }
}

// ---------- summary ----------

const published = dbPosts.filter((x) => (x.status ?? 'published') === 'published').length;
console.log(`DB: ${dbPosts.length} posts (${published} published), ${[...dbCommentCounts.values()].reduce((a, b) => a + b, 0)} comments`);
console.log(`Files: ${files.length} posts (${byLegacy.size} migrated)`);
for (const w of warnings) console.log(`WARN  ${w}`);
for (const e of errors) console.log(`ERROR ${e}`);
console.log(errors.length ? `\n${errors.length} error(s).` : '\nOK: migrated content matches the database.');
process.exit(errors.length ? 1 : 0);
