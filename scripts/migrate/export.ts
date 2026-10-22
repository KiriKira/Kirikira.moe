#!/usr/bin/env node
/**
 * Export the Django blog database to the new site.
 *
 *   node scripts/migrate/export.ts --db data/db.sqlite3 [--slugs data/slugs.json] [--force] [--dry-run]
 *
 * Reads (never writes) the SQLite file and produces:
 *   src/content/posts/<slug>.md   one file per post (drafts included, with draft: true)
 *   data/comments.sql             INSERT OR IGNORE statements for D1 (private: has emails)
 *   public/_redirects             generated block: old category/post URLs -> new URLs
 *   data/migration-report.md      counts and everything a human should double-check
 *   data/legacy-urls.txt          every old public URL, for scripts/check-urls.mjs
 *
 * Requires Node >= 22.18 (built-in node:sqlite + TypeScript type stripping).
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  autoExcerpt,
  findImageUrls,
  parseDjangoDate,
  pathSegment,
  renderFrontMatter,
  sql,
  transformBody,
  type Warning,
} from './lib.ts';
import { fingerprintBody } from '../../src/lib/comments/spam.ts';

const { values: args } = parseArgs({
  options: {
    db: { type: 'string', default: 'data/db.sqlite3' },
    out: { type: 'string', default: 'src/content/posts' },
    slugs: { type: 'string' },
    'comments-sql': { type: 'string', default: 'data/comments.sql' },
    report: { type: 'string', default: 'data/migration-report.md' },
    redirects: { type: 'string', default: 'public/_redirects' },
    urls: { type: 'string', default: 'data/legacy-urls.txt' },
    'no-auto-excerpt': { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
  },
});

const root = resolve(import.meta.dirname, '../..');
const p = (rel: string) => resolve(root, rel);

if (!existsSync(p(args.db!))) {
  console.error(`Database not found: ${args.db}. Put the production db.sqlite3 in data/ (gitignored).`);
  process.exit(1);
}

const db = new DatabaseSync(p(args.db!), { readOnly: true });

// ---------- schema sanity ----------

const tables = new Set(
  (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as { name: string }[]).map((r) => r.name),
);
const required = ['blog_post', 'blog_category', 'comments_comment'];
const missing = required.filter((t) => !tables.has(t));
if (missing.length) {
  console.error(`Missing tables: ${missing.join(', ')}. Is this the kirikira.moe Django database?`);
  process.exit(1);
}
const columns = (table: string) =>
  new Set((db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name));
const postCols = columns('blog_post');

// ---------- load ----------

interface PostRow {
  id: number;
  title: string;
  body: string;
  created_time: string;
  modified_time: string;
  excerpt: string | null;
  category_id: number | null;
  status: string | null;
}
interface CommentRow {
  id: number;
  name: string;
  email: string | null;
  url: string | null;
  text: string;
  created_time: string;
  post_id: number;
}

const categories = new Map(
  (db.prepare(`SELECT id, name FROM blog_category`).all() as { id: number; name: string }[]).map((r) => [r.id, r.name.trim()]),
);
const tagsByPost = new Map<number, string[]>();
if (tables.has('blog_tag') && tables.has('blog_post_tags')) {
  const rows = db
    .prepare(`SELECT pt.post_id AS post_id, t.name AS name FROM blog_post_tags pt JOIN blog_tag t ON t.id = pt.tag_id ORDER BY t.name`)
    .all() as { post_id: number; name: string }[];
  for (const r of rows) tagsByPost.set(r.post_id, [...(tagsByPost.get(r.post_id) ?? []), r.name.trim()]);
}
const musicByPost = new Map<number, { title: string; author: string; url: string; pic: string }>();
if (tables.has('aplayer_player')) {
  for (const r of db.prepare(`SELECT title, author, url, pic, post_id FROM aplayer_player WHERE post_id IS NOT NULL`).all() as {
    title: string;
    author: string;
    url: string;
    pic: string;
    post_id: number;
  }[]) {
    musicByPost.set(r.post_id, r);
  }
}
const posts = db
  .prepare(
    `SELECT id, title, body, created_time, modified_time, excerpt, category_id,
            ${postCols.has('status') ? 'status' : `'published' AS status`}
     FROM blog_post ORDER BY id`,
  )
  .all() as unknown as PostRow[];
const comments = db
  .prepare(`SELECT id, name, email, url, text, created_time, post_id FROM comments_comment ORDER BY id`)
  .all() as unknown as CommentRow[];

const slugMap: Record<string, string> = args.slugs ? JSON.parse(readFileSync(p(args.slugs), 'utf8')) : {};
for (const [id, slug] of Object.entries(slugMap)) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error(`Bad slug for post ${id}: "${slug}" (use a-z, 0-9 and -)`);
}

// ---------- posts ----------

const report: string[] = [];
const warningsByPost: { id: number; title: string; warnings: Warning[] }[] = [];
const images = new Map<string, number[]>();
const redirects: string[] = [];
const legacyUrls = new Set<string>(['/', '/rss/', '/sitemap.xml']);
const written: string[] = [];
const skipped: string[] = [];
const postIds = new Set<number>();
let drafts = 0;

const outDir = p(args.out!);
if (!args['dry-run']) mkdirSync(outDir, { recursive: true });

for (const post of posts) {
  postIds.add(post.id);
  const slug = slugMap[String(post.id)] ?? String(post.id);
  const isDraft = (post.status ?? 'published') !== 'published';
  if (isDraft) drafts++;
  const { body, warnings } = transformBody(post.body ?? '', post.title);
  const category = (post.category_id !== null && categories.get(post.category_id)) || '未分类';
  let excerpt = (post.excerpt ?? '').trim();
  if (!excerpt && !args['no-auto-excerpt']) {
    excerpt = autoExcerpt(body);
    if (excerpt) warnings.push({ kind: 'auto-excerpt', detail: excerpt.slice(0, 40) });
  }
  const created = parseDjangoDate(post.created_time);
  const modified = post.modified_time ? parseDjangoDate(post.modified_time) : undefined;
  const music = musicByPost.get(post.id);

  const file =
    renderFrontMatter({
      title: post.title.trim(),
      slug,
      date: created,
      updated: modified && modified.valueOf() > created.valueOf() ? modified : undefined,
      category,
      tags: tagsByPost.get(post.id) ?? [],
      excerpt: excerpt || undefined,
      draft: isDraft,
      legacyId: post.id,
      music: music ? { title: music.title, author: music.author ?? '', url: music.url, pic: music.pic || undefined } : undefined,
    }) +
    '\n\n' +
    body;

  for (const url of findImageUrls(body)) images.set(url, [...(images.get(url) ?? []), post.id]);
  if (warnings.length) warningsByPost.push({ id: post.id, title: post.title, warnings });

  if (!isDraft) {
    legacyUrls.add(`/post/${post.id}/`);
    if (slug !== String(post.id)) {
      redirects.push(`/post/${post.id}/ /post/${slug}/ 301`, `/post/${post.id} /post/${slug}/ 301`);
    }
  }

  const target = join(outDir, `${slug}.md`);
  if (existsSync(target) && !args.force) {
    skipped.push(`${slug}.md`);
    continue;
  }
  if (!args['dry-run']) writeFileSync(target, file);
  written.push(`${slug}.md`);
}

// Category pages: /category/<pk>/ -> /category/<name>/
const publishedByCategory = new Map<number, number>();
for (const post of posts) {
  if ((post.status ?? 'published') === 'published' && post.category_id !== null) {
    publishedByCategory.set(post.category_id, (publishedByCategory.get(post.category_id) ?? 0) + 1);
  }
}
for (const [id, name] of categories) {
  if (!publishedByCategory.get(id)) continue; // no page for empty categories on the new site
  redirects.push(`/category/${id}/ /category/${pathSegment(name)}/ 301`, `/category/${id} /category/${pathSegment(name)}/ 301`);
  legacyUrls.add(`/category/${id}/`);
}
const publishedCount = posts.filter((x) => (x.status ?? 'published') === 'published').length;
for (let page = 1; page <= Math.max(1, Math.ceil(publishedCount / 10)); page++) legacyUrls.add(`/page/${page}/`);

// ---------- comments ----------

const sqlLines = [
  '-- Generated by scripts/migrate/export.ts. Contains personal data: do not commit.',
  '-- Apply: npx wrangler d1 execute kirikira --remote --file data/comments.sql',
  '-- Idempotent: legacy_id is UNIQUE, so re-running skips rows already imported.',
];
let importedComments = 0;
const orphanComments: number[] = [];
const commentsPerPost = new Map<number, number>();
for (const c of comments) {
  if (!postIds.has(c.post_id)) {
    orphanComments.push(c.id);
    continue;
  }
  const createdAt = parseDjangoDate(c.created_time).toISOString();
  const body = (c.text ?? '').replace(/\r\n?/g, '\n');
  sqlLines.push(
    `INSERT OR IGNORE INTO comments (post_id, parent_id, name, email, url, body, body_fp, status, spam_score, created_at, legacy_id) VALUES (${[
      sql(String(c.post_id)),
      'NULL',
      sql((c.name ?? '').trim() || '匿名'),
      sql(c.email?.trim() || null),
      sql(c.url?.trim() || null),
      sql(body),
      sql(fingerprintBody(body)),
      sql('published'),
      0,
      sql(createdAt),
      c.id,
    ].join(', ')});`,
  );
  importedComments++;
  commentsPerPost.set(c.post_id, (commentsPerPost.get(c.post_id) ?? 0) + 1);
}

// ---------- write outputs ----------

const write = (rel: string, content: string) => {
  if (args['dry-run']) return;
  mkdirSync(dirname(p(rel)), { recursive: true });
  writeFileSync(p(rel), content);
};

write(args['comments-sql']!, `${sqlLines.join('\n')}\n`);
write(args.urls!, `${[...legacyUrls].join('\n')}\n`);

const BEGIN = '# BEGIN generated by scripts/migrate/export.ts — do not edit by hand';
const END = '# END generated';
const redirectsPath = p(args.redirects!);
const existing = existsSync(redirectsPath) ? readFileSync(redirectsPath, 'utf8') : `${BEGIN}\n${END}\n`;
const block = `${BEGIN}\n${redirects.join('\n')}${redirects.length ? '\n' : ''}${END}`;
const nextRedirects = existing.includes(BEGIN)
  ? existing.replace(new RegExp(`${BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${END}`), block)
  : `${existing.trimEnd()}\n\n${block}\n`;
if (!args['dry-run']) writeFileSync(redirectsPath, nextRedirects);

// ---------- report ----------

const externalImages = [...images.keys()].filter((u) => /^(https?:)?\/\//i.test(u));
report.push(
  '# Migration report',
  '',
  `Generated ${new Date().toISOString()} from \`${args.db}\`.`,
  '',
  '## Counts',
  '',
  `| what | count |`,
  `|---|---|`,
  `| posts in DB | ${posts.length} |`,
  `| published | ${publishedCount} |`,
  `| drafts (exported with draft: true) | ${drafts} |`,
  `| post files written | ${written.length} |`,
  `| post files skipped (exist; use --force) | ${skipped.length} |`,
  `| categories | ${categories.size} |`,
  `| posts with music | ${musicByPost.size} |`,
  `| comments in DB | ${comments.length} |`,
  `| comments exported to SQL | ${importedComments} |`,
  `| orphan comments (post missing, skipped) | ${orphanComments.length} |`,
  `| redirect rules | ${redirects.length} |`,
  `| distinct image URLs | ${images.size} (external: ${externalImages.length}) |`,
  '',
);
if (skipped.length) report.push('## Skipped files', '', ...skipped.map((s) => `- ${s}`), '');
if (orphanComments.length) report.push('## Orphan comments', '', `Comment ids: ${orphanComments.join(', ')}`, '');
report.push('## Comments per post', '', ...[...commentsPerPost].map(([id, n]) => `- post ${id}: ${n}`), '');
report.push(
  '## Things to review by hand',
  '',
  'Kinds: `details-converted` (pymdownx `???` blocks -> `<details>`), `inlinehilite-converted`',
  '(`` `#!lang code` `` -> plain inline code), `single-tilde` (`~x~` renders as <sub>, exactly like the',
  'old site; check it was meant that way, e.g. "3~5分钟到10~20" also becomes subscript), `raw-embed`, `auto-excerpt`.',
  '',
);
for (const w of warningsByPost) {
  report.push(`### post ${w.id}: ${w.title}`, '');
  for (const x of w.warnings) report.push(`- **${x.kind}** ${x.detail.replace(/\n/g, ' ')}`);
  report.push('');
}
report.push(
  '## Image URLs',
  '',
  'Run `node scripts/migrate/fetch-images.ts` to download external images into public/uploads/legacy/.',
  '',
  ...[...images].map(([u, ids]) => `- ${u} (posts ${ids.join(', ')})`),
  '',
);
write(args.report!, `${report.join('\n')}\n`);

console.log(
  `${args['dry-run'] ? '[dry run] ' : ''}posts: ${written.length} written, ${skipped.length} skipped; ` +
    `comments: ${importedComments} -> ${args['comments-sql']}; redirects: ${redirects.length}; ` +
    `images: ${images.size} (${externalImages.length} external). Report: ${args.report}`,
);
db.close();
