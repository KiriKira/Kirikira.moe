import { describe, expect, it, vi } from 'vitest';
import { AI_KINDS, AI_MODEL, aiSpamCheck, buildRequest, buildState, isAiEnabled, parseResponse } from '../src/lib/comments/ai';

const fakeAi = (impl: (model: string, body: any) => Promise<unknown>) => ({ run: vi.fn(impl) }) as unknown as Ai;
const verdict = (probabilities: Record<string, number>) => ({
  answers: { verdict: { type: 'choice', choice: 'x', probabilities } },
});

describe('buildRequest', () => {
  it('asks a single choice question with mutually exclusive options', () => {
    const req = buildRequest({ name: 'a', url: '', body: 'hi' });
    expect(req.model).toBe('clef-flash');
    expect(Object.keys(req.questions)).toEqual(['verdict']);
    expect(req.questions.verdict.type).toBe('choice');
    expect(Object.keys(req.questions.verdict.criteria)).toEqual(Object.keys(AI_KINDS));
  });

  it('states the blog language policy in the record and the options', () => {
    const req = buildRequest({ name: 'a', url: '', body: 'hi' });
    expect(req.state).toMatch(/Chinese .*English .*Japanese/s);
    expect(req.state).toMatch(/any\s+other language .* spam bots/s);
    expect(req.questions.verdict.criteria.reader).toContain('Chinese, English or');
    expect(req.questions.verdict.criteria.template).toContain('language other than Chinese, English or Japanese');
  });
});

describe('buildState', () => {
  it('shows the post, the form fields as submitted, and the comment', () => {
    const s = buildState({
      name: 'online casino',
      url: 'https://1winchile-casino.xyz/page',
      email: 'Curt_Frei@Yahoo.com',
      body: 'Attractive section of content.',
      postTitle: '我曾出现在你的梦里吗',
      postExcerpt: '本文使用 Rime 写作',
    });
    expect(s).toContain('Post: 我曾出现在你的梦里吗');
    expect(s).toContain('Post summary: 本文使用 Rime 写作');
    expect(s).toContain('Name: online casino');
    expect(s).toContain('Email: Curt_Frei@Yahoo.com');
    expect(s).toContain('Website: https://1winchile-casino.xyz/page');
    expect(s).toContain('<<<\nAttractive section of content.\n>>>');
    expect(s).toContain('This author has no other comments on this blog.');
  });

  it('marks missing fields and includes the author history', () => {
    const s = buildState({
      name: 'RobertFoumb',
      url: '',
      body: 'Hi, I wanted to know your price.',
      history: { total: 7, samples: ['Szia, meg akartam tudni az árát.', 'Zdravo,\nhtio sam znati vašu cijenu.'] },
    });
    expect(s).toContain('Email: (not given)');
    expect(s).toContain('Website: (not given)');
    expect(s).toContain('Post: (unknown)');
    expect(s).toContain("The same author's other comments on this blog: 7. Most recent:");
    expect(s).toContain('- "Szia, meg akartam tudni az árát."');
    expect(s).toContain('- "Zdravo, htio sam znati vašu cijenu."');
  });

  it('truncates very long comments', () => {
    const s = buildState({ name: 'a', url: '', body: 'x'.repeat(5000) });
    expect(s).toContain(`${'x'.repeat(3000)}…`);
    expect(s).not.toContain('x'.repeat(3001));
  });
});

describe('parseResponse', () => {
  it('returns P(reader), the most likely kind and all probabilities', () => {
    const r = parseResponse(verdict({ reader: 0.1, promotion: 0.7, template: 0.15, scam: 0.05 }));
    expect(r).toEqual({ reader: 0.1, kind: 'promotion', probabilities: { reader: 0.1, promotion: 0.7, template: 0.15, scam: 0.05 } });
  });

  it('clamps probabilities', () => {
    expect(parseResponse(verdict({ reader: 1.2, promotion: -0.1, template: 0, scam: 0 }))?.reader).toBe(1);
  });

  it('returns null when the verdict is missing or malformed', () => {
    expect(parseResponse(null)).toBeNull();
    expect(parseResponse({ answers: {} })).toBeNull();
    expect(parseResponse(verdict({ reader: 0.5, promotion: 0.5 }))).toBeNull();
    expect(parseResponse(verdict({ reader: Number.NaN, promotion: 0, template: 0, scam: 0 }))).toBeNull();
  });
});

describe('aiSpamCheck', () => {
  it('calls Clef-flash with the request and parses the verdict', async () => {
    const ai = fakeAi(async () => verdict({ reader: 0.9, promotion: 0.05, template: 0.03, scam: 0.02 }));
    const r = await aiSpamCheck(ai, { name: '路人', url: '', body: '=W=' });
    expect(r?.kind).toBe('reader');
    const [model, body] = (ai as any).run.mock.calls[0];
    expect(model).toBe(AI_MODEL);
    expect(body).toEqual(buildRequest({ name: '路人', url: '', body: '=W=' }));
  });

  it('returns null on errors, garbage or timeouts instead of throwing', async () => {
    expect(await aiSpamCheck(fakeAi(async () => { throw new Error('boom'); }), { name: 'a', url: '', body: 'b' })).toBeNull();
    expect(await aiSpamCheck(fakeAi(async () => 'garbage'), { name: 'a', url: '', body: 'b' })).toBeNull();
    vi.useFakeTimers();
    const pending = aiSpamCheck(fakeAi(() => new Promise(() => {})), { name: 'a', url: '', body: 'b' });
    await vi.advanceTimersByTimeAsync(7000);
    expect(await pending).toBeNull();
    vi.useRealTimers();
  });

  it('can be switched off', () => {
    expect(isAiEnabled({ AI: {} as Ai, AI_SPAM_CHECK: 'off' } as any)).toBe(false);
    expect(isAiEnabled({ AI: {} as Ai } as any)).toBe(true);
    expect(isAiEnabled({} as any)).toBe(false);
  });
});
