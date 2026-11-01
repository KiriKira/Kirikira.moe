import { describe, expect, it, vi } from 'vitest';
import { AI_MODEL, aiSpamCheck, buildState, isAiEnabled } from '../src/lib/comments/ai';

const fakeAi = (impl: (model: string, body: any) => Promise<unknown>) => ({ run: vi.fn(impl) }) as unknown as Ai;

describe('aiSpamCheck', () => {
  it('sends a multi-question Clef-flash request with post and commenter context', async () => {
    const ai = fakeAi(async () => ({
      answers: {
        spam: { type: 'noul', noul: 0.97 },
        generic: { type: 'noul', noul: 0.4 },
        commercial: { type: 'noul', noul: 0.88 },
        onTopic: { type: 'noul', noul: 0.1 },
        kind: { type: 'choice', choice: 'scam', probabilities: {} },
      },
    }));
    const r = await aiSpamCheck(ai, {
      name: 'online casino',
      url: 'https://1winchile-casino.xyz/page',
      email: 'Curt_Frei@Yahoo.com',
      body: 'Attractive section of content. cnn.com bbc.com',
      postTitle: '我曾出现在你的梦里吗',
      postExcerpt: '本文使用 Rime 写作',
    });
    expect(r).toEqual({ spam: 0.97, kind: 'scam', generic: 0.4, commercial: 0.88, onTopic: 0.1 });
    const [model, body] = (ai as any).run.mock.calls[0];
    expect(model).toBe(AI_MODEL);
    expect(body.model).toBe('clef-flash');
    expect(body.state.post).toEqual({ title: '我曾出现在你的梦里吗', summary: '本文使用 Rime 写作' });
    expect(body.state.commenter).toEqual({
      name: 'online casino',
      website: 'https://1winchile-casino.xyz/page',
      website_domain: '1winchile-casino.xyz',
      email_domain: 'yahoo.com',
    });
    expect(body.state.facts).toEqual({ comment_language: 'not Chinese', comment_characters: 46, links_or_domains_in_comment: 2 });
    expect(Object.keys(body.questions).sort()).toEqual(['commercial', 'generic', 'kind', 'onTopic', 'spam']);
  });

  it('describes Chinese comments and missing fields plainly', () => {
    const s = buildState({ name: '路人', url: '', body: '=W= 好耶' });
    expect(s.commenter).toMatchObject({ website: '(none)', website_domain: '(none)', email_domain: '(none)' });
    expect(s.facts.comment_language).toBe('Chinese/Japanese/Korean');
  });

  it('returns null on errors, garbage or timeouts instead of throwing', async () => {
    expect(await aiSpamCheck(fakeAi(async () => { throw new Error('quota'); }), { name: 'a', url: '', body: 'b' })).toBeNull();
    expect(await aiSpamCheck(fakeAi(async () => ({ answers: {} })), { name: 'a', url: '', body: 'b' })).toBeNull();
    vi.useFakeTimers();
    const pending = aiSpamCheck(fakeAi(() => new Promise(() => {})), { name: 'a', url: '', body: 'b' });
    await vi.advanceTimersByTimeAsync(6000);
    expect(await pending).toBeNull();
    vi.useRealTimers();
  });

  it('ignores unknown categories and clamps probabilities', async () => {
    const ai = fakeAi(async () => ({ answers: { spam: { type: 'noul', noul: 1.2 }, kind: { type: 'choice', choice: 'weird' } } }));
    expect(await aiSpamCheck(ai, { name: 'a', url: '', body: 'b' })).toMatchObject({ spam: 1, kind: null });
  });

  it('can be switched off', () => {
    expect(isAiEnabled({ AI: {} as Ai, AI_SPAM_CHECK: 'off' })).toBe(false);
    expect(isAiEnabled({ AI: {} as Ai })).toBe(true);
    expect(isAiEnabled({ AI: undefined })).toBe(false);
  });
});
