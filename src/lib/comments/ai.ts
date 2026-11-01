/**
 * Spam scoring with Cloudflare's Clef-flash decision model on Workers AI.
 *
 * Clef doesn't write text: it answers typed questions about a "state" with a probability
 * per option. One broad "is this spam?" question misses the usual blog spam (generic
 * praise with the link hidden in the website field, a list of bare domains, a keyword as
 * the name), so we ask several narrow questions and give it the context a human moderator
 * would look at: what the post is about and in which language, the commenter's website
 * and email domain, and simple facts about the comment. spam.ts combines the answers.
 *
 * Cost is input tokens only (3455 neurons per million): ~600 tokens per comment, so
 * ~2 neurons; the free 10,000 neurons/day covers thousands of comments. Only comments that
 * passed the proof of work / honeypot / timing checks get here.
 *
 * https://developers.cloudflare.com/workers-ai/models/clef-flash/
 */

export const AI_MODEL = '@cf/cloudflare/clef-flash';
const TIMEOUT_MS = 6000;

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
  /** P(spam): promotion, link building, scams. */
  spam: number;
  kind: AiKind | null;
  /** P(boilerplate that could sit under any article on any site). */
  generic?: number;
  /** P(name / website / email look like a business, product or keyword, not a person). */
  commercial?: number;
  /** P(the comment relates to this post or the blog's subjects). */
  onTopic?: number;
}

export interface AiInput {
  name: string;
  url: string;
  email?: string;
  body: string;
  postTitle?: string;
  postExcerpt?: string;
}

const CJK_RE = /[぀-ヿ㐀-䶿一-鿿가-힯]/;
const LINK_RE = /\bhttps?:\/\/\S+|\bwww\.\S+|\b[a-z0-9-]+\.(?:com|net|org|info|biz|xyz|top|io|ai|co|me|site|online|shop|store|app|news|ru|cn)\b/gi;

function host(url: string): string {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `http://${url}`).hostname;
  } catch {
    return '';
  }
}

/** The structured "state" Clef reads. Exported for tests. */
export function buildState(input: AiInput) {
  return {
    blog: 'kirikira.moe — a personal blog written in Chinese by one person (Linux, networking and proxies, anime, games, daily life)',
    post: { title: input.postTitle ?? '', summary: input.postExcerpt ?? '' },
    commenter: {
      name: input.name,
      website: input.url || '(none)',
      website_domain: input.url ? host(input.url) : '(none)',
      email_domain: input.email?.includes('@') ? input.email.split('@').pop()!.toLowerCase() : '(none)',
    },
    comment: input.body.slice(0, 4000),
    facts: {
      comment_language: CJK_RE.test(input.body) ? 'Chinese/Japanese/Korean' : 'not Chinese',
      comment_characters: [...input.body.trim()].length,
      links_or_domains_in_comment: input.body.match(LINK_RE)?.length ?? 0,
    },
  };
}

export const QUESTIONS = {
  spam: {
    type: 'noul',
    instructions:
      'Is this comment spam? Spam = posted to promote a product, service, website or link (including SEO ' +
      'link building through the commenter website field), or a scam, gambling, adult, loan or crypto pitch, ' +
      'rather than a real reader reacting to this post. Blog spam is often vague flattery in English under a ' +
      'Chinese post, with the real payload in the website field or a list of domains. Short friendly replies, ' +
      'emoticons such as "=W=" or "233", thanks and questions from readers are NOT spam.',
  },
  generic: {
    type: 'noul',
    instructions:
      'Is the comment generic boilerplate that could be pasted under any article on any website ' +
      '(e.g. "I stumbled upon your site", "great post, keep it up", "high-quality articles"), with nothing ' +
      'specific to this post? A very short emoticon or one-word reaction is not boilerplate.',
  },
  commercial: {
    type: 'noul',
    instructions:
      "Do the commenter's name, website or email domain look like a business, product, marketing keyword " +
      '(e.g. "buy xxx", "online casino", "SEO Fiverr") or commercial/SEO site, rather than a person\'s ' +
      'nickname and personal page or a well-known platform profile?',
  },
  onTopic: {
    type: 'noul',
    instructions: "Does the comment relate to this post's title or summary, or to the blog's subjects?",
  },
  kind: {
    type: 'choice',
    instructions: 'What kind of comment is this?',
    criteria: {
      normal: 'A genuine reader comment, reaction, question or reply (including short ones and emoticons)',
      ad: 'Advertising or promotion of a product, service, shop, tool or channel',
      seo: 'Posted mainly to place links or domains for search ranking',
      scam: 'Scam, phishing, gambling, porn, loans, or crypto/investment pitch',
      gibberish: 'Random characters or meaningless machine-generated text',
      abuse: 'Insults, harassment or hate',
    },
  },
} as const;

type Noul = { type: 'noul'; noul: number };
interface ClefResponse {
  answers?: {
    spam?: Noul;
    generic?: Noul;
    commercial?: Noul;
    onTopic?: Noul;
    kind?: { type: 'choice'; choice: string; probabilities?: Record<string, number> };
  };
}

const prob = (a: Noul | undefined) =>
  a && typeof a.noul === 'number' && Number.isFinite(a.noul) ? Math.min(1, Math.max(0, a.noul)) : undefined;

export function isAiEnabled(env: Pick<Env, 'AI' | 'AI_SPAM_CHECK'>): boolean {
  return !!env.AI && (env.AI_SPAM_CHECK ?? 'on').toLowerCase() !== 'off';
}

/** Never throws: returns null when the model is unavailable, slow or returns nonsense. */
export async function aiSpamCheck(ai: Ai, input: AiInput): Promise<AiResult | null> {
  const request = { model: 'clef-flash', state: buildState(input), questions: QUESTIONS };
  try {
    const run = (ai as unknown as { run: (model: string, body: unknown) => Promise<unknown> }).run(AI_MODEL, request);
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS));
    const res = (await Promise.race([run, timeout])) as ClefResponse | null;
    const spam = prob(res?.answers?.spam);
    if (spam === undefined) return null;
    const choice = res?.answers?.kind?.choice;
    return {
      spam,
      kind: choice && choice in AI_KINDS ? (choice as AiKind) : null,
      generic: prob(res?.answers?.generic),
      commercial: prob(res?.answers?.commercial),
      onTopic: prob(res?.answers?.onTopic),
    };
  } catch {
    return null;
  }
}
