/**
 * Spam scoring with Cloudflare's Clef-flash decision model on Workers AI.
 *
 * Clef doesn't write text: it answers typed questions about a "state" with a probability
 * per option, which is exactly a spam/ham decision. Cost is input tokens only (3455 neurons
 * per million): a comment is roughly 300-600 tokens, so ~2 neurons, and the free 10,000
 * neurons/day covers thousands of comments. Only comments that already passed the proof
 * of work / honeypot / timing checks get here, so bots can't burn the quota.
 *
 * https://developers.cloudflare.com/workers-ai/models/clef-flash/
 */

export const AI_MODEL = '@cf/cloudflare/clef-flash';
const TIMEOUT_MS = 5000;

export const AI_KINDS = {
  normal: '正常评论',
  ad: '广告推广',
  seo: 'SEO 外链',
  scam: '诈骗/博彩/色情/贷款',
  gibberish: '无意义内容',
  abuse: '辱骂/骚扰',
} as const;
export type AiKind = keyof typeof AI_KINDS;

export interface AiResult {
  /** Probability 0..1 that the comment is spam. */
  spam: number;
  kind: AiKind | null;
}

export interface AiInput {
  name: string;
  url: string;
  body: string;
  postTitle?: string;
}

const SPAM_QUESTION =
  'Is this blog comment spam? Spam means: advertising or self-promotion, SEO/backlink placement, ' +
  'scams, gambling, porn, loans or crypto pitches, generic praise posted only to carry a link, or ' +
  'meaningless gibberish. Ordinary reader comments are NOT spam: questions, thanks, agreement or ' +
  'disagreement, jokes, short replies, in any language, even when they include a relevant link.';

interface ClefResponse {
  answers?: {
    spam?: { type: 'noul'; noul: number };
    kind?: { type: 'choice'; choice: string; probabilities?: Record<string, number> };
  };
}

export function isAiEnabled(env: Pick<Env, 'AI' | 'AI_SPAM_CHECK'>): boolean {
  return !!env.AI && (env.AI_SPAM_CHECK ?? 'on').toLowerCase() !== 'off';
}

/** Never throws: returns null when the model is unavailable, slow or returns nonsense. */
export async function aiSpamCheck(ai: Ai, input: AiInput): Promise<AiResult | null> {
  const request = {
    model: 'clef-flash',
    state: {
      site: 'kirikira.moe — a personal Chinese-language blog (Linux, networking/proxies, anime, daily life)',
      post_title: input.postTitle ?? '',
      commenter_name: input.name,
      commenter_website: input.url || '(none)',
      comment: input.body.slice(0, 4000),
    },
    questions: {
      spam: { type: 'noul', instructions: SPAM_QUESTION },
      kind: {
        type: 'choice',
        instructions: 'What kind of comment is this?',
        criteria: {
          normal: 'A genuine reader comment, question, reply or discussion',
          ad: 'Advertising or promotion of a product, service, shop or channel',
          seo: 'Posted mainly to place links for search ranking',
          scam: 'Scam, phishing, gambling, porn, loans, or crypto/investment pitch',
          gibberish: 'Random characters, keyboard mashing or meaningless text',
          abuse: 'Insults, harassment or hate',
        },
      },
    },
  };
  try {
    const run = (ai as unknown as { run: (model: string, body: unknown) => Promise<unknown> }).run(AI_MODEL, request);
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS));
    const res = (await Promise.race([run, timeout])) as ClefResponse | null;
    const p = res?.answers?.spam?.noul;
    if (typeof p !== 'number' || !Number.isFinite(p)) return null;
    const choice = res?.answers?.kind?.choice;
    return { spam: Math.min(1, Math.max(0, p)), kind: choice && choice in AI_KINDS ? (choice as AiKind) : null };
  } catch {
    return null;
  }
}
