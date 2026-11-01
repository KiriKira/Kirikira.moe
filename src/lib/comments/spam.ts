import type { CommentInput as SubmittedComment, SpamRule } from './types';

/** What the judge looks at (the notification preference is irrelevant to it). */
type CommentInput = Omit<SubmittedComment, 'notify'>;

/**
 * Silent spam filter. Every check adds weight; a total of SPAM_THRESHOLD or more
 * marks the comment as spam. Spam is stored (so false positives can be restored
 * from the admin page) but hidden from everyone except the submitter's browser.
 *
 * Division of labour:
 *  - Hard checks catch bots by behaviour: proof of work, honeypot, timing, IP bursts.
 *  - A few structural rules catch link spam regardless of wording (link counts, lists
 *    of domains, HTML/BBCode links, a URL as the name) and comments in a script the
 *    blog's readers don't write (Cyrillic, Arabic, Hangul...). They are also the fallback when
 *    the AI is unavailable, so they stay deliberately general: no TLD blacklists or
 *    phrase lists that a spammer can reword around and a real reader can trip over.
 *  - What a comment *means* (a reader? an ad? a template blasted to every site?) is the
 *    AI's job: see ai.ts.
 *  - Site-specific words/domains/emails/IPs: the admin's rules (table `spam_rules`).
 */
export const SPAM_THRESHOLD = 100;

/** Minimum time between fetching a proof-of-work challenge and submitting. */
export const MIN_FILL_MS = 2500;

export const WEIGHTS = {
  honeypot: 100,
  powFailed: 100,
  tooFast: 100,
  htmlOrBbcodeLink: 100,
  burstFromIp: 100, // > BURST_PER_MINUTE comments from one IP in a minute
  floodFromIp: 60, // > FLOOD_PER_HOUR comments from one IP in an hour
  manyLinks: 60, // >= 3 links
  twoLinks: 40, // with no-cjk-with-link this reaches the threshold: English + 2 links = spam
  bareDomains: 60, // >= 3 domains listed without http ("Top News Sites ... cnbcnewstoday.com ...")
  noCjkWithLink: 60,
  urlInName: 60,
  foreignScript: 100, // written mainly in a script the blog's readers don't use (Cyrillic, Arabic, Hangul...)
  duplicate: 60,
  builtinKeyword: 50,
  shortener: 40,
  aiSpam: 100, // P(real reader) <= AI_NOT_READER
  aiSuspect: 60, // P(real reader) <= AI_DOUBT: counts together with any other signal
  aiReader: -30, // P(real reader) >= AI_READER: forgives soft rules (never hard checks/admin rules)
} as const;

export const AI_NOT_READER = 0.15;
export const AI_DOUBT = 0.4;
export const AI_READER = 0.85;
/** Short harmless reactions ("=W=", "好耶", "233") are only flagged by a near-certain AI. */
export const AI_NOT_READER_HARMLESS = 0.05;

/**
 * Reasons that settle a comment as spam before any AI is asked (and that the AI can't
 * outvote): failed proof of work, honeypot, timing, IP burst, HTML/BBCode links.
 */
/**
 * Readers write Chinese, English or Japanese. A comment whose letters are mostly in some
 * other script (Cyrillic, Greek, Arabic, Hebrew, Hangul, Thai, Devanagari...) is a bot.
 * Needs at least 8 such letters, so kaomoji like "(´Д`)" or "=ω=" are fine. Latin-script
 * languages other than English (Hungarian, Latin, ...) can't be told apart reliably by a
 * rule; the AI is told the same policy and judges those.
 */
export function foreignScriptShare(body: string): { letters: number; foreign: number } {
  let letters = 0;
  let foreign = 0;
  for (const ch of body.match(/\p{L}/gu) ?? []) {
    letters++;
    if (!/[\p{sc=Latin}\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Common}\p{sc=Inherited}]/u.test(ch)) foreign++;
  }
  return { letters, foreign };
}

export function isForeignScript(body: string): boolean {
  const { letters, foreign } = foreignScriptShare(body);
  return foreign >= 8 && foreign * 2 > letters;
}

export function hasHardReason(reasons: string[]): boolean {
  return reasons.some((r) => /^(honeypot|pow:|too-fast|ip-burst|html-or-bbcode-link)/.test(r));
}

export const BURST_PER_MINUTE = 3;
export const FLOOD_PER_HOUR = 10;

