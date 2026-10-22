import { describe, expect, it } from 'vitest';
import { validateComment } from '../src/lib/comments/validate';

describe('validateComment', () => {
  const base = { post: '12', name: ' Kiri ', body: '你好\n\n', email: '', url: '' };

  it('trims and accepts a minimal comment', () => {
    expect(validateComment(base)).toEqual({
      ok: true,
      value: { postId: '12', parentId: null, name: 'Kiri', email: '', url: '', body: '你好' },
    });
  });

  it('reports human-fixable errors', () => {
    const r = validateComment({ post: '12', name: '', body: '  ', email: 'nope', url: 'javascript:alert(1)' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['body', 'email', 'name', 'url']);
  });

  it('accepts parentId as number or numeric string', () => {
    expect(validateComment({ ...base, parentId: 3 })).toMatchObject({ ok: true, value: { parentId: 3 } });
    expect(validateComment({ ...base, parentId: '4' })).toMatchObject({ ok: true, value: { parentId: 4 } });
    expect(validateComment({ ...base, parentId: -1 }).ok).toBe(false);
  });

  it('enforces length limits', () => {
    expect(validateComment({ ...base, name: 'x'.repeat(51) }).ok).toBe(false);
    expect(validateComment({ ...base, body: 'x'.repeat(5001) }).ok).toBe(false);
  });
});
