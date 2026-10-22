import { describe, expect, it } from 'vitest';
import { countLinks, extractHosts, fingerprintBody, judgeComment, MIN_FILL_MS, type SpamSignals } from '../src/lib/comments/spam';
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
