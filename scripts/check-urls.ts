#!/usr/bin/env node
/**
 * Check that every URL of the old site still works on the new one.
 *
 *   node scripts/check-urls.ts http://localhost:8787 [data/legacy-urls.txt]
 *   node scripts/check-urls.ts https://kirikira-moe.<account>.workers.dev
 *
 * Each URL must end in HTTP 200, directly or after at most 3 redirects (301/308 only:
 * a 302 would not pass search ranking to the new URL).
 */
import { readFileSync } from 'node:fs';

const [base, listFile = 'data/legacy-urls.txt'] = process.argv.slice(2);
if (!base) {
  console.error('usage: node scripts/check-urls.ts <base-url> [url-list-file]');
  process.exit(2);
}
const paths = readFileSync(listFile, 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'));

let failed = 0;
for (const path of paths) {
  let url = new URL(path, base).toString();
  const chain: string[] = [];
  let ok = false;
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, { redirect: 'manual' });
    chain.push(String(res.status));
    await res.body?.cancel();
    if (res.status === 200) {
      ok = true;
      break;
    }
    if (res.status === 301 || res.status === 308) {
      url = new URL(res.headers.get('location')!, url).toString();
      continue;
    }
    break;
  }
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${path}  ${chain.join(' -> ')}${chain.length > 1 ? `  (${new URL(url).pathname})` : ''}`);
}
console.log(`\n${paths.length - failed}/${paths.length} legacy URLs OK.`);
process.exit(failed ? 1 : 0);
