import { beforeEach, describe, expect, it } from 'vitest';
import { createD1 } from './helpers/d1';
import * as store from '../src/lib/comments/store';

const NOW = Date.parse('2026-11-02T12:00:00Z');
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();
let db: D1Database;

const add = (over: Partial<store.NewComment>) =>
  store.insertComment(db, {
    post_id: '1', parent_id: null, name: '路人', email: null, url: null, body: '你好',
    body_fp: null, status: 'published', spam_score: 0, spam_reasons: null, ip_hash: null, user_agent: null,
    pow_nonce: null, ai_spam: null, ai_kind: null, ai_checked_at: null, notify: 1, created_at: ago(5), ...over,
  });

const ctx = (q: Partial<Parameters<typeof store.submissionContext>[1]> = {}) =>
  store.submissionContext(db, { nonce: null, ipHash: null, bodyFp: 'abcdefghij', author: { email: '', name: '新人' }, ...q }, NOW);

beforeEach(() => {
  db = createD1().d1;
});

describe('submissionContext (all spam-check reads in one D1 batch)', () => {
  it('is empty for a first comment', async () => {
    expect(await ctx()).toEqual({
      nonceUsed: false,
      recentFromIp: { lastMinute: 0, lastHour: 0, spamLastHour: 0 },
      duplicate: false,
      rules: [],
      history: { total: 0, samples: [] },
    });
  });

  it('detects a replayed proof-of-work nonce', async () => {
    await add({ pow_nonce: 'n1' });
    expect((await ctx({ nonce: 'n1' })).nonceUsed).toBe(true);
    expect((await ctx({ nonce: 'n2' })).nonceUsed).toBe(false);
  });

  it('counts recent comments from the same IP', async () => {
    await add({ ip_hash: 'ip', created_at: ago(0.5) });
    await add({ ip_hash: 'ip', created_at: ago(30), status: 'spam' });
    await add({ ip_hash: 'ip', created_at: ago(90) });
    await add({ ip_hash: 'other', created_at: ago(0.5) });
    expect((await ctx({ ipHash: 'ip' })).recentFromIp).toEqual({ lastMinute: 1, lastHour: 2, spamLastHour: 1 });
    expect((await ctx({ ipHash: null })).recentFromIp).toEqual({ lastMinute: 0, lastHour: 0, spamLastHour: 0 });
  });

  it('finds duplicates from the last week, ignoring very short bodies', async () => {
    await add({ body_fp: 'abcdefghij', created_at: ago(60) });
    await add({ body_fp: '谢谢', created_at: ago(60) });
    await add({ body_fp: 'oldoldoldold', created_at: ago(8 * 24 * 60) });
    expect((await ctx({ bodyFp: 'abcdefghij' })).duplicate).toBe(true);
    expect((await ctx({ bodyFp: '谢谢' })).duplicate).toBe(false);
    expect((await ctx({ bodyFp: 'oldoldoldold' })).duplicate).toBe(false);
  });

  it('returns the admin rules and the author history (by email, else by name)', async () => {
    await store.addRule(db, { kind: 'keyword', pattern: 'casino', weight: 100 });
    await add({ name: 'Bot', email: 'Bot@Example.com', body: 'first' });
    await add({ name: 'Other name', email: 'bot@example.com', body: 'second' });
    await add({ name: '千千', body: '又来了' });
    const r = await ctx({ author: { email: 'BOT@example.com', name: 'x' } });
    expect(r.rules.map((x) => x.pattern)).toEqual(['casino']);
    expect(r.history).toEqual({ total: 2, samples: ['second', 'first'] });
    expect((await ctx({ author: { email: '', name: '千千' } })).history).toEqual({ total: 1, samples: ['又来了'] });
  });
});
