import { defineHastPlugin, defineMdastPlugin } from 'satteri';
import { probeImage } from './image-size.mjs';

/**
 * Media in plain Markdown, so posts never need hand-written HTML:
 *
 *   ![说明](a.webp)                 alone on a line -> figure sized by orientation
 *                                   (landscape 80%, portrait 50%, square 60%), click to zoom
 *   ![说明](a.webp "图注")          the same, with a caption
 *   ![a](1.webp)                     several images/videos on consecutive lines (no blank
 *   ![b](2.webp)                     line between them) -> gallery: a stack of cards in the
 *                                    browser (src/scripts/gallery-stack.ts), a swipeable
 *                                    centred strip without JS
 *   ![说明](a.mp4)                   <video controls>; "loop" title = muted autoplay loop (GIF-like)
 *   ![说明](a.mp3)                   <audio controls>
 *   https://www.bilibili.com/video/BV1xx411c7mD   a bare link alone in its paragraph ->
 *   https://www.youtube.com/watch?v=dQw4w9WgXcQ   embedded player (also music.163.com songs)
 *
 * Image sizes are read at build time (image-size.mjs); the browser side lives in
 * src/scripts/media.ts (gallery controls, lightbox, sizing of unknown/video media).
 */

const VIDEO_RE = /\.(mp4|webm|m4v|mov|ogv)(\?.*)?$/i;
const AUDIO_RE = /\.(mp3|m4a|aac|ogg|oga|opus|flac|wav)(\?.*)?$/i;

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Seconds from YouTube's t= / start= ("90", "1m30s", "1h2m3s"). */
function seconds(t) {
  if (!t) return 0;
  if (/^\d+$/.test(t)) return Number(t);
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0;
}

/** Player iframe for a supported video/music page URL, or null. */
export function embedFor(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m)\./, '');

  if (host === 'youtube.com' || host === 'youtu.be' || host === 'youtube-nocookie.com') {
    let id = null;
    if (host === 'youtu.be') id = url.pathname.slice(1);
    else if (url.pathname === '/watch') id = url.searchParams.get('v');
    else id = url.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]+)/)?.[1] ?? null;
    if (!id || !/^[\w-]{6,}$/.test(id)) return null;
    const start = seconds(url.searchParams.get('t') ?? url.searchParams.get('start'));
    const src = `https://www.youtube-nocookie.com/embed/${id}${start ? `?start=${start}` : ''}`;
    return { kind: 'video', src, title: 'YouTube video' };
  }

  if (host === 'bilibili.com' || host === 'player.bilibili.com') {
    const m = url.pathname.match(/^\/video\/(BV[\w]+|av\d+)/i);
    const bvid = url.searchParams.get('bvid') ?? (m && /^BV/i.test(m[1]) ? m[1] : null);
    const aid = url.searchParams.get('aid') ?? (m && /^av/i.test(m[1]) ? m[1].slice(2) : null);
    if (!bvid && !aid) return null;
    const params = new URLSearchParams(bvid ? { bvid } : { aid });
    params.set('page', url.searchParams.get('p') ?? '1');
    params.set('autoplay', '0');
    params.set('high_quality', '1');
    return { kind: 'video', src: `https://player.bilibili.com/player.html?${params}`, title: 'Bilibili video' };
  }

  if (host === 'music.163.com') {
    // Song pages live in the hash: https://music.163.com/#/song?id=123
    const id = (url.hash.match(/song\?id=(\d+)/) ?? url.search.match(/[?&]id=(\d+)/))?.[1];
    if (!id || !/song/.test(url.hash + url.pathname)) return null;
    return {
      kind: 'music',
      src: `https://music.163.com/outchain/player?type=2&id=${id}&auto=0&height=66`,
      title: 'NetEase Cloud Music',
    };
  }
  return null;
}

/** landscape / portrait / square, the classes the CSS sizes figures by. */
export function orientation(width, height) {
  const r = width / height;
  return r >= 1.15 ? 'landscape' : r <= 0.87 ? 'portrait' : 'square';
}

const kindOf = (url) => (VIDEO_RE.test(url) ? 'video' : AUDIO_RE.test(url) ? 'audio' : 'image');

function captionHtml(title) {
  return title && title !== 'loop' ? `<figcaption>${esc(title)}</figcaption>` : '';
}

function videoTag(url, alt, title) {
  const attrs = title === 'loop' ? 'autoplay muted loop playsinline' : 'controls preload="metadata" playsinline';
  return `<video ${attrs} src="${esc(url)}"${alt ? ` aria-label="${esc(alt)}"` : ''}></video>`;
}

function audioTag(url, alt) {
  return `<audio controls preload="metadata" src="${esc(url)}"${alt ? ` aria-label="${esc(alt)}"` : ''}></audio>`;
}

function imgTag(url, alt, size) {
  const dims = size ? ` width="${size.width}" height="${size.height}"` : '';
  return `<img src="${esc(url)}" alt="${esc(alt ?? '')}"${dims} loading="lazy" decoding="async">`;
}

