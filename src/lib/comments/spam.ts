import type { CommentInput, SpamRule } from './types';

/**
 * Silent spam filter. Every check adds weight; a total of SPAM_THRESHOLD or more
 * marks the comment as spam. Spam is stored (so false positives can be restored
 * from the admin page) but hidden from everyone except the submitter's browser.
 *
 * Tune the numbers here; add site-specific words/domains through the admin
 * page's rules (table `spam_rules`) rather than by editing code.
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
  noCjkWithLink: 60,
  urlInName: 60,
  duplicate: 60,
  builtinKeyword: 50,
  shortenerOrSpamTld: 40,
  mostlyCyrillic: 40,
} as const;

export const BURST_PER_MINUTE = 3;
export const FLOOD_PER_HOUR = 10;

/** Conservative defaults; anything site-specific belongs in spam_rules. */
const BUILTIN_KEYWORDS = [
  'viagra', 'cialis', 'casino', 'porn', 'escort', 'payday loan', 'crypto airdrop', 'seo service',
  'backlink', 'buy followers', 'replica watches', 'forex signal',
  '博彩', '菠菜', '百家乐', '娱乐城', '代开发票', '刷单', '兼职日结', '加微信', '加V', '裸聊', '贷款秒批',
];

const SHORTENER_HOSTS = ['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'is.gd', 'cutt.ly', 'rb.gy', 'shorturl.at', 'ow.ly'];
const SPAM_TLDS = ['.xyz', '.top', '.click', '.loan', '.win', '.bid', '.icu', '.monster', '.cfd', '.sbs', '.buzz'];

export type PowStatus = 'ok' | 'missing' | 'invalid' | 'expired' | 'replayed' | 'wrong-post';

export interface SpamSignals {
  honeypot: string;
  pow: PowStatus;
  /** ms between challenge issue and submit; null when unknown (no valid challenge). */
  elapsedMs: number | null;
  ipHash: string | null;
  recentFromIp: { lastMinute: number; lastHour: number };
  duplicate: boolean;
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

export function countLinks(body: string): number {
  return body.match(URL_RE)?.length ?? 0;
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

  const hasCjk = CJK_RE.test(input.body);
  if (!hasCjk && (links > 0 || input.url !== '')) add('no-cjk-with-link', WEIGHTS.noCjkWithLink);

  if (countLinks(input.name) > 0 || DOMAIN_LIKE_RE.test(input.name)) add('url-in-name', WEIGHTS.urlInName);

  const letters = input.body.replace(/[\s\d\p{P}\p{S}]/gu, '');
  const cyrillic = letters.match(/\p{Script=Cyrillic}/gu)?.length ?? 0;
  if (letters.length >= 20 && cyrillic / letters.length > 0.3) add('mostly-cyrillic', WEIGHTS.mostlyCyrillic);

  if (signals.duplicate) add('duplicate', WEIGHTS.duplicate);

  const lowered = `${text}\n${input.url}`.toLowerCase();
  const keyword = BUILTIN_KEYWORDS.find((k) => lowered.includes(k.toLowerCase()));
  if (keyword) add(`keyword:${keyword}`, WEIGHTS.builtinKeyword);

  const hosts = extractHosts(`${input.body}\n${input.url}`);
  if (hosts.some((h) => SHORTENER_HOSTS.some((s) => hostMatches(h, s)) || SPAM_TLDS.some((t) => h.endsWith(t)))) {
    add('shortener-or-spam-tld', WEIGHTS.shortenerOrSpamTld);
  }

  for (const rule of rules) {
    if (ruleMatches(rule, input, hosts, signals.ipHash)) add(`rule:${rule.id}:${rule.kind}`, rule.weight);
  }

  return { isSpam: score >= SPAM_THRESHOLD, score, reasons };
}

/** Normalise a body for duplicate detection: case, whitespace and punctuation-insensitive. */
export function fingerprintBody(body: string): string {
  return body.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}
