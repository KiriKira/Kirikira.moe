import { describe, expect, it } from 'vitest';
import { countBareDomains, countLinks, extractHosts, fingerprintBody, hasHardReason, judgeComment, MIN_FILL_MS, type SpamSignals } from '../src/lib/comments/spam';
import type { CommentInput, SpamRule } from '../src/lib/comments/types';

const input = (over: Partial<CommentInput> = {}): CommentInput => ({
  postId: '1',
  parentId: null,
  name: '路人甲',
  email: '',
  url: '',
  body: '写得很好，学到了！',
  ...over,
});

const signals = (over: Partial<SpamSignals> = {}): SpamSignals => ({
  honeypot: '',
  pow: 'ok',
  elapsedMs: 30_000,
  ipHash: 'abc',
  recentFromIp: { lastMinute: 0, lastHour: 0 },
  duplicate: false,
  ...over,
});

const rule = (over: Partial<SpamRule>): SpamRule => ({
  id: 1,
  kind: 'keyword',
  pattern: '',
  weight: 100,
  note: null,
  created_at: '2026-01-01T00:00:00Z',
  ...over,
});

describe('judgeComment', () => {
  it('lets an ordinary Chinese comment through', () => {
    expect(judgeComment(input(), signals())).toEqual({ isSpam: false, score: 0, reasons: [] });
  });

  it('lets an English comment with a single link through', () => {
    expect(judgeComment(input({ body: 'Thanks! Related: https://github.com/foo/bar' }), signals()).isSpam).toBe(false);
  });

  it('lets a Chinese comment with a couple of links through', () => {
    const v = judgeComment(input({ body: '参考 https://a.example.com 和 https://b.example.com' }), signals());
    expect(v.isSpam).toBe(false);
  });

  it.each([
    ['honeypot', signals({ honeypot: 'http://x' })],
    ['missing pow', signals({ pow: 'missing', elapsedMs: null })],
    ['invalid pow', signals({ pow: 'invalid', elapsedMs: null })],
    ['expired pow', signals({ pow: 'expired', elapsedMs: null })],
    ['replayed pow', signals({ pow: 'replayed' })],
    ['pow for another post', signals({ pow: 'wrong-post' })],
    ['too fast', signals({ elapsedMs: MIN_FILL_MS - 1 })],
    ['ip burst', signals({ recentFromIp: { lastMinute: 3, lastHour: 3 } })],
  ])('blocks on %s', (_, s) => {
    expect(judgeComment(input(), s).isSpam).toBe(true);
  });

  it('keeps the old site rule: HTML anchors and BBCode links are spam', () => {
    expect(judgeComment(input({ body: '<a href="http://x.com">x</a>' }), signals()).isSpam).toBe(true);
    expect(judgeComment(input({ body: '好 [url=http://x.com]x[/url]' }), signals()).isSpam).toBe(true);
  });

  it('flags English comments with two or more links', () => {
    const v = judgeComment(input({ body: 'Nice! visit https://a.example.com and https://b.example.org' }), signals());
    expect(v.isSpam).toBe(true);
    expect(v.reasons).toEqual(expect.arrayContaining(['links:2', 'no-cjk-with-link']));
  });

  it('flags link floods on spammy TLDs even in Chinese', () => {
    expect(judgeComment(input({ body: '看这里 https://a.xyz https://b.xyz https://c.xyz' }), signals()).isSpam).toBe(true);
  });

  it('flags a domain-like name together with an English link body', () => {
    expect(judgeComment(input({ name: 'cheap-pills.com', body: 'good https://cheap-pills.com' }), signals()).isSpam).toBe(true);
  });

  it('applies custom rules', () => {
    const domain = rule({ kind: 'domain', pattern: 'evil.example' });
    expect(judgeComment(input({ body: '看 https://www.evil.example/x' }), signals(), [domain]).isSpam).toBe(true);
    expect(judgeComment(input({ body: '看 https://notevil.example/x' }), signals(), [domain]).isSpam).toBe(false);

    const kw = rule({ kind: 'keyword', pattern: '代写论文' });
    expect(judgeComment(input({ body: '专业代写论文' }), signals(), [kw]).isSpam).toBe(true);

    const ip = rule({ kind: 'ip_hash', pattern: 'abc' });
    expect(judgeComment(input(), signals(), [ip]).isSpam).toBe(true);

    const email = rule({ kind: 'email', pattern: 'bot@spam.example' });
    expect(judgeComment(input({ email: 'BOT@spam.example' }), signals(), [email]).isSpam).toBe(true);

    const re = rule({ kind: 'regex', pattern: '^\\d+$' });
    expect(judgeComment(input({ name: '12345' }), signals(), [re]).isSpam).toBe(true);
  });

  it('ignores broken regex rules instead of failing', () => {
    expect(judgeComment(input(), signals(), [rule({ kind: 'regex', pattern: '(' })]).isSpam).toBe(false);
  });

  it('supports negative-weight allow rules', () => {
    const allow = rule({ kind: 'domain', pattern: 'github.com', weight: -100 });
    const body = 'see https://github.com/a and https://github.com/b';
    expect(judgeComment(input({ body }), signals()).isSpam).toBe(true);
    expect(judgeComment(input({ body }), signals(), [allow]).isSpam).toBe(false);
  });
});