/** Unambiguous spam vocabulary only; anything site-specific belongs in spam_rules. */
const BUILTIN_KEYWORDS = [
  'viagra', 'cialis', 'casino', 'porn', 'escort', 'payday loan', 'crypto airdrop', 'seo service',
  'backlink', 'buy followers', 'replica watches', 'forex signal',
  '博彩', '菠菜', '百家乐', '娱乐城', '代开发票', '刷单', '兼职日结', '加微信', '加V', '裸聊', '贷款秒批',
];

const SHORTENER_HOSTS = ['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'is.gd', 'cutt.ly', 'rb.gy', 'shorturl.at', 'ow.ly'];

export type PowStatus = 'ok' | 'missing' | 'invalid' | 'expired' | 'replayed' | 'wrong-post';

export interface SpamSignals {
  honeypot: string;
  pow: PowStatus;
  /** ms between challenge issue and submit; null when unknown (no valid challenge). */
  elapsedMs: number | null;
  ipHash: string | null;
  recentFromIp: { lastMinute: number; lastHour: number };
  duplicate: boolean;
  /** Clef-flash verdict, when it was asked (see ai.ts). */
  ai?: { reader: number; kind: string } | null;
}

export interface SpamVerdict {
  isSpam: boolean;
  score: number;
  reasons: string[];
}

// CJK Unified Ideographs, Hiragana/Katakana, Hangul, fullwidth punctuation.
const CJK_RE = /[぀-ヿ㐀-䶿一-鿿가-힯＀-￯]/;
const URL_RE = /\bhttps?:\/\/[^\s<>()"'\]]+|\bwww\.[^\s<>()"'\]]+/gi;
const DOMAIN_LIKE_RE = /\b[a-z0-9-]+\.(com|net|org|xyz|top|ru|cn|info|io|me|co|biz|shop|site|online)\b/i;
const BARE_DOMAIN_RE =
  /\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|net|org|info|biz|xyz|top|io|ai|co|me|site|online|shop|store|app|news|ru|cn|uk|us|in|pro|club|vip|live|tv)\b/gi;

export function extractHosts(text: string): string[] {
  const hosts: string[] = [];
  for (const m of text.matchAll(URL_RE)) {
    const raw = m[0].startsWith('www.') ? `http://${m[0]}` : m[0];
    try {
      hosts.push(new URL(raw).hostname.toLowerCase());
    } catch {
      // Unparseable URL-ish text; it still counts as a link below.
    }
  }
  return hosts;
}

/**
 * Distinct links: the same URL twice counts once, so a Markdown link written as
 * `[https://a.me](https://a.me)` or a URL repeated for emphasis is still one link.
 */
export function countLinks(body: string): number {
  const urls = (body.match(URL_RE) ?? []).map((u) =>
    u.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[.,;:!?。，！？]+$/, '').replace(/\/+$/, ''),
  );
  return new Set(urls).size;
}

/** Any letter in any script; emoji, kaomoji symbols and numbers aren't letters. */
const hasLetters = (s: string) => /\p{L}/u.test(s);

/** Domains written without http:// (spammers list them to dodge link filters). */
export function countBareDomains(body: string): number {
  return body.replace(URL_RE, ' ').match(BARE_DOMAIN_RE)?.length ?? 0;
}

/**
 * A short reaction with nothing to promote: no links or website, and either some CJK or
 * hardly any letters ("=W=", "好耶", "233", "thx"). Only a near-certain AI may flag these.
 */
export function isHarmlessReaction(input: CommentInput): boolean {
  const body = input.body.trim();
  if (countLinks(body) + countBareDomains(body) > 0 || [...body].length > 60) return false;
  // Emoji/kaomoji only ("😘😘😘"): nothing to read, so nothing to sell, website or not.
  if (!hasLetters(body)) return true;
  if (input.url !== '') return false;
  return CJK_RE.test(body) || (body.match(/\p{L}/gu)?.length ?? 0) < 12;
}

function hostMatches(host: string, pattern: string): boolean {
  const p = pattern.toLowerCase().replace(/^\*?\./, '');
  return host === p || host.endsWith(`.${p}`);
}

