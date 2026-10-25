/**
 * Browser side of Markdown media (see src/lib/markdown/media.mjs):
 *  - sizes figures whose dimensions weren't known at build time (videos, failed probes)
 *  - adds prev/next buttons, counter and dots to galleries (they swipe natively without JS)
 *  - click/tap any post image to open a zoomable, swipeable lightbox (PhotoSwipe,
 *    downloaded on first use only)
 */
import 'photoswipe/style.css';
import type PhotoSwipe from 'photoswipe';
import type { SlideData } from 'photoswipe';

const orientation = (w: number, h: number) => {
  const r = w / h;
  return r >= 1.15 ? 'landscape' : r <= 0.87 ? 'portrait' : 'square';
};

function applySize(figure: HTMLElement, w: number, h: number) {
  if (!w || !h) return;
  figure.classList.remove('is-unknown');
  figure.classList.add(`is-${orientation(w, h)}`);
  figure.style.setProperty('--w', `${w}px`);
  figure.style.setProperty('--ar', String(w / h));
}

function sizeUnknownFigures(root: ParentNode) {
  for (const figure of root.querySelectorAll<HTMLElement>('figure.media.is-unknown')) {
    const img = figure.querySelector('img');
    const video = figure.querySelector('video');
    if (img) {
      if (img.complete && img.naturalWidth) applySize(figure, img.naturalWidth, img.naturalHeight);
      else img.addEventListener('load', () => applySize(figure, img.naturalWidth, img.naturalHeight), { once: true });
    } else if (video) {
      if (video.readyState >= 1) applySize(figure, video.videoWidth, video.videoHeight);
      else video.addEventListener('loadedmetadata', () => applySize(figure, video.videoWidth, video.videoHeight), { once: true });
    }
  }
}

// ---------- galleries ----------

function button(cls: string, label: string, text: string) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.setAttribute('aria-label', label);
  b.textContent = text;
  return b;
}

function enhanceGallery(gallery: HTMLElement) {
  const track = gallery.querySelector<HTMLElement>('.gallery-track')!;
  const items = [...track.querySelectorAll<HTMLElement>('.gallery-item')];
  if (items.length < 2) return;

  const prev = button('gallery-btn gallery-prev', '上一张', '‹');
  const next = button('gallery-btn gallery-next', '下一张', '›');
  const meta = document.createElement('div');
  meta.className = 'gallery-meta';
  const count = document.createElement('span');
  count.className = 'gallery-count';
  const dots = document.createElement('div');
  dots.className = 'gallery-dots';
  const dotButtons = items.map((_, i) => {
    const d = button('gallery-dot', `第 ${i + 1} 张`, '');
    d.addEventListener('click', () => goTo(i));
    dots.appendChild(d);
    return d;
  });
  // appendChild, not append(): the Workers types sharing this tsconfig redeclare Element.append.
  meta.appendChild(count);
  meta.appendChild(dots);
  for (const el of [prev, next, meta]) gallery.appendChild(el);
  gallery.classList.add('is-enhanced');

  let current = 0;
  function goTo(i: number) {
    const target = items[Math.max(0, Math.min(items.length - 1, i))];
    track.scrollTo({ left: target.offsetLeft - track.offsetLeft, behavior: 'smooth' });
  }
  function update() {
    // The current item is the one whose left edge is closest to the track's.
    const left = track.scrollLeft;
    let best = 0;
    items.forEach((item, i) => {
      if (Math.abs(item.offsetLeft - track.offsetLeft - left) < Math.abs(items[best].offsetLeft - track.offsetLeft - left)) best = i;
    });
    // At the far right edge the last item may never reach the left edge.
    if (left + track.clientWidth >= track.scrollWidth - 2) best = items.length - 1;
    current = best;
    count.textContent = `${current + 1} / ${items.length}`;
    dotButtons.forEach((d, i) => d.setAttribute('aria-current', i === current ? 'true' : 'false'));
    prev.disabled = left <= 2;
    next.disabled = left + track.clientWidth >= track.scrollWidth - 2;
    // Don't keep playing videos that were swiped away.
    items.forEach((item, i) => {
      if (i !== current) item.querySelector('video')?.pause();
    });
  }
  prev.addEventListener('click', () => goTo(current - 1));
  next.addEventListener('click', () => goTo(current + 1));
  let raf = 0;
  track.addEventListener(
    'scroll',
    () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    },
    { passive: true },
  );
  new ResizeObserver(update).observe(track);
  update();
  (gallery as HTMLElement & { goTo?: (i: number) => void }).goTo = goTo;
}

