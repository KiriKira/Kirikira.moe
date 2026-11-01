#!/usr/bin/env node
/**
 * Smoke test a deployed site: is it actually serving, end to end?
 *
 *   node scripts/smoke.mjs https://kirikira.moe            # full check (deploys)
 *   node scripts/smoke.mjs https://kirikira.moe --quick    # cheap check (watchdog)
 *
 * A green build is not a working site: on the preview, a Worker once answered
 * "error code: 1101" on every route (even /robots.txt) while CI was green. This
 * script requests the site like a browser and checks each layer:
 *   static assets ........ /robots.txt, /threads.json, /
 *   prerendered pages .... a real post, /archives/, /rss.xml
 *   Worker + D1 .......... /api/comments
 *   Worker + secret ...... /api/comments/challenge (signs with COMMENT_SECRET)
 *   admin gate ........... /admine/ must be the 404 page for anonymous visitors
 *   404 handling ......... an unknown path
 * Exits 0 when everything passes, 1 otherwise. Each check retries a few times so a
 * fresh deployment has a moment to propagate.
 */

const args = process.argv.slice(2);
const base = args.find((a) => !a.startsWith('--'))?.replace(/\/+$/, '');
const quick = args.includes('--quick');
if (!base || !/^https?:\/\//.test(base)) {
  console.error('usage: node scripts/smoke.mjs <https://site> [--quick]');
  process.exit(2);
}

const BROWSER = {
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 kirikira-smoke',
};
const WORKER_ERROR = /error code: 1\d{3}|Worker threw exception/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(path, headers = {}) {
  const res = await fetch(base + path, { headers: { ...BROWSER, ...headers }, redirect: 'manual', signal: AbortSignal.timeout(15_000) });
  const body = await res.text();
  return { status: res.status, type: res.headers.get('content-type') ?? '', body };
}

/** expect(res) returns an error string, or null when fine. */
async function check(name, path, expect, headers) {
  let last = 'no response';
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await get(path, headers);
      if (WORKER_ERROR.test(res.body.slice(0, 2000))) last = `Worker error page (HTTP ${res.status}): ${res.body.slice(0, 80)}`;
      else last = expect(res);
      if (!last) {
        console.log(`  ok    ${name}  ${path}`);
        return { ok: true, res };
      }
    } catch (err) {
      last = String(err?.message ?? err);
    }
    if (attempt < 4) await sleep(attempt * 3000);
  }
  console.log(`  FAIL  ${name}  ${path}  — ${last}`);
  return { ok: false };
}

const status = (want, type) => (r) =>
  r.status !== want ? `HTTP ${r.status}, expected ${want}` : type && !r.type.includes(type) ? `content-type ${r.type}, expected ${type}` : null;
const both = (...fns) => (r) => fns.map((f) => f(r)).find(Boolean) ?? null;
const contains = (needle, what) => (r) => (r.body.includes(needle) ? null : `body has no ${what ?? needle}`);

console.log(`Smoke test ${base}${quick ? ' (quick)' : ''}`);
const results = [];
const run = async (...a) => {
  const r = await check(...a);
  results.push(r.ok);
  return r;
};

await run('static asset', '/robots.txt', both(status(200), contains('User-agent')));
await run('home page', '/', both(status(200, 'text/html'), contains('Kirikira')));

// A real post and its comment thread, discovered from the prerendered index.
const threads = await run('threads index', '/threads.json', status(200, 'json'));
let postUrl = null;
let threadId = null;
if (threads.ok) {
  try {
    const entries = Object.entries(JSON.parse(threads.res.body));
    if (entries.length) [threadId, { url: postUrl }] = entries[0];
  } catch {
    /* reported below */
  }
}
if (postUrl) await run('post page', postUrl, both(status(200, 'text/html'), contains('class="prose"', 'article body')));
else console.log(`  skip  post page (${threads.ok ? 'no posts published yet' : 'threads index unavailable'})`);

if (threadId) {
  await run('comments API (Worker + D1)', `/api/comments?post=${encodeURIComponent(threadId)}`, both(status(200, 'json'), contains('"comments"')), {
    accept: 'application/json',
  });
}

if (!quick) {
  await run('archives', '/archives/', status(200, 'text/html'));
  await run('RSS feed', '/rss.xml', both(status(200), contains('<rss')));
  if (threadId) {
    await run('PoW challenge (COMMENT_SECRET)', `/api/comments/challenge?post=${encodeURIComponent(threadId)}`, both(status(200, 'json'), contains('"signature"')), {
      accept: 'application/json',
    });
  }
  await run('admin gate hides /admine', '/admine/', both(status(404, 'text/html'), contains('404')));
  await run('404 page', '/this-page-should-not-exist-404-check/', status(404, 'text/html'));
}

const failed = results.filter((ok) => !ok).length;
console.log(failed ? `\n${failed} check(s) FAILED for ${base}` : `\nAll ${results.length} checks passed for ${base}`);
process.exit(failed ? 1 : 0);
