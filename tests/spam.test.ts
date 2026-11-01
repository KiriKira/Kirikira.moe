import { describe, expect, it } from 'vitest';
import { countBareDomains, countLinks, extractHosts, fingerprintBody, hasHardReason, isHarmlessReaction, judgeComment, MIN_FILL_MS, type SpamSignals } from '../src/lib/comments/spam';
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

  it('does not judge by TLD: three links in a Chinese comment need another signal', () => {
    const c = input({ body: '看这里 https://a.xyz https://b.fun https://c.site' });
    expect(judgeComment(c, signals()).isSpam).toBe(false);
    expect(judgeComment(c, signals({ ai: { reader: 0.3, kind: 'promotion' } })).isSpam).toBe(true);
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

describe('AI signal (Clef-flash: P(real reader))', () => {
  const ai = (reader: number, kind = 'reader') => ({ reader, kind });

  it('marks spam when the model is confident it is not a reader', () => {
    const v = judgeComment(input({ body: 'Check our new tool, it is great.' }), signals({ ai: ai(0.08, 'promotion') }));
    expect(v.isSpam).toBe(true);
    expect(v.reasons).toContain('ai:reader=0.08:promotion');
  });

  it('only counts doubt together with another signal', () => {
    expect(judgeComment(input({ body: 'Check our new tool, it is great.' }), signals({ ai: ai(0.3, 'template') })).isSpam).toBe(false);
    const withLink = input({ body: 'Nice post', url: 'https://shop.example.com' }); // no-cjk-with-link: 60
    expect(judgeComment(withLink, signals({ ai: ai(0.3, 'promotion') })).isSpam).toBe(true);
  });

  it('lets a confident "reader" rescue soft heuristics', () => {
    const body = 'Thanks! See https://github.com/a and https://github.com/b';
    expect(judgeComment(input({ body }), signals()).isSpam).toBe(true);
    expect(judgeComment(input({ body }), signals({ ai: ai(0.95) })).isSpam).toBe(false);
  });

  it('never outvotes hard checks or admin rules', () => {
    expect(judgeComment(input(), signals({ honeypot: 'x', ai: ai(0.99) })).isSpam).toBe(true);
    const ban = rule({ kind: 'keyword', pattern: '学到了' });
    expect(judgeComment(input(), signals({ ai: ai(0.99) }), [ban]).isSpam).toBe(true);
  });

  it('protects harmless reactions unless the model is near-certain', () => {
    for (const body of ['=W=', '好耶', '233333', 'thx!']) {
      expect(isHarmlessReaction(input({ body }))).toBe(true);
      expect(judgeComment(input({ body }), signals({ ai: ai(0.1, 'template') })).isSpam).toBe(false);
    }
    expect(isHarmlessReaction(input({ body: 'Hi, I wanted to know your price.' }))).toBe(false);
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
  const notReader = (kind: string) => signals({ ipHash: null, ai: { reader: 0.1, kind } });
  const doubtful = (kind: string) => signals({ ipHash: null, ai: { reader: 0.3, kind } });

  // Link spam is structural: caught without any AI (the fallback when it's unavailable).
  it.each([
    old('Melvingob', 'https://dailyheraldnewstoday.com', "Top News Sites for article Post\n\nchinaworldnewstoday.com\nchroniclenewstoday.com\ncnbcnewstoday.com\ncnnworldtoday.com\n\nDon't hesiate to conatct us."),
    old('Douglasideri', 'https://thequintnewstoday.com', 'Top Sites for article Post\n\ntheheraldnewstoday.com\ntheindependentnewstoday.com\ntheirishtimesnewstoday.com\n\nDont hasiate to contact us'),
    old('online casino', 'https://1winchile-casino.xyz', 'Attractive section of content. I just stumbled upon your website and enjoyed account your blog posts.'),
  ])('catches link spam by rules alone: $name', (c) => {
    expect(judgeComment(c, neutral).isSpam).toBe(true);
  });

  // Spam by meaning: the rules alone can't (and shouldn't) tell; the AI verdict decides.
  it.each([
    [old('SEOSolutionVIP Fiverr', 'http://steeldirectory.homedirectory.biz/details.php?id=306965', 'Wnr.ai is a creative AI tool that generates thought-provoking prompts to ignite your imagination.'), 'promotion'],
    [old('buy potentstream', 'https://www.quora.com/profile/x/PotentStream-Supplements-A-Comprehensive-Review', 'I have been exploring for a little for any high-quality articles or weblog posts in this kind of house. Exploring in Yahoo I eventually stumbled upon this site.'), 'promotion'],
    [old('Stevenhut', 'https://taj.bkinf0-123.site', "don't think anything"), 'template'],
    [old('FrbetPounk', 'https://betrfa.bking.site', 'interesting for a very long time'), 'template'],
  ] as const)('with a website, even AI doubt is enough: %s', (c, kind) => {
    expect(judgeComment(c, doubtful(kind)).isSpam).toBe(true);
  });

  it.each([
    'Szia, meg akartam tudni az árát.',
    'Hi, ego volo scire vestri pretium.',
    'Hi, I wanted to know your price.',
    'Zdravo, htio sam znati vašu cijenu.',
  ])('the multilingual price bot is caught once the AI rules out a reader: "%s"', (body) => {
    const c = old('RobertFoumb', '', body, 'lucido.leinteract@gmail.com');
    expect(judgeComment(c, neutral).isSpam).toBe(false);
    expect(judgeComment(c, notReader('template')).isSpam).toBe(true);
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
    old('Tom', '', "What's the price of that VPS you mentioned?"),
    old('ゆう', '', '記事ありがとうございます！V2Rayの設定でずっと困っていました。'),
    old('kaomoji', '', '(´Д`) 好惨 =ω= ヽ(°〇°)ﾉ'),
    old('neo 喵', 'https://neo.fun', '哈哈哈哈 京都那家拉面我也去过'),
  ];

  it.each(GOOD.map((c) => [c.body, c]))('rules alone never hide "%s"', (_, c) => {
    expect(judgeComment(c, neutral).isSpam).toBe(false);
  });

  it('hides comments written in a script the readers do not use', () => {
    for (const body of ['Здравствуйте, я хотел узнать вашу цену.', 'مرحبا، أردت أن أعرف السعر', '안녕하세요, 가격을 알고 싶었습니다.']) {
      expect(judgeComment(old('RobertFoumb', '', body), neutral).reasons).toContain('foreign-script');
      expect(judgeComment(old('RobertFoumb', '', body), neutral).isSpam).toBe(true);
    }
  });

  it('leaves Latin-script foreign languages to the AI (told that only zh/en/ja readers exist)', () => {
    const c = old('Amélie', '', "Merci pour l'article, très utile !");
    expect(judgeComment(c, neutral).isSpam).toBe(false);
    expect(judgeComment(c, notReader('template')).isSpam).toBe(true);
  });

  it('counts bare domains but not ones inside URLs', () => {
    expect(countBareDomains('a.com b.net c.org')).toBe(3);
    expect(countBareDomains('https://a.com/x and https://b.net')).toBe(0);
  });
});
