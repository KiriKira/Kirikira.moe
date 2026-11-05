import { describe, expect, it } from 'vitest';
import { markdownToHtml } from 'satteri';
import { embedFor, lazyImages, mediaEmbeds, orientation } from '../src/lib/markdown/media.mjs';
import { externalLinks } from '../src/lib/markdown/external-links.mjs';

// Same pipeline as astro.config.mjs (minus Shiki). Local /img/... files are measured
// from public/; remote probing is off in tests (vitest.config.ts).
const render = async (md: string) =>
  (
    await markdownToHtml(md, {
      features: { gfm: true, subscript: true, smartPunctuation: false },
      mdastPlugins: [mediaEmbeds],
      hastPlugins: [externalLinks, lazyImages],
    })
  ).html.trim();

describe('standalone images', () => {
  it('sizes by orientation using the real file size (public/img/kiri.jpg is 640x640)', async () => {
    expect(await render('![方](/img/kiri.jpg)')).toBe(
      '<figure class="media media-image is-square" style="--w:640px;--ar:1"><img src="/img/kiri.jpg" alt="方" width="640" height="640" loading="lazy" decoding="async"></figure>',
    );
  });

  it('adds a caption from the title', async () => {
    expect(await render('![图](/img/kiri.jpg "标题")')).toContain('<figcaption>标题</figcaption></figure>');
  });

  it('falls back to browser-side sizing when the size is unknown', async () => {
    expect(await render('![x](https://media.example/a.webp)')).toBe(
      '<figure class="media media-image is-unknown"><img src="https://media.example/a.webp" alt="x" loading="lazy" decoding="async"></figure>',
    );
  });

  it('classifies orientation', () => {
    expect(orientation(1600, 900)).toBe('landscape');
    expect(orientation(600, 1080)).toBe('portrait');
    expect(orientation(1000, 1050)).toBe('square');
  });
});

describe('galleries', () => {
  it('turns images on consecutive lines into a carousel', async () => {
    const html = await render('![a](/img/kiri.jpg "一")\n![b](https://media.example/b.webp)\n![c](https://media.example/c.mp4)');
    // A video / an unreadable image: no --min-ar, so CSS reserves the full height.
    expect(html).toMatch(/^<div class="gallery" role="region" aria-roledescription="carousel" aria-label="图集，共 3 项"><div class="gallery-track"/);
    expect(html).toContain('<figure class="gallery-item" style="--ar:640/640"><img src="/img/kiri.jpg" alt="a" width="640" height="640"');
    expect(html).toContain('<figcaption>一</figcaption>');
    expect(html).toContain('<figure class="gallery-item"><img src="https://media.example/b.webp"');
    expect(html).toContain('<figure class="gallery-item gallery-video"><video controls');
    // Every caption in one slot (as tall as the longest), the first one shown.
    expect(html).toContain('<div class="gallery-captions"><p class="is-current">一</p><p></p><p></p></div></div>');
  });

  it('gives the gallery the narrowest shape when every size is known (fixed height)', async () => {
    const html = await render('![a](/img/kiri.jpg)\n![b](/img/kiri.jpg)');
    expect(html).toMatch(/^<div class="gallery"[^>]* style="--min-ar:1">/);
    expect(html).not.toContain('gallery-captions');
  });

  it('keeps blank-line-separated images as separate figures', async () => {
    const html = await render('![a](/img/kiri.jpg)\n\n![b](/img/kiri.jpg)');
    expect(html).not.toContain('gallery');
    expect(html.match(/<figure/g)).toHaveLength(2);
  });
});

describe('video, audio, inline media', () => {
  it('turns a video "image" on its own line into a figure', async () => {
    expect(await render('![猫猫](https://media.kirikira.moe/2026/cat.mp4)')).toBe(
      '<figure class="media media-video is-unknown"><video controls preload="metadata" playsinline src="https://media.kirikira.moe/2026/cat.mp4" aria-label="猫猫"></video></figure>',
    );
  });

  it('supports GIF-like looping videos and captions', async () => {
    expect(await render('![x](https://m.example/a.webm "loop")')).toContain('<video autoplay muted loop playsinline');
    expect(await render('![x](https://m.example/a.mp4 "第一次见面")')).toContain('<figcaption>第一次见面</figcaption>');
  });

  it('turns audio files into <audio>', async () => {
    expect(await render('![歌](https://m.example/song.mp3)')).toContain('<audio controls preload="metadata" src="https://m.example/song.mp3"');
  });

  it('handles media inside running text', async () => {
    expect(await render('看 ![x](https://m.example/a.mp4) 这个')).toBe(
      '<p>看 <video controls preload="metadata" playsinline src="https://m.example/a.mp4" aria-label="x"></video> 这个</p>',
    );
    // favicon.ico is 16px tall: stays inline like an emoji
    expect(await render('图标 ![i](/favicon.ico) 在文字里')).toContain('<img class="img-inline" src="/favicon.ico"');
    expect(await render('照片 ![p](/img/kiri.jpg) 在文字里')).toContain('<img class="img-block" src="/img/kiri.jpg"');
  });

  it('escapes attribute values', async () => {
    const html = await render('![a"b](https://m.example/a.mp4 "<x>")');
    expect(html).toContain('aria-label="a&quot;b"');
    expect(html).toContain('<figcaption>&lt;x&gt;</figcaption>');
  });
});

describe('embeds', () => {
  it('embeds a bare Bilibili/YouTube link that stands alone', async () => {
    expect(await render('https://www.bilibili.com/video/BV1xx411c7mD?p=2')).toContain(
      '<div class="embed"><iframe src="https://player.bilibili.com/player.html?bvid=BV1xx411c7mD&amp;page=2',
    );
    expect(await render('<https://youtu.be/dQw4w9WgXcQ>')).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"');
  });

  it('leaves named links and links inside sentences alone', async () => {
    expect(await render('[视频](https://www.youtube.com/watch?v=dQw4w9WgXcQ)')).not.toContain('iframe');
    expect(await render('看 https://www.youtube.com/watch?v=dQw4w9WgXcQ 吧')).not.toContain('iframe');
  });

  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=90'],
    ['https://youtube.com/shorts/abcdefghijk', 'https://www.youtube-nocookie.com/embed/abcdefghijk'],
    ['https://www.bilibili.com/video/av170001', 'https://player.bilibili.com/player.html?aid=170001&page=1&autoplay=0&high_quality=1'],
    ['https://music.163.com/#/song?id=28391863', 'https://music.163.com/outchain/player?type=2&id=28391863&auto=0&height=66'],
  ])('embedFor %s', (url, src) => {
    expect(embedFor(url)?.src).toBe(src);
  });

  it('ignores everything else', () => {
    expect(embedFor('https://github.com/x')).toBeNull();
    expect(embedFor('https://www.youtube.com/channel/abc')).toBeNull();
    expect(embedFor('not a url')).toBeNull();
  });
});