/** One image/video/audio alone in its paragraph. */
async function figureHtml(node) {
  const kind = kindOf(node.url);
  const caption = captionHtml(node.title);
  if (kind === 'audio') return `<figure class="media media-audio">${audioTag(node.url, node.alt)}${caption}</figure>`;
  if (kind === 'video') {
    // Orientation of videos is only known once metadata loads (src/scripts/media.ts).
    return `<figure class="media media-video is-unknown">${videoTag(node.url, node.alt, node.title)}${caption}</figure>`;
  }
  const size = await probeImage(node.url);
  const cls = size ? `is-${orientation(size.width, size.height)}` : 'is-unknown';
  const style = size ? ` style="--w:${size.width}px;--ar:${+(size.width / size.height).toFixed(4)}"` : '';
  return `<figure class="media media-image ${cls}"${style}>${imgTag(node.url, node.alt, size)}${caption}</figure>`;
}

/**
 * Two or more images/videos on consecutive lines.
 *
 * The gallery's height must not change while flipping or loading, or the text below would
 * jump. So everything that decides it is written into the HTML (global.css does the maths,
 * before any script runs):
 *  - --min-ar: the narrowest card's aspect ratio; the stack is as tall as that card. Left out
 *    when any shape is unknown (videos, images the build couldn't read): CSS then reserves
 *    the maximum height, and those cards are sized inside it once they load.
 *  - all captions in one slot, the current one visible: the slot is as tall as the longest.
 */
async function galleryHtml(images) {
  let minAr = Infinity;
  let unknown = false;
  const captions = images.map((node) => (node.title && node.title !== 'loop' ? node.title : ''));
  const items = await Promise.all(
    images.map(async (node) => {
      const caption = captionHtml(node.title);
      if (kindOf(node.url) === 'video') {
        unknown = true; // shape known only once its metadata loads
        return `<figure class="gallery-item gallery-video">${videoTag(node.url, node.alt, node.title)}${caption}</figure>`;
      }
      const size = await probeImage(node.url);
      if (size) minAr = Math.min(minAr, size.width / size.height);
      else unknown = true;
      const style = size ? ` style="--ar:${size.width}/${size.height}"` : '';
      return `<figure class="gallery-item"${style}>${imgTag(node.url, node.alt, size)}${caption}</figure>`;
    }),
  );
  const style = unknown ? '' : ` style="--min-ar:${+minAr.toFixed(4)}"`;
  const captionSlot = captions.some(Boolean)
    ? `<div class="gallery-captions">${captions.map((c, i) => `<p${i === 0 ? ' class="is-current"' : ''}>${esc(c)}</p>`).join('')}</div>`
    : '';
  return (
    `<div class="gallery" role="region" aria-roledescription="carousel" aria-label="图集，共 ${images.length} 项"${style}>` +
    `<div class="gallery-track" tabindex="0">${items.join('')}</div>${captionSlot}</div>`
  );
}

/** An image inside running text: small ones (icons, emoji) stay inline, big ones break out. */
async function inlineImage(node) {
  const size = await probeImage(node.url);
  const small = size && size.height <= 64;
  const cls = small ? 'img-inline' : 'img-block';
  const dims = size ? ` width="${size.width}" height="${size.height}"` : '';
  return `<img class="${cls}" src="${esc(node.url)}" alt="${esc(node.alt ?? '')}"${dims} loading="lazy" decoding="async">`;
}

const isBlank = (n) => n.type === 'break' || (n.type === 'text' && n.value.trim() === '');

export const mediaEmbeds = defineMdastPlugin({
  name: 'kirikira-media-embeds',

  async paragraph(node) {
    const children = (node.children ?? []).filter((n) => !isBlank(n));
    if (!children.length) return;

    // Only images (each on its own line) -> figure or gallery
    if (children.every((n) => n.type === 'image')) {
      if (children.length === 1) return { type: 'html', value: await figureHtml(children[0]) };
      if (children.some((n) => kindOf(n.url) === 'audio')) {
        const figures = await Promise.all(children.map(figureHtml));
        return { type: 'html', value: figures.join('\n') };
      }
      return { type: 'html', value: await galleryHtml(children) };
    }

    // Images/videos mixed into running text: swap just those nodes
    if (children.some((n) => n.type === 'image')) {
      return {
        type: 'paragraph',
        children: await Promise.all(
          node.children.map(async (n) => {
            if (n.type !== 'image') return n;
            const kind = kindOf(n.url);
            if (kind === 'video') return { type: 'html', value: videoTag(n.url, n.alt, null) };
            if (kind === 'audio') return { type: 'html', value: audioTag(n.url, n.alt) };
            return { type: 'html', value: await inlineImage(n) };
          }),
        ),
      };
    }

    // A bare link alone in its paragraph -> embedded player
    if (children.length === 1 && children[0].type === 'link') {
      const only = children[0];
      const text = only.children?.length === 1 && only.children[0].type === 'text' ? only.children[0].value : null;
      if (text === null || text.trim() !== only.url) return;
      const embed = embedFor(only.url);
      if (!embed) return;
      const cls = embed.kind === 'music' ? 'embed embed-music' : 'embed';
      return {
        type: 'html',
        value:
          `<div class="${cls}"><iframe src="${esc(embed.src)}" title="${embed.title}" loading="lazy" ` +
          `allow="encrypted-media; fullscreen; picture-in-picture" allowfullscreen ` +
          `referrerpolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"></iframe></div>`,
      };
    }
  },
});

/** Lazy-load every Markdown image. */
export const lazyImages = defineHastPlugin({
  name: 'kirikira-lazy-images',
  element: {
    filter: ['img'],
    visit(node, ctx) {
      if (node.properties.loading === undefined) ctx.setProperty(node, 'loading', 'lazy');
      if (node.properties.decoding === undefined) ctx.setProperty(node, 'decoding', 'async');
    },
  },
});
