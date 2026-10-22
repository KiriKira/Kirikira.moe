import { defineHastPlugin, defineMdastPlugin } from 'satteri';

/**
 * Media in plain Markdown, so posts never need hand-written HTML:
 *
 *   ![说明](https://media.kirikira.moe/a.mp4)          -> <video controls>
 *   ![说明](https://media.kirikira.moe/a.mp4 "loop")   -> muted autoplay loop, like a GIF
 *   ![说明](https://media.kirikira.moe/a.mp3)          -> <audio controls>
 *   ![说明](https://media.kirikira.moe/a.webp "标题")  -> <figure> with caption (on its own line)
 *   https://www.bilibili.com/video/BV1xx411c7mD        -> embedded player, when the bare link
 *   https://www.youtube.com/watch?v=dQw4w9WgXcQ           is the only thing in its paragraph
 *   https://music.163.com/#/song?id=123456
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

function mediaHtml(url, alt, title) {
  const caption = title && title !== 'loop' ? `<figcaption>${esc(title)}</figcaption>` : '';
  if (VIDEO_RE.test(url)) {
    const attrs =
      title === 'loop' ? 'autoplay muted loop playsinline' : 'controls preload="metadata" playsinline';
    return `<video ${attrs} src="${esc(url)}"${alt ? ` aria-label="${esc(alt)}"` : ''}></video>${caption}`;
  }
  if (AUDIO_RE.test(url)) {
    return `<audio controls preload="metadata" src="${esc(url)}"${alt ? ` aria-label="${esc(alt)}"` : ''}></audio>${caption}`;
  }
  return null;
}

export const mediaEmbeds = defineMdastPlugin({
  name: 'kirikira-media-embeds',

  paragraph(node) {
    const children = node.children ?? [];
    if (children.length !== 1) return;
    const only = children[0];

    // A media file or captioned image alone in its paragraph -> <figure>
    if (only.type === 'image') {
      const media = mediaHtml(only.url, only.alt, only.title);
      if (media) return { type: 'html', value: `<figure class="media">${media}</figure>` };
      if (only.title) {
        return {
          type: 'html',
          value:
            `<figure class="media"><img src="${esc(only.url)}" alt="${esc(only.alt ?? '')}" loading="lazy" decoding="async">` +
            `<figcaption>${esc(only.title)}</figcaption></figure>`,
        };
      }
      return;
    }

    // A bare link alone in its paragraph -> embedded player
    if (only.type === 'link') {
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

  // Media files mixed into running text
  image(node) {
    const media = mediaHtml(node.url, node.alt, null);
    if (media) return { type: 'html', value: media };
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
