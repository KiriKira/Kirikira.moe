#!/usr/bin/env node
/**
 * Measure the comment AI prompt against real Workers AI before trusting it.
 *
 *   export CLOUDFLARE_ACCOUNT_ID=...  CLOUDFLARE_API_TOKEN=...   # token: Workers AI Read
 *   node scripts/eval/eval-spam.ts                       # scripts/eval/spam-samples.json
 *   node scripts/eval/eval-spam.ts my-samples.json --compare
 *
 * Each sample is { label: "spam" | "ham", name, email, url, body, postTitle?, postExcerpt?,
 * history?: { total, samples[] } }. Add real comments you've labelled (especially the ones
 * the filter got wrong) and re-run after any change to src/lib/comments/ai.ts.
 *
 * Prints every sample's P(spam) and, per threshold, how much spam is caught and which
 * genuine comments would be hidden. --compare also runs the previous multi-question prompt
 * (five yes/no questions) to show whether the single choice question is actually better.
 * Cost: ~1-2 neurons per sample per prompt.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AI_MODEL, buildRequest, buildState, parseResponse, type AiInput } from '../../src/lib/comments/ai.ts';

interface Sample extends AiInput {
  label: 'spam' | 'ham';
  note?: string;
}

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--')) ?? resolve(import.meta.dirname, 'spam-samples.json');
const compare = args.includes('--compare');
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!account || !token) {
  console.error('Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (Workers AI permission).');
  process.exit(2);
}
const samples: Sample[] = JSON.parse(readFileSync(file, 'utf8'));

async function run(body: unknown): Promise<unknown> {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${AI_MODEL}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { success?: boolean; result?: unknown; errors?: unknown };
  if (!res.ok || json.success === false) throw new Error(`HTTP ${res.status}: ${JSON.stringify(json.errors ?? json).slice(0, 300)}`);
  return json.result ?? json;
}

/** The previous prompt (before this commit), kept only for comparison. */
function legacyRequest(s: Sample) {
  const yes = (instructions: string) => ({ type: 'noul', instructions });
  return {
    model: 'clef-flash',
    state: buildState(s),
    questions: {
      spam: yes('Is this comment spam (promotion, link building, scam, or not a real reader reacting to this post)?'),
      generic: yes('Is the comment generic boilerplate that could be pasted under any article on any website?'),
      commercial: yes("Do the commenter's name, website or email look like a business or marketing keyword rather than a person?"),
      onTopic: yes("Does the comment relate to this post's title or summary, or to the blog's subjects?"),
      sales: yes('Is this a sales or business message, such as asking for a price?'),
    },
  };
}

async function scoreSingle(s: Sample): Promise<number> {
  const r = parseResponse(await run(buildRequest(s)));
  if (!r) throw new Error('no verdict in response');
  return 1 - r.reader;
}

async function scoreLegacy(s: Sample): Promise<number> {
  const r = (await run(legacyRequest(s))) as { answers?: { spam?: { noul?: number } } };
  const p = r.answers?.spam?.noul;
  if (typeof p !== 'number') throw new Error('no spam answer');
  return p;
}

async function evaluate(name: string, score: (s: Sample) => Promise<number>) {
  const scored: { s: Sample; p: number }[] = [];
  for (let i = 0; i < samples.length; i += 4) {
    const batch = samples.slice(i, i + 4);
    const ps = await Promise.all(batch.map((s) => score(s).catch((e) => (console.error(`  ! ${s.name}: ${e.message}`), NaN))));
    batch.forEach((s, j) => scored.push({ s, p: ps[j] }));
  }
  console.log(`\n=== ${name}`);
  for (const { s, p } of scored) {
    const flag = s.label === 'spam' ? 'SPAM' : 'ham ';
    console.log(`  ${flag}  P(spam)=${Number.isNaN(p) ? ' err' : p.toFixed(2)}  ${s.name.padEnd(22).slice(0, 22)} ${s.body.replace(/\s+/g, ' ').slice(0, 50)}`);
  }
  const valid = scored.filter((x) => !Number.isNaN(x.p));
  const spam = valid.filter((x) => x.s.label === 'spam');
  const ham = valid.filter((x) => x.s.label === 'ham');
  // AUC: probability that a random spam scores above a random ham (1.0 = perfect ranking).
  let wins = 0;
  for (const a of spam) for (const b of ham) wins += a.p > b.p ? 1 : a.p === b.p ? 0.5 : 0;
  console.log(`  ranking quality (AUC): ${(wins / Math.max(1, spam.length * ham.length)).toFixed(3)}`);
  for (const t of [0.5, 0.6, 0.7, 0.85]) {
    const caught = spam.filter((x) => x.p >= t).length;
    const hurt = ham.filter((x) => x.p >= t);
    console.log(
      `  threshold ${t.toFixed(2)}: catches ${caught}/${spam.length} spam, hides ${hurt.length}/${ham.length} genuine` +
        (hurt.length ? ` (${hurt.map((x) => x.s.name).join(', ')})` : ''),
    );
  }
}

console.log(`${samples.length} samples from ${file}`);
await evaluate('single choice question (current, src/lib/comments/ai.ts)', scoreSingle);
if (compare) await evaluate('five yes/no questions (previous prompt)', scoreLegacy);
console.log('\nThe filter flags P(spam) >= 0.85 outright and 0.60-0.85 when another rule agrees (see spam.ts).');