describe('helpers', () => {
  it('counts and extracts links', () => {
    expect(countLinks('a https://x.com/a b www.y.org c')).toBe(2);
    expect(extractHosts('a https://X.com/a b www.y.org c')).toEqual(['x.com', 'www.y.org']);
  });

  it('fingerprints bodies insensitive to case/space/punctuation', () => {
    expect(fingerprintBody('Hello, World!')).toBe(fingerprintBody('hello world'));
    expect(fingerprintBody('你好，世界。')).toBe(fingerprintBody('你好 世界'));
  });
});

describe('AI signal (Clef-flash)', () => {
  const ai = (spam: number, kind: string | null = null) => ({ spam, kind });

  it('marks spam when the model is confident', () => {
    const v = judgeComment(input(), signals({ ai: ai(0.93, 'ad') }));
    expect(v.isSpam).toBe(true);
    expect(v.reasons).toContain('ai:0.93:ad');
  });

  it('only counts "maybe" together with other signals', () => {
    expect(judgeComment(input(), signals({ ai: ai(0.7) })).isSpam).toBe(false);
    const withLink = input({ body: 'Nice post https://shop.example.com' }); // no-cjk-with-link: 60
    expect(judgeComment(withLink, signals({ ai: ai(0.7) })).isSpam).toBe(true);
  });

  it('lets a confident "normal" rescue soft heuristics', () => {
    const body = 'Thanks! See https://github.com/a and https://github.com/b';
    expect(judgeComment(input({ body }), signals()).isSpam).toBe(true);
    expect(judgeComment(input({ body }), signals({ ai: ai(0.03, 'normal') })).isSpam).toBe(false);
  });

  it('never outvotes hard checks or admin rules', () => {
    expect(judgeComment(input(), signals({ honeypot: 'x', ai: ai(0.01) })).isSpam).toBe(true);
    const ban = rule({ kind: 'keyword', pattern: '学到了' });
    expect(judgeComment(input(), signals({ ai: ai(0.01) }), [ban]).isSpam).toBe(true);
  });

  it('recognises hard reasons', () => {
    expect(hasHardReason(['links:2', 'pow:missing'])).toBe(true);
    expect(hasHardReason(['links:2', 'no-cjk-with-link'])).toBe(false);
  });
});

