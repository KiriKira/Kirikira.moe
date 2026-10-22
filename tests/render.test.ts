import { describe, expect, it } from 'vitest';
import { renderCommentBody } from '../src/lib/comments/render';

describe('renderCommentBody', () => {
  it('escapes raw HTML', () => {
    const html = renderCommentBody('<script>alert(1)</script><img src=x onerror=alert(1)>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });

  it('marks links nofollow ugc and refuses javascript: URLs', () => {
    const html = renderCommentBody('[a](https://x.com) [b](javascript:alert(1)) https://y.com');
    expect(html).toContain('rel="nofollow ugc noopener noreferrer"');
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('href="https://y.com"');
  });

  it('does not render images or headings', () => {
    const html = renderCommentBody('# big\n\n![x](https://t.example/p.gif)');
    expect(html).not.toContain('<h1');
    expect(html).not.toContain('<img');
  });

  it('renders basic markdown', () => {
    expect(renderCommentBody('*a* `b`\nc')).toBe('<p><em>a</em> <code>b</code><br>\nc</p>\n');
  });
});
