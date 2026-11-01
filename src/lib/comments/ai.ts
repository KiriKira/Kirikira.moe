/**
 * Spam judgement with Cloudflare's Clef-flash decision model on Workers AI.
 *
 * Clef answers typed questions about a "state" with a probability per option. Lessons
 * from the first versions of this file (and from the model's own docs: "be literal and
 * specific"; answers stuck near 0.5 mean the question is ambiguous):
 *
 *  - Ask ONE `choice` question with mutually exclusive, concretely described options.
 *    Probabilities over the options sum to 1, so the model has to commit. Several
 *    overlapping yes/no questions ("spam?", "generic?", "commercial?", "on topic?") each
 *    landed around 50% and only added noise once combined with hand-made weights.
 *  - Give it what a human moderator would look at, as a plain record: the post, the form
 *    fields exactly as submitted, the comment, and the same author's other comments on the
 *    site (bots reveal themselves across comments: "Hi, I wanted to know your price" in a
 *    new language each time), and the blog's language policy (Chinese >> English > Japanese;
 *    anything else is a bot). No pre-digested "facts" (link counts, guessed language
 *    codes): they are noise and bias.
 *
 * Use scripts/eval/eval-spam.ts to measure changes to this prompt against real Workers AI.
 *
 * Cost is input tokens only (3455 neurons per million): a few hundred tokens per comment,
 * ~1-2 neurons; the free 10,000 neurons/day covers thousands of comments. Only comments
 * that passed the proof of work / honeypot / timing checks are sent.
 *
 * https://developers.cloudflare.com/workers-ai/models/clef-flash/
 */

export const AI_MODEL = '@cf/cloudflare/clef-flash';
const TIMEOUT_MS = 6000;

export const AI_KINDS = {
  reader: '真实读者',
  promotion: '推广/外链',
  template: '群发模板/套话',
  scam: '诈骗/违规',
} as const;
export type AiKind = keyof typeof AI_KINDS;

export interface AiResult {
  /** P(written by a real reader of this post). */
  reader: number;
  /** Most likely option. */
  kind: AiKind;
  probabilities: Record<AiKind, number>;
}

export interface AiInput {
  name: string;
  url: string;
  email?: string;
  body: string;
  postTitle?: string;
  postExcerpt?: string;
  /** The same author's other comments on the site (newest first), with the total count. */
  history?: { total: number; samples: string[] };
}

export const VERDICT_QUESTION = {
  type: 'choice',
  instructions:
    'Who wrote this comment, and why? Judge from the comment together with the name, email and ' +
    'website fields, the language it is written in, the post it was left under, and the same author\'s other comments.',
  criteria: {
    reader:
      'A person who actually read this blog, writing to the author or other readers in Chinese, English or ' +
      'Japanese: reacting to the post, asking or answering a question, thanking, joking or chatting. Any length; ' +
      'short replies, emoji and emoticons such as "=W=" or "233" count. Linking their own site or a relevant ' +
      'resource is fine, and so is a fellow blogger introducing their own blog or proposing to exchange links (友链).',
    promotion:
      'Advertising: the comment exists to promote a product, service, shop, tool, channel or website, or to ' +
      'place backlinks for search ranking (often through the website field, a keyword used as the name, or a list of domains).',
    template:
      'Bot or mass-posted text that was not written for this post: generic flattery or filler that would fit under ' +
      'any article on any website, word salad, a business message sent to many sites (for example asking for ' +
      '"your price"), or any comment written in a language other than Chinese, English or Japanese.',
    scam: 'Scams and illicit offers: gambling, porn, loans, crypto or investment schemes, phishing.',
  },
} as const;

const quote = (s: string, max: number) => {
  const t = s.trim().replace(/\s+\n/g, '\n');
  return t.length > max ? `${t.slice(0, max)}…` : t;
};

/** The record Clef reads: what a moderator would see. Exported for tests and the eval script. */
export function buildState(input: AiInput): string {
  const lines = [
    'A comment submitted on kirikira.moe, a personal blog written in Chinese by one person',
    '(topics: Linux, networking and proxies, anime, games, daily life).',
    'Its readers comment in Chinese (most of them), English (some) or Japanese (a few). Comments in any',
    'other language (Russian, Hungarian, Latin, Croatian, Portuguese, French, ...) come from spam bots.',
    '',
    `Post: ${input.postTitle?.trim() || '(unknown)'}`,
  ];
  if (input.postExcerpt?.trim()) lines.push(`Post summary: ${quote(input.postExcerpt, 300)}`);
  lines.push(
    '',
    'Comment form, as submitted:',
    `Name: ${input.name}`,
    `Email: ${input.email?.trim() || '(not given)'}`,
    `Website: ${input.url?.trim() || '(not given)'}`,
    'Comment:',
    '<<<',
    quote(input.body, 3000),
    '>>>',
  );
  const h = input.history;
  if (h && h.total > 0) {
    lines.push('', `The same author's other comments on this blog: ${h.total}. Most recent:`);
    for (const s of h.samples.slice(0, 3)) lines.push(`- "${quote(s, 200).replace(/\n/g, ' ')}"`);
  } else {
    lines.push('', 'This author has no other comments on this blog.');
  }
  return lines.join('\n');
}

export function buildRequest(input: AiInput) {
  return { model: 'clef-flash', state: buildState(input), questions: { verdict: VERDICT_QUESTION } };
}

interface ClefChoice {
  type: 'choice';
  choice: string;
  probabilities?: Record<string, number>;
}

/** Parse a Clef response; null when it doesn't contain a usable verdict. */
export function parseResponse(res: unknown): AiResult | null {
  const verdict = (res as { answers?: { verdict?: ClefChoice } } | null)?.answers?.verdict;
  const raw = verdict?.probabilities;
  if (!raw) return null;
  const probabilities = {} as Record<AiKind, number>;
  for (const k of Object.keys(AI_KINDS) as AiKind[]) {
    const p = raw[k];
    if (typeof p !== 'number' || !Number.isFinite(p)) return null;
    probabilities[k] = Math.min(1, Math.max(0, p));
  }
  const kind = (Object.keys(probabilities) as AiKind[]).reduce((a, b) => (probabilities[b] > probabilities[a] ? b : a));
  return { reader: probabilities.reader, kind, probabilities };
}

export function isAiEnabled(env: Pick<Env, 'AI' | 'AI_SPAM_CHECK'>): boolean {
  return !!env.AI && (env.AI_SPAM_CHECK ?? 'on').toLowerCase() !== 'off';
}

/** Never throws: returns null when the model is unavailable, slow or returns nonsense. */
export async function aiSpamCheck(ai: Ai, input: AiInput): Promise<AiResult | null> {
  try {
    const run = (ai as unknown as { run: (model: string, body: unknown) => Promise<unknown> }).run(AI_MODEL, buildRequest(input));
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS));
    return parseResponse(await Promise.race([run, timeout]));
  } catch {
    return null;
  }
}
