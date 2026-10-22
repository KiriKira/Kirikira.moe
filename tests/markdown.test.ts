import { describe, expect, it } from 'vitest';
import { markdownToHtml } from 'satteri';
import { embedFor, lazyImages, mediaEmbeds } from '../src/lib/markdown/media.mjs';
import { externalLinks } from '../src/lib/markdown/external-links.mjs';

// Same pipeline as astro.config.mjs (minus Shiki).
const render = (md: string) =>
  markdownToHtml(md, {
    features: { gfm: true, subscript: true, smartPunctuation: false },
    mdastPlugins: [mediaEmbeds],
    hastPlugins: [externalLinks, lazyImages],
  }).html.trim();

describe('media in Markdown', () => {
  it('turns a video "image" on its own line into a <figure><video>', () => {
    const html = render('![猫猫](https://media.kirikira.moe/2026/cat.mp4)');
    expect(html).toBe(
      '<figure class="media"><video controls preload="metadata" playsinline src="https://media.kirikira.moe/2026/cat.mp4" aria-label="猫猫"></video></figure>',
    );
  });

  it('supports GIF-like looping videos and captions', () => {
    expect(render('![x](https://m.example/a.webm "loop")')).toContain('<video autoplay muted loop playsinline');
    expect(render('![x](https://m.example/a.mp4 "第一次见面")')).toContain('<figcaption>第一次见面</figcaption>');
  });

  it('turns audio files into <audio>', () => {
    expect(render('![歌](https://m.example/song.mp3)')).toContain('<audio controls preload="metadata" src="https://m.example/song.mp3"');
  });

  it('handles video inline in a paragraph', () => {
    expect(render('看 ![x](https://m.example/a.mp4) 这个')).toBe(
      '<p>看 <video controls preload="metadata" playsinline src="https://m.example/a.mp4" aria-label="x"></video> 这个</p>',
    );
  });

  it('captions images with a title and lazy-loads all images', () => {
    expect(render('![图](https://m.example/a.webp "标题")')).toBe(
      '<figure class="media"><img src="https://m.example/a.webp" alt="图" loading="lazy" decoding="async"><figcaption>标题</figcaption></figure>',
    );
    expect(render('![图](https://m.example/a.webp)')).toContain('loading="lazy"');
  });

  it('escapes attribute values', () => {
    expect(render('![a"b](https://m.example/a.mp4 "<x>")')).toContain('aria-label="a&quot;b"');
    expect(render('![a"b](https://m.example/a.mp4 "<x>")')).toContain('<figcaption>&lt;x&gt;</figcaption>');
  });

  it('embeds a bare Bilibili/YouTube link that stands alone', () => {
    const bili = render('https://www.bilibili.com/video/BV1xx411c7mD?p=2');
    expect(bili).toContain('<div class="embed"><iframe src="https://player.bilibili.com/player.html?bvid=BV1xx411c7mD&amp;page=2');
    expect(render('<https://youtu.be/dQw4w9WgXcQ>')).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"');
  });

  it('leaves named links and links inside sentences alone', () => {
    expect(render('[视频](https://www.youtube.com/watch?v=dQw4w9WgXcQ)')).not.toContain('iframe');
    expect(render('看 https://www.youtube.com/watch?v=dQw4w9WgXcQ 吧')).not.toContain('iframe');
  });
});

describe('embedFor', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=90'],
    ['https://youtube.com/shorts/abcdefghijk', 'https://www.youtube-nocookie.com/embed/abcdefghijk'],
    ['https://www.bilibili.com/video/av170001', 'https://player.bilibili.com/player.html?aid=170001&page=1&autoplay=0&high_quality=1'],
    ['https://music.163.com/#/song?id=28391863', 'https://music.163.com/outchain/player?type=2&id=28391863&auto=0&height=66'],
  ])('%s', (url, src) => {
    expect(embedFor(url)?.src).toBe(src);
  });

  it('ignores everything else', () => {
    expect(embedFor('https://github.com/x')).toBeNull();
    expect(embedFor('https://www.youtube.com/channel/abc')).toBeNull();
    expect(embedFor('not a url')).toBeNull();
  });
});
