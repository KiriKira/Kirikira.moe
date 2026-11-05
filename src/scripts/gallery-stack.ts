/**
 * Galleries (two or more images/videos on consecutive Markdown lines) as a stack of photo
 * cards: the current one on top, the next ones peeking out behind it, slightly turned.
 *
 *  - next: tap a card peeking out behind, ›, ← / → keys, or swipe the top card left: it is
 *    thrown aside and tucked under the pile. previous: ‹ or swipe right.
 *  - tap the top card: lightbox (src/scripts/media.ts), the fast way through big galleries;
 *    the stack follows whatever the lightbox shows.
 *  - cheap: only transform/opacity are animated (compositor only), no scroll listeners, and
 *    only the top CARDS_RENDERED cards are rendered. Cards further down are display:none,
 *    so their lazy images aren't even requested until they get near the top.
 *  - without JS the build output stays a swipeable strip (see global.css).
 */

const CARDS_RENDERED = 4; // depth 0-2 visible, depth 3 rendered but transparent (preloading)
const DOTS_MAX = 10;
const SWIPE_PX = 45; // drag distance that flips
const TAP_SLOP_PX = 8; // movement still counted as a tap
const THROW_MS = 480;
/** Cards behind may stick out this much beyond the top card (else a portrait behind a
 * landscape would dwarf it); they grow to full size when they come to the top. */
const BEHIND_OVERHANG = 1.16;

type Gallery = HTMLElement & { goTo?: (i: number, animate?: boolean) => void };

/** Stop this module's own animations on a card (not the CSS transitions of its pose). */
const cancelThrows = (card: HTMLElement) => {
  for (const a of card.getAnimations()) if (!(a instanceof CSSTransition)) a.cancel();
};

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = cls;
  node.textContent = text;
  return node;
}

/** "3 / 4" or "0.75" (the build writes --ar as w / h) -> number. */
function parseRatio(value: string): number {
  if (!value) return 0;
  const [a, b] = value.split('/').map((s) => Number.parseFloat(s));
  return b ? a / b : Number.isFinite(a) ? a : 0;
}