function ruleMatches(rule: SpamRule, input: CommentInput, hosts: string[], ipHash: string | null): boolean {
  const haystack = `${input.name}\n${input.body}\n${input.url}`;
  switch (rule.kind) {
    case 'keyword':
      return haystack.toLowerCase().includes(rule.pattern.toLowerCase());
    case 'domain':
      return hosts.some((h) => hostMatches(h, rule.pattern));
    case 'regex':
      try {
        return new RegExp(rule.pattern, 'imu').test(haystack);
      } catch {
        return false; // A broken rule must never block the whole comment pipeline.
      }
    case 'ip_hash':
      return ipHash !== null && ipHash === rule.pattern;
    case 'email':
      return input.email !== '' && input.email.toLowerCase() === rule.pattern.toLowerCase();
  }
}

export function judgeComment(input: CommentInput, signals: SpamSignals, rules: SpamRule[] = []): SpamVerdict {
  const reasons: string[] = [];
  let score = 0;
  const add = (reason: string, weight: number) => {
    reasons.push(reason);
    score += weight;
  };

  if (signals.honeypot.trim() !== '') add('honeypot', WEIGHTS.honeypot);
  if (signals.pow !== 'ok') add(`pow:${signals.pow}`, WEIGHTS.powFailed);
  if (signals.elapsedMs !== null && signals.elapsedMs < MIN_FILL_MS) add('too-fast', WEIGHTS.tooFast);

  if (signals.recentFromIp.lastMinute >= BURST_PER_MINUTE) add('ip-burst', WEIGHTS.burstFromIp);
  else if (signals.recentFromIp.lastHour >= FLOOD_PER_HOUR) add('ip-flood', WEIGHTS.floodFromIp);

  const text = `${input.name}\n${input.body}`;
  if (/<\/a>|<a\s+href|\[url[=\]]|\[link[=\]]/i.test(text)) add('html-or-bbcode-link', WEIGHTS.htmlOrBbcodeLink);

  const links = countLinks(input.body);
  if (links >= 3) add(`links:${links}`, WEIGHTS.manyLinks);
  else if (links === 2) add('links:2', WEIGHTS.twoLinks);

  const bare = countBareDomains(input.body);
  if (bare >= 3) add(`bare-domains:${bare}`, WEIGHTS.bareDomains);

  const hasCjk = CJK_RE.test(input.body);
  // Only for actual text: an emoji-only reaction from someone with a homepage isn't "foreign".
  if (!hasCjk && hasLetters(input.body) && (links > 0 || input.url !== '')) add('no-cjk-with-link', WEIGHTS.noCjkWithLink);

  if (countLinks(input.name) > 0 || DOMAIN_LIKE_RE.test(input.name)) add('url-in-name', WEIGHTS.urlInName);

  if (isForeignScript(input.body)) add('foreign-script', WEIGHTS.foreignScript);

  if (signals.duplicate) add('duplicate', WEIGHTS.duplicate);

  const lowered = `${text}\n${input.url}`.toLowerCase();
  const keyword = BUILTIN_KEYWORDS.find((k) => lowered.includes(k.toLowerCase()));
  if (keyword) add(`keyword:${keyword}`, WEIGHTS.builtinKeyword);

  const hosts = extractHosts(`${input.body}\n${input.url}`);
  if (hosts.some((h) => SHORTENER_HOSTS.some((s) => hostMatches(h, s)))) add('shortener', WEIGHTS.shortener);

  for (const rule of rules) {
    if (ruleMatches(rule, input, hosts, signals.ipHash)) add(`rule:${rule.id}:${rule.kind}`, rule.weight);
  }

  const ai = signals.ai;
  if (ai) {
    const tag = `ai:reader=${ai.reader.toFixed(2)}:${ai.kind}`;
    const notReader = isHarmlessReaction(input) ? AI_NOT_READER_HARMLESS : AI_NOT_READER;
    if (ai.reader <= notReader) add(tag, WEIGHTS.aiSpam);
    else if (ai.reader <= AI_DOUBT && !isHarmlessReaction(input)) add(tag, WEIGHTS.aiSuspect);
    // The AI may forgive soft heuristics, never hard checks or the admin's own rules.
    else if (ai.reader >= AI_READER && !hasHardReason(reasons) && !reasons.some((r) => r.startsWith('rule:'))) {
      add(tag, WEIGHTS.aiReader);
    } else reasons.push(tag);
  }

  return { isSpam: score >= SPAM_THRESHOLD, score, reasons };
}

/** Normalise a body for duplicate detection: case, whitespace and punctuation-insensitive. */
export function fingerprintBody(body: string): string {
  return body.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}
