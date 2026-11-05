/**
 * Browser side of Markdown media (see src/lib/markdown/media.mjs):
 *  - sizes figures whose dimensions weren't known at build time (videos, failed probes)
 *  - turns galleries into a stack of cards (gallery-stack.ts; without JS they stay a strip)
 *  - click/tap any post image to open a zoomable, swipeable lightbox (PhotoSwipe,
 *    downloaded on first use only)
 */
import 'photoswipe/style.css';
import type PhotoSwipe from 'photoswipe';
import type { SlideData } from 'photoswipe';
import { enhanceGallery } from './gallery-stack';

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

// Galleries: see gallery-stack.ts.

// ---------- lightbox ----------

let pswpModule: Promise<typeof import('photoswipe')> | null = null;

function slideFor(img: HTMLImageElement): SlideData & { thumb: HTMLImageElement; caption: string } {
  const caption = img.closest('figure')?.querySelector('figcaption')?.textContent?.trim() || img.alt || '';
  const width = Number(img.getAttribute('width')) || img.naturalWidth || 1600;
  const height = Number(img.getAttribute('height')) || img.naturalHeight || 1200;
  return { src: img.currentSrc || img.src, msrc: img.currentSrc || img.src, width, height, alt: img.alt, thumb: img, caption };
}

async function openLightbox(images: HTMLImageElement[], index: number, onChange?: (index: number) => void) {
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
  // Keep the page in step (a gallery shows the same picture), so closing zooms back onto it.
  if (onChange) pswp.on('change', () => onChange(pswp.currIndex));
  pswp.init();
}

function setupLightbox(article: HTMLElement) {
  // Standalone images of the article form one sequence; each gallery is its own.
  const standalone = () => [...article.querySelectorAll<HTMLImageElement>('figure.media-image img, img.img-block')].filter((i) => !i.closest('a'));
  // Clicks on cards behind the top one never get here (gallery-stack.ts handles them first).
  article.addEventListener('click', (event) => {
    const img = (event.target as HTMLElement).closest?.('img');
    if (!img || img.closest('a')) return;
    const gallery = img.closest<HTMLElement & { goTo?: (i: number, animate?: boolean) => void }>('.gallery');
    if (gallery) {
      const imgs = [...gallery.querySelectorAll<HTMLImageElement>('.gallery-item img')];
      const all = [...gallery.querySelectorAll('.gallery-item')];
      event.preventDefault();
      void openLightbox(imgs, imgs.indexOf(img), (i) => {
        const item = imgs[i]?.closest('.gallery-item');
        if (item) gallery.goTo?.(all.indexOf(item), false);
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
