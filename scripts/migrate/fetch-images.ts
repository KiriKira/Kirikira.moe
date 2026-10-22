#!/usr/bin/env node
/**
 * Re-host images referenced by posts so the site no longer depends on old image hosts
 * (most posts used i.yusa.me).
 *
 *   node scripts/migrate/fetch-images.ts [--dry-run] [--skip-hosts a.com,b.com] [--media-dir path]
 *
 * For every image in src/content/posts/*.md:
 *   - http(s) URL         -> downloaded to public/uploads/legacy/<hash>.<ext>; if the origin is
 *                            dead, falls back to the Wayback Machine's raw copy (id_ URL)
 *   - /static/... URL     -> copied from legacy/blog/static/...
 *   - /media/... URL      -> copied from --media-dir (the old server's MEDIA_ROOT) if given
 * and the reference in the Markdown is rewritten to /uploads/legacy/... .
 * Writes data/images.json (what happened to each URL). Safe to re-run.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { findImageUrls } from './lib.ts';

const { values: args } = parseArgs({
  options: {
    posts: { type: 'string', default: 'src/content/posts' },
    out: { type: 'string', default: 'public/uploads/legacy' },
    'public-prefix': { type: 'string', default: '/uploads/legacy' },
    'legacy-static': { type: 'string', default: 'legacy/blog/static' },
    'media-dir': { type: 'string' },
    'skip-hosts': { type: 'string', default: '' },
    manifest: { type: 'string', default: 'data/images.json' },
    concurrency: { type: 'string', default: '4' },
    'dry-run': { type: 'boolean', default: false },
  },
});

const root = resolve(import.meta.dirname, '../..');
const p = (rel: string) => resolve(root, rel);
const outDir = p(args.out!);
const skipHosts = new Set(args['skip-hosts']!.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean));
const MAX_BYTES = 25 * 1024 * 1024;
const EXT_BY_TYPE: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/bmp': '.bmp',
  'image/avif': '.avif',
};

type Result =
  | { status: 'downloaded' | 'wayback' | 'copied' | 'exists'; local: string; source: string }
  | { status: 'failed' | 'skipped'; reason: string };

function sniffType(buf: Uint8Array): string | null {
  const b = buf;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) return 'image/webp';
  if (b[0] === 0x42 && b[1] === 0x4d) return 'image/bmp';
  const head = new TextDecoder().decode(b.slice(0, 256)).trimStart();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'image/svg+xml';
  return null;
}

async function download(url: string): Promise<{ bytes: Uint8Array; type: string } | { error: string }> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
      headers: { 'user-agent': 'kirikira.moe-migration/1.0 (+https://kirikira.moe)' },
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength === 0) return { error: 'empty body' };
    if (bytes.byteLength > MAX_BYTES) return { error: `too large (${bytes.byteLength} bytes)` };
    // Trust the bytes, not the header: dead image hosts love to answer 200 with an HTML page.
    const type = sniffType(bytes);
    if (!type) return { error: `not an image (content-type ${res.headers.get('content-type')})` };
    return { bytes, type };
  } catch (err) {
    return { error: String((err as Error).message ?? err) };
  }
}

const localName = (url: string, ext: string) => `${createHash('sha1').update(url).digest('hex').slice(0, 12)}${ext}`;

async function handle(url: string): Promise<Result> {
  // Site-relative or kirikira.moe static/media files from the Django site
  const local = url.match(/^(?:https?:\/\/(?:www\.)?kirikira\.moe)?\/(static|media)\/(.+)$/i);
  if (local) {
    const [, kind, rest] = local;
    const base = kind.toLowerCase() === 'static' ? p(args['legacy-static']!) : args['media-dir'] ? resolve(args['media-dir']) : null;
    if (!base) return { status: 'failed', reason: `/${kind}/ file; pass --media-dir with the old MEDIA_ROOT` };
    const src = join(base, decodeURIComponent(rest.split('?')[0]));
    if (!existsSync(src)) return { status: 'failed', reason: `not found locally: ${src}` };
    const name = localName(url, extname(src).toLowerCase() || '.bin');
    if (!args['dry-run']) copyFileSync(src, join(outDir, name));
    return { status: 'copied', local: `${args['public-prefix']}/${name}`, source: src };
  }

  if (!/^(https?:)?\/\//i.test(url)) return { status: 'skipped', reason: 'relative URL, left as is' };
  const absolute = url.startsWith('//') ? `https:${url}` : url;
  const host = new URL(absolute).hostname.toLowerCase();
  if (skipHosts.has(host)) return { status: 'skipped', reason: `host ${host} skipped` };

  // Already downloaded on a previous run?
  const known = Object.values(EXT_BY_TYPE)
    .map((ext) => localName(absolute, ext))
    .find((name) => existsSync(join(outDir, name)));
  if (known) return { status: 'exists', local: `${args['public-prefix']}/${known}`, source: absolute };

  if (args['dry-run']) return { status: 'skipped', reason: 'dry run' };

  let got = await download(absolute);
  let status: 'downloaded' | 'wayback' = 'downloaded';
  let source = absolute;
  if ('error' in got) {
    const firstError = got.error;
    source = `https://web.archive.org/web/0id_/${absolute}`;
    got = await download(source);
    status = 'wayback';
    if ('error' in got) return { status: 'failed', reason: `origin: ${firstError}; wayback: ${got.error}` };
  }
  const name = localName(absolute, EXT_BY_TYPE[got.type] ?? '.bin');
  writeFileSync(join(outDir, name), got.bytes);
  return { status, local: `${args['public-prefix']}/${name}`, source };
}

// ---------- main ----------

const postsDir = p(args.posts!);
const files = readdirSync(postsDir).filter((f) => f.endsWith('.md'));
const usage = new Map<string, string[]>();
for (const f of files) {
  for (const url of findImageUrls(readFileSync(join(postsDir, f), 'utf8'))) {
    if (url.startsWith(`${args['public-prefix']}/`)) continue; // already migrated
    usage.set(url, [...(usage.get(url) ?? []), f]);
  }
}

if (!args['dry-run']) mkdirSync(outDir, { recursive: true });
const urls = [...usage.keys()];
const results = new Map<string, Result>();
const limit = Math.max(1, Number(args.concurrency) || 4);
let next = 0;
await Promise.all(
  Array.from({ length: limit }, async () => {
    while (next < urls.length) {
      const url = urls[next++];
      const r = await handle(url);
      results.set(url, r);
      console.log(`${r.status.padEnd(10)} ${url}${'reason' in r ? `  (${r.reason})` : ''}`);
    }
  }),
);

// Rewrite references
let rewritten = 0;
if (!args['dry-run']) {
  for (const f of files) {
    const path = join(postsDir, f);
    const before = readFileSync(path, 'utf8');
    let after = before;
    for (const [url, r] of results) {
      if ('local' in r) after = after.split(url).join(r.local);
    }
    if (after !== before) {
      writeFileSync(path, after);
      rewritten++;
    }
  }
}

const manifestPath = p(args.manifest!);
const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
const manifest = { ...previous };
for (const [url, r] of results) manifest[url] = { ...r, posts: usage.get(url) };
if (!args['dry-run']) {
  mkdirSync(resolve(manifestPath, '..'), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

const count = (s: string) => [...results.values()].filter((r) => r.status === s).length;
console.log(
  `\n${urls.length} image URLs: ${count('downloaded')} downloaded, ${count('wayback')} from Wayback, ${count('copied')} copied, ` +
    `${count('exists')} already present, ${count('skipped')} skipped, ${count('failed')} FAILED. ${rewritten} post files rewritten.` +
    (count('failed') ? `\nFailed URLs are listed in ${args.manifest}; fix them by hand or leave them external.` : ''),
);
