import { describe, expect, it } from 'vitest';
import {
  autoExcerpt,
  convertDetails,
  convertInlineHilite,
  escapeSpacedSubscripts,
  findImageUrls,
  findSingleTildes,
  normalizeHeadings,
  parseDjangoDate,
  renderFrontMatter,
  setextToAtx,
  sql,
  stripTitleHeading,
  transformBody,
  type Warning,
} from '../scripts/migrate/lib.ts';

describe('parseDjangoDate', () => {
  it('treats naive values as UTC (USE_TZ=True, TIME_ZONE=UTC)', () => {
    expect(parseDjangoDate('2018-02-08 12:55:00.123456').toISOString()).toBe('2018-02-08T12:55:00.123Z');
    expect(parseDjangoDate('2018-02-08 12:55:00').toISOString()).toBe('2018-02-08T12:55:00.000Z');
  });
  it('honours explicit offsets', () => {
    expect(parseDjangoDate('2018-02-08 20:55:00+08:00').toISOString()).toBe('2018-02-08T12:55:00.000Z');
    expect(parseDjangoDate('2018-02-08T12:55:00Z').toISOString()).toBe('2018-02-08T12:55:00.000Z');
  });
  it('rejects garbage', () => {
    expect(() => parseDjangoDate('yesterday')).toThrow();
  });
});

describe('stripTitleHeading', () => {
  it('removes a setext or ATX heading repeating the title', () => {
    expect(stripTitleHeading('Rime 初体验笔记\n==============\n\n正文', 'Rime 初体验笔记')).toBe('正文');
    expect(stripTitleHeading('\n# Rime初体验笔记\n\n正文', 'Rime 初体验笔记')).toBe('正文');
  });
  it('keeps other headings', () => {
    expect(stripTitleHeading('# 前言\n\n正文', '标题')).toBe('# 前言\n\n正文');
  });
});

describe('headings', () => {
  it('converts setext to ATX outside code', () => {
    expect(setextToAtx('Title\n=====\n\nSub\n---\n\n```\nnot\n===\n```')).toBe('# Title\n\n## Sub\n\n```\nnot\n===\n```');
  });
  it('does not treat a horizontal rule after a blank line as a heading', () => {
    expect(setextToAtx('para\n\n---\n\nmore')).toBe('para\n\n---\n\nmore');
  });
  it('shifts so the shallowest heading is h2, ignoring # comments in code', () => {
    expect(normalizeHeadings('# A\n## B\n```sh\n# comment\n```')).toBe('## A\n### B\n```sh\n# comment\n```');
    expect(normalizeHeadings('### A\n#### B')).toBe('## A\n### B');
    expect(normalizeHeadings('## A')).toBe('## A');
  });
});

describe('pymdownx conversions', () => {
  it('converts details blocks', () => {
    const w: Warning[] = [];
    const out = convertDetails('前\n\n??? note "点我"\n    内容\n\n    第二段\n\n后', w);
    expect(out).toBe('前\n\n<details><summary>点我</summary>\n\n内容\n\n第二段\n\n</details>\n\n后');
    expect(w).toHaveLength(1);
    expect(convertDetails('???+ warning\n    x', [])).toContain('<details open><summary>Warning</summary>');
  });
  it('converts inlinehilite', () => {
    expect(convertInlineHilite('a `#!python print(1)` b `:::js x()`', [])).toBe('a `print(1)` b `x()`');
  });
  it('finds single-tilde subscripts but not strikethrough or code', () => {
    expect(findSingleTildes('H~2~O ~~del~~ `a~b~c`\n    "~" : "~"')).toEqual(['2']);
  });
  it('escapes ~a b~ (never a subscript on the old site) but keeps H~2~O', () => {
    expect(escapeSpacedSubscripts('H~2~O 和 3~5 分钟到 10~20 `x~ y~`')).toBe('H~2~O 和 3\\~5 分钟到 10\\~20 `x~ y~`');
  });
});

describe('findImageUrls', () => {
  it('finds markdown, html and reference images', () => {
    const body = '![a](https://i.yusa.me/x.png "t")\n<img src="/static/img/k.jpg">\n[r]: https://e.com/y.gif\n[l](https://not-image.com)';
    expect(findImageUrls(body).sort()).toEqual(['/static/img/k.jpg', 'https://e.com/y.gif', 'https://i.yusa.me/x.png']);
  });
});

describe('autoExcerpt', () => {
  it('uses paragraph text only', () => {
    const body = '## 标题\n\n第一段 [链接](https://x)。\n\n```\ncode\n```\n\n第二段\n\n[^1]: 脚注';
    expect(autoExcerpt(body)).toBe('第一段 链接。 第二段');
  });
  it('truncates long text', () => {
    expect(autoExcerpt('字'.repeat(200), 10)).toBe(`${'字'.repeat(10)}…`);
  });
});

describe('transformBody + front matter', () => {
  it('produces valid front matter and a cleaned body', () => {
    const { body } = transformBody('标题\n===\n\n# 一\n\n内容\r\n', '标题');
    expect(body).toBe('## 一\n\n内容\n');
    const fm = renderFrontMatter({
      title: 'He said "hi": ok',
      slug: '12',
      date: new Date('2018-01-01T00:00:00Z'),
      category: '技术',
      tags: ['a', 'b'],
      draft: false,
      legacyId: 12,
    });
    expect(fm).toContain('title: "He said \\"hi\\": ok"');
    expect(fm).toContain('legacyId: 12');
    expect(fm).toContain('cid: "12"');
  });
  it('escapes SQL strings', () => {
    expect(sql("it's")).toBe("'it''s'");
    expect(sql(null)).toBe('NULL');
    expect(sql(3)).toBe('3');
  });
});