export function enhanceGallery(gallery: Gallery): void {
  const stage = gallery.querySelector<HTMLElement>('.gallery-track')!;
  const cards = [...stage.querySelectorAll<HTMLElement>(':scope > .gallery-item')];
  const n = cards.length;
  if (n < 2) return;

  // Aspect ratios: from the build (--ar), else measured when the image loads (see the end).
  const ratios = cards.map((c) => parseRatio(c.style.getPropertyValue('--ar')) || (c.classList.contains('gallery-video') ? 16 / 9 : 0));
  // ---- controls ----
  const bar = el('div', 'gallery-bar');
  const prev = el('button', 'gallery-nav', '‹');
  const next = el('button', 'gallery-nav', '›');
  prev.type = next.type = 'button';
  prev.setAttribute('aria-label', '上一张');
  next.setAttribute('aria-label', '下一张');
  const status = el('div', 'gallery-status');
  const count = el('span', 'gallery-count');
  count.setAttribute('aria-live', 'polite');
  status.appendChild(count);
  const dots: HTMLButtonElement[] = [];
  if (n <= DOTS_MAX) {
    const box = el('span', 'gallery-dots');
    for (let i = 0; i < n; i++) {
      const d = el('button', 'gallery-dot');
      d.type = 'button';
      d.setAttribute('aria-label', `第 ${i + 1} 张`);
      d.addEventListener('click', () => goTo(i));
      box.appendChild(d);
      dots.push(d);
    }
    status.appendChild(box);
  }
  const caption = el('p', 'gallery-caption');
  // appendChild, not append(): the Workers types sharing this tsconfig redeclare Element.append.
  for (const node of [prev, status, next]) bar.appendChild(node);
  gallery.appendChild(bar);
  gallery.appendChild(caption);
  gallery.classList.add('is-stack');
  cards.forEach((card, i) => card.style.setProperty('--tilt', `${i % 2 ? -2.2 : 2.6}deg`));

  // ---- layout: every card fits the stage; the stage is as tall as the tallest card ----
  const sizes: { w: number; h: number }[] = cards.map(() => ({ w: 0, h: 0 }));
  // The width comes from the ResizeObserver: reading clientWidth here would force a layout
  // per gallery (a post with 91 galleries spent ~250 ms on that alone).
  let width = 0;
  function layout() {
    if (!width) return;
    const narrow = width < 520;
    const maxW = width * (narrow ? 0.86 : 0.8);
    const maxH = Math.min(narrow ? 420 : 460, window.innerHeight * 0.62);
    let tallest = 0;
    cards.forEach((card, i) => {
      const r = ratios[i] || 4 / 3;
      let w = maxW;
      let h = w / r;
      if (h > maxH) {
        h = maxH;
        w = h * r;
      }
      card.style.setProperty('--cw', `${Math.round(w)}px`);
      card.style.setProperty('--ch', `${Math.round(h)}px`);
      sizes[i] = { w, h };
      tallest = Math.max(tallest, h);
    });
    // As tall as the tallest card, so the page never jumps while flipping; plus room for
    // the cards peeking out.
    stage.style.setProperty('--sh', `${Math.round(tallest + 34)}px`);
    paint();
  }

  // ---- state ----
  let current = 0;
  const depthOf = (i: number) => (i - current + n) % n;

  function paint() {
    const top = sizes[current];
    cards.forEach((card, i) => {
      const d = depthOf(i);
      card.style.setProperty('--d', String(Math.min(d, CARDS_RENDERED - 1)));
      const { w, h } = sizes[i];
      const fit = d === 0 || !w || !top.w ? 1 : Math.min(1, (BEHIND_OVERHANG * top.w) / w, (BEHIND_OVERHANG * top.h) / h);
      card.style.setProperty('--fit', fit.toFixed(3));
      card.dataset.depth = String(d);
      // The card just tucked under the pile (depth n - 1) stays rendered so it can animate.
      const rendered = d < CARDS_RENDERED || d === n - 1;
      card.classList.toggle('is-hidden', !rendered);
      card.classList.toggle('is-faded', d >= CARDS_RENDERED - 1 && d !== 0);
      // Only the top card is announced and focusable. Not `inert`: that would also make the
      // cards behind unclickable, and tapping one is how you bring it forward.
      const behind = d !== 0;
      if (behind) card.setAttribute('aria-hidden', 'true');
      else card.removeAttribute('aria-hidden');
      for (const v of card.querySelectorAll('video')) {
        v.tabIndex = behind ? -1 : 0;
        if (behind) v.pause();
      }
    });
    count.textContent = `${current + 1} / ${n}`;
    dots.forEach((d, i) => d.setAttribute('aria-current', String(i === current)));
    const text = cards[current].querySelector('figcaption')?.textContent?.trim() ?? '';
    caption.textContent = text;
    caption.hidden = !text;
  }

  /**
   * The old top card flies off to the side while fading out, changes layer only once it is
   * invisible, then fades in again at the bottom of the pile. Changing layer while visible
   * looked like it passed through the next photo (and how far out it would have to fly to
   * clear it depends on both cards' sizes).
   */
  function throwToBack(card: HTMLElement, dir: number, from: number) {
    cancelThrows(card);
    card.style.zIndex = '200';
    const out = card.animate(
      [
        { translate: `calc(-50% + ${from}px) -50%`, rotate: `${from / 28}deg`, opacity: 1 },
        { translate: `calc(-50% + ${dir * 45}%) -50%`, rotate: `${dir * 8}deg`, opacity: 0 },
      ],
      { duration: THROW_MS * 0.55, easing: 'cubic-bezier(.4,0,.8,.6)', fill: 'forwards' },
    );
    out.onfinish = () => {
      card.style.zIndex = '';
      out.cancel();
      // Cards deep in a long pile are invisible anyway (is-faded); the others reappear.
      if (!card.classList.contains('is-faded')) {
        card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: THROW_MS * 0.5, easing: 'ease-out' });
      }
    };
  }

  /** Move to card i; `throwFrom` = the top card's drag offset when a swipe flipped it. */
  function goTo(i: number, animate = true, throwFrom = 0) {
    const target = ((i % n) + n) % n;
    if (target === current) return;
    const forward = depthOf(target) <= n / 2; // the shorter way round the pile
    const top = cards[current];
    current = target;
    if (animate && !reducedMotion()) {
      if (forward) throwToBack(top, throwFrom > 0 ? 1 : -1, throwFrom);
      else {
        // The card coming back slides in over the pile from the side it was swiped to. It is
        // on top (and transparent) from its first frame, so it never passes through a card.
        const back = cards[current];
        const dir = throwFrom < 0 ? -1 : 1;
        cancelThrows(back);
        back.animate(
          [
            { translate: `calc(-50% + ${dir * 45}%) -50%`, rotate: `${dir * 8}deg`, opacity: 0 },
            { translate: '-50% -50%', rotate: '0deg', opacity: 1 },
          ],
          { duration: THROW_MS * 0.75, easing: 'cubic-bezier(.2,.8,.2,1)' },
        );
      }
    }
    paint();
  }
  gallery.goTo = goTo;

  prev.addEventListener('click', () => goTo(current - 1));
  next.addEventListener('click', () => goTo(current + 1));
  stage.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      goTo(current + (e.key === 'ArrowLeft' ? -1 : 1));
    }
  });

  // ---- pointer: drag the top card; tap = lightbox (top) or bring forward (behind) ----
  let drag: { id: number; x: number; y: number; dx: number; moved: boolean } | null = null;
  let suppressClick = false;
  stage.addEventListener('pointerdown', (e) => {
    const card = (e.target as HTMLElement).closest<HTMLElement>('.gallery-item');
    if (!card || card.dataset.depth !== '0' || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if ((e.target as HTMLElement).closest('video') && card.querySelector('video[controls]')) return; // let controls work
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, moved: false };
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved) {
      if (Math.abs(dx) < TAP_SLOP_PX) return;
      if (Math.abs(e.clientY - drag.y) > Math.abs(dx)) {
        drag = null; // a vertical scroll, not ours
        return;
      }
      drag.moved = true;
      stage.setPointerCapture(e.pointerId);
      cards[current].classList.add('is-dragging');
    }
    drag.dx = dx;
    const top = cards[current];
    top.style.translate = `calc(-50% + ${dx}px) -50%`;
    top.style.rotate = `${dx / 28}deg`;
  });
  const endDrag = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { dx, moved } = drag;
    drag = null;
    if (!moved) return;
    suppressClick = true; // the click that follows a drag must not open the lightbox
    const top = cards[current];
    top.classList.remove('is-dragging');
    top.style.translate = '';
    top.style.rotate = '';
    if (dx <= -SWIPE_PX) goTo(current + 1, true, dx);
    else if (dx >= SWIPE_PX) goTo(current - 1, true, dx);
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  // Capture phase: runs before the article-wide lightbox handler (media.ts).
  stage.addEventListener(
    'click',
    (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('.gallery-item');
      if (suppressClick || (card && card.dataset.depth !== '0')) {
        e.stopPropagation();
        e.preventDefault();
        if (!suppressClick && card) goTo(cards.indexOf(card));
      }
      suppressClick = false;
    },
    true,
  );

  // Images the build couldn't measure (host unreachable from CI): size them once loaded.
  cards.forEach((card, i) => {
    if (ratios[i]) return;
    const img = card.querySelector('img');
    if (!img) return;
    const measure = () => {
      if (!img.naturalWidth) return;
      ratios[i] = img.naturalWidth / img.naturalHeight;
      layout();
    };
    if (img.complete) measure();
    else img.addEventListener('load', measure, { once: true });
  });

  paint(); // depth classes right away; sizes follow on the first ResizeObserver callback
  new ResizeObserver((entries) => {
    width = entries[0].contentRect.width;
    layout(); // also paints
  }).observe(stage);
}
