import { describe, expect, it, vi } from 'vitest';
import { AI_MODEL, aiSpamCheck, isAiEnabled } from '../src/lib/comments/ai';

const fakeAi = (impl: (model: string, body: any) => Promise<unknown>) => ({ run: vi.fn(impl) }) as unknown as Ai;

describe('aiSpamCheck', () => {
  it('sends a Clef-flash decision request and reads the noul/choice answers', async () => {
    const ai = fakeAi(async () => ({
      answers: { spam: { type: 'noul', noul: 0.97 }, kind: { type: 'choice', choice: 'scam', probabilities: {} } },
    }));
    const r = await aiSpamCheck(ai, { name: 'x', url: 'https://bad.example', body: '加V领福利', postTitle: '标题' });
    expect(r).toEqual({ spam: 0.97, kind: 'scam' });
    const [model, body] = (ai as any).run.mock.calls[0];
    expect(model).toBe(AI_MODEL);
    expect(body.model).toBe('clef-flash');
    expect(body.state).toMatchObject({ commenter_name: 'x', comment: '加V领福利', post_title: '标题' });
    expect(body.questions.spam.type).toBe('noul');
    expect(Object.keys(body.questions.kind.criteria)).toContain('normal');
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
    expect(await aiSpamCheck(ai, { name: 'a', url: '', body: 'b' })).toEqual({ spam: 1, kind: null });
  });

  it('can be switched off', () => {
    expect(isAiEnabled({ AI: {} as Ai, AI_SPAM_CHECK: 'off' })).toBe(false);
    expect(isAiEnabled({ AI: {} as Ai })).toBe(true);
    expect(isAiEnabled({ AI: undefined })).toBe(false);
  });
});