/** Real spam from the old site's database (admin screenshots), and real-looking good comments. */
describe('legacy spam samples and false positives', () => {
  const old = (name: string, url: string, body: string, email = '') => input({ name, url, body, email });
  const neutral = signals({ ipHash: null });

  const SPAM = [
    old('SEOSolutionVIP Fiverr', 'http://steeldirectory.homedirectory.biz/details.php?id=306965',
      'Wnr.ai is a creative AI tool that generates thought-provoking prompts to ignite your imagination.', 'hoseagrissom@att.net'),
    old('buy potentstream', 'https://www.quora.com/profile/Rajiv-Ranjan-Kumar-114/PotentStream-Supplements-A-Comprehensive-Review',
      'I have been exploring for a little for any high-quality articles or weblog posts in this kind of house .\nExploring in Yahoo I eventually stumbled upon this site.\nStudying this information So i\'m happy to express that I have an incredibly just right uncanny feeling I found out exactly what I needed.',
      'kylestowers@orange.fr'),
    old('Melvingob', 'https://dailyheraldnewstoday.com',
      "Top News Sites for article Post\n\nchinaworldnewstoday.com\nchroniclenewstoday.com\ncnbcnewstoday.com\ncnnworldtoday.com\ncrunchbasenewstoday.com\ndailyexpressnewstoday.com\n\nDon't hesiate to conatct us.",
      'salina.desuza@eunews24x7.com'),
    old('Raymondtaipt', 'https://rtnewstoday.com',
      'News Sites for article post\n\nnytimesnewstoday.com\noxfordnewstoday.com\nportugalnewstoday.com\npostgazettenewstoday.com\nrepublicofchinatoday.com\nreuterstoday.com\n\nDont hesiate to contact us',
      'desuzajohn@eunews24x7.com'),
    old('online casino', 'https://1winchile-casino.xyz',
      "Attractive section of content. I just stumbled upon your website and in accession capital to assert that I acquire in fact enjoyed account your blog posts. Anyway I'll be subscribing to your feeds or even I achievement you get admission to constantly fast.",
      'curt_frei@yahoo.com'),
    old('Douglasideri', 'https://thequintnewstoday.com',
      'Top Sites for article Post\n\ntheheraldnewstoday.com\ntheindependentnewstoday.com\ntheirishtimesnewstoday.com\ntheirishtimestoday.com\nthemetronewstoday.com\nthemirrornewstoday.com\n\nDont hasiate to contact us',
      'dzonothoan@eunews24x7.com'),
  ];

  it.each(SPAM.map((c) => [c.name, c]))('catches "%s" by rules alone', (_, c) => {
    expect(judgeComment(c, neutral).isSpam).toBe(true);
  });

  const GOOD = [
    old('路人', '', '=W='),
    old('路人', '', '好耶'),
    old('rin', '', '233333'),
    old('Kiri的粉丝', '', '谢谢分享，学到了！'),
    old('Alex', 'https://alex.dev', 'Thanks for the write-up! The MITM section helped me fix my V2Ray config.'),
    old('Alex', 'https://alex.dev', 'Nice post! I have been using Rime for years too.'),
    old('xuanwo', 'https://xuanwo.io', '参考 https://github.com/v2ray/v2ray-core 和 https://www.v2fly.org 的文档'),
    old('Best', '', '这篇太好笑了 hhh'),
    old('Online Judge 爱好者', '', '请问 V2Ray 的 MITM 配置在新版本还能用吗？'),
  ];

  it.each(GOOD.map((c) => [c.body, c]))('never flags "%s", with or without AI', (_, c) => {
    expect(judgeComment(c, neutral).isSpam).toBe(false);
    // Even if the model wrongly calls a short harmless comment generic/commercial.
    const shaky = { spam: 0.5, kind: null, generic: 0.95, commercial: 0.9, onTopic: 0.05 };
    if (!c.url && [...c.body].length <= 60 && countLinks(c.body) === 0) expect(judgeComment(c, signals({ ipHash: null, ai: shaky })).isSpam).toBe(false);
  });

  it('uses the AI side questions for payload-carrying comments', () => {
    const c = old('Mike', 'https://mikes-blog.example', 'Interesting thoughts, thank you.'); // no-cjk-with-link: 60
    expect(judgeComment(c, signals({ ai: { spam: 0.3, kind: null, commercial: 0.8 } })).isSpam).toBe(true);
    expect(judgeComment(c, signals({ ai: { spam: 0.3, kind: null, generic: 0.9, onTopic: 0.1 } })).isSpam).toBe(true);
    expect(judgeComment(c, signals({ ai: { spam: 0.3, kind: null, generic: 0.9, onTopic: 0.8 } })).isSpam).toBe(false);
  });

  it('counts bare domains but not ones inside URLs', () => {
    expect(countBareDomains('a.com b.net c.org')).toBe(3);
    expect(countBareDomains('https://a.com/x and https://b.net')).toBe(0);
  });
});