// ---------- lightbox ----------

let pswpModule: Promise<typeof import('photoswipe')> | null = null;

function slideFor(img: HTMLImageElement): SlideData & { thumb: HTMLImageElement; caption: string } {
  const caption = img.closest('figure')?.querySelector('figcaption')?.textContent?.trim() || img.alt || '';
  const width = Number(img.getAttribute('width')) || img.naturalWidth || 1600;
  const height = Number(img.getAttribute('height')) || img.naturalHeight || 1200;
  return { src: img.currentSrc || img.src, msrc: img.currentSrc || img.src, width, height, alt: img.alt, thumb: img, caption };
}

async function openLightbox(images: HTMLImageElement[], index: number, onClose?: (index: number) => void) {
  pswpModule ??= import('photoswipe');
  const { default: PhotoSwipeCtor } = await pswpModule;
  const slides = images.map(slideFor);
  const pswp: PhotoSwipe = new PhotoSwipeCtor({
    dataSource: slides,
    index,
    bgOpacity: 0.92,
    showHideAnimationType: 'zoom',
    wheelToZoom: true,
    imageClickAction: 'zoom-or-close',
    tapAction: 'toggle-controls',
    closeTitle: '关闭',
    zoomTitle: '缩放',
    arrowPrevTitle: '上一张',
    arrowNextTitle: '下一张',
    errorMsg: '图片加载失败',
    indexIndicatorSep: ' / ',
  });
  pswp.addFilter('thumbEl', (el, data) => (data as (typeof slides)[number]).thumb ?? el);
  pswp.addFilter('placeholderSrc', (src, slide) => (slide.data as (typeof slides)[number]).msrc ?? src);
  pswp.on('uiRegister', () => {
    pswp.ui?.registerElement({
      name: 'caption',
      order: 9,
      isButton: false,
      appendTo: 'root',
      onInit: (el) => {
        const set = () => {
          const text = (pswp.currSlide?.data as (typeof slides)[number] | undefined)?.caption ?? '';
          el.textContent = text;
          el.hidden = !text;
        };
        pswp.on('change', set);
        set();
      },
    });
  });
  if (onClose) pswp.on('close', () => onClose(pswp.currIndex));
  pswp.init();
}

function setupLightbox(article: HTMLElement) {
  // Standalone images of the article form one sequence; each gallery is its own.
  const standalone = () => [...article.querySelectorAll<HTMLImageElement>('figure.media-image img, img.img-block')].filter((i) => !i.closest('a'));
  article.addEventListener('click', (event) => {
    const img = (event.target as HTMLElement).closest?.('img');
    if (!img || img.closest('a')) return;
    const gallery = img.closest<HTMLElement & { goTo?: (i: number) => void }>('.gallery');
    if (gallery) {
      const imgs = [...gallery.querySelectorAll<HTMLImageElement>('.gallery-item img')];
      event.preventDefault();
      void openLightbox(imgs, imgs.indexOf(img), (i) => {
        // Land the carousel on whatever was last viewed in the lightbox.
        const item = imgs[i]?.closest('.gallery-item');
        const all = [...gallery.querySelectorAll('.gallery-item')];
        if (item) gallery.goTo?.(all.indexOf(item));
      });
      return;
    }
    if (img.closest('figure.media-image') || img.classList.contains('img-block')) {
      const imgs = standalone();
      event.preventDefault();
      void openLightbox(imgs, imgs.indexOf(img));
    }
  });
}

export function initMedia(root: ParentNode = document) {
  sizeUnknownFigures(root);
  root.querySelectorAll<HTMLElement>('.gallery').forEach(enhanceGallery);
  root.querySelectorAll<HTMLElement>('.prose').forEach(setupLightbox);
}
