import { imageSize } from 'image-size';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Build-time image dimensions for Markdown images, so the page can reserve space
 * (no layout shift), size images by orientation and give the lightbox real sizes.
 *
 * Local paths (/uploads/...) are read from public/; remote URLs (R2, legacy hosts)
 * are fetched once — only the first bytes when the server honours Range — and the
 * result is cached in node_modules/.cache. Set SKIP_IMAGE_PROBE=1 for offline builds;
 * unknown sizes fall back to measuring in the browser.
 */

const ROOT = process.cwd();
const CACHE_FILE = join(ROOT, 'node_modules/.cache/kirikira/image-sizes.json');
const HEAD_BYTES = 256 * 1024;
const MAX_BYTES = 30 * 1024 * 1024;

let cache = null;
let dirty = false;
const inflight = new Map();

function loadCache() {
  if (cache) return cache;
  try {
    cache = existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, 'utf8')) : {};
  } catch {
    cache = {};
  }
  return cache;
}

function saveCache() {
  if (!dirty) return;
  try {
    mkdirSync(dirname(CACHE_FILE), { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify(cache));
    dirty = false;
  } catch {
    /* cache is an optimisation only */
  }
}

function dims(bytes) {
  const r = imageSize(bytes);
  if (!r.width || !r.height) return null;
  // EXIF orientations 5-8 rotate the image by 90°.
  return r.orientation && r.orientation >= 5 ? { width: r.height, height: r.width } : { width: r.width, height: r.height };
}

async function fetchBytes(url, range) {
  const res = await fetch(url, {
    headers: range ? { range: `bytes=0-${HEAD_BYTES - 1}` } : {},
    signal: AbortSignal.timeout(15_000),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const len = Number(res.headers.get('content-length') ?? 0);
  if (!range && len > MAX_BYTES) throw new Error('too large');
  return new Uint8Array(await res.arrayBuffer());
}

async function probeUncached(src) {
  if (/^\/(?!\/)/.test(src)) {
    const file = resolve(ROOT, 'public', decodeURIComponent(src.split(/[?#]/)[0]).slice(1));
    if (!file.startsWith(resolve(ROOT, 'public')) || !existsSync(file)) return null;
    return dims(readFileSync(file));
  }
  if (!/^https?:\/\//i.test(src) || process.env.SKIP_IMAGE_PROBE) return null;
  try {
    return dims(await fetchBytes(src, true));
  } catch {
    // Header beyond the first chunk (big EXIF block) or no Range support: get it all.
    return dims(await fetchBytes(src, false));
  }
}

/** { width, height } or null. Never throws. */
export async function probeImage(src) {
  // Local files are cheap to read and may be replaced in place: never cache them.
  if (src.startsWith('/') && !src.startsWith('//')) return probeUncached(src).catch(() => null);
  const c = loadCache();
  if (src in c) return c[src];
  if (!inflight.has(src)) {
    inflight.set(
      src,
      probeUncached(src)
        .catch(() => null)
        .then((size) => {
          // Don't remember failures: the host may just be down during this build.
          if (size) {
            c[src] = size;
            dirty = true;
            saveCache();
          }
          return size;
        }),
    );
  }
  return inflight.get(src);
}
