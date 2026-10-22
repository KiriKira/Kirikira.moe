import { solveChallenge } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/web/pbkdf2';
import type { Challenge, Solution } from 'altcha-lib/types';
import type { PublicComment } from '../lib/comments/types';

const MINE_KEY = 'kiri:my-comments';
const PROFILE_KEY = 'kiri:commenter';
const CHALLENGE_MAX_AGE_MS = 5 * 60 * 60 * 1000; // server TTL is 6h

// ---------- storage (best effort: private mode / blocked storage must not break comments) ----------

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/**
 * Comments this browser submitted, per thread. They are always shown to their
 * author, which is what keeps silently filtered comments silent.
 */
function myComments(thread: string): PublicComment[] {
  return readJson<Record<string, PublicComment[]>>(MINE_KEY, {})[thread] ?? [];
}

function saveMyComments(thread: string, list: PublicComment[]): void {
  const all = readJson<Record<string, PublicComment[]>>(MINE_KEY, {});
  if (list.length) all[thread] = list.slice(-50);
  else delete all[thread];
  writeJson(MINE_KEY, all);
}

// ---------- rendering ----------

const timeFmt = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function avatarColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return `hsl(${h % 360} 45% 52%)`;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * appendChild in a loop rather than Element.append: the Workers runtime types that
 * share this tsconfig redeclare Element.append for HTMLRewriter.
 */
function add(parent: Node, ...children: Node[]): void {
  for (const child of children) parent.appendChild(child);
}

function renderComment(c: PublicComment, onReply: (c: PublicComment) => void): HTMLLIElement {
  const li = el('li', 'comment');
  li.id = `comment-${c.id}`;

  const avatar = el('div', 'comment-avatar', [...c.name.trim()][0]?.toUpperCase() ?? '?');
  avatar.style.background = avatarColor(c.name);
  avatar.setAttribute('aria-hidden', 'true');

  const main = el('div', 'comment-main');
  const head = el('div', 'comment-head');
  add(head, el('span', 'comment-author', c.name));
  const time = el('time', 'comment-time', timeFmt.format(new Date(c.createdAt)));
  time.dateTime = c.createdAt;
  add(head, time);
  const reply = el('button', 'link-button', '回复');
  reply.type = 'button';
  reply.addEventListener('click', () => onReply(c));
  add(head, reply);

  const body = el('div', 'comment-body');
  // Server-rendered with raw HTML disabled (markdown-it html:false), so this is safe.
  body.innerHTML = c.html;

  add(main, head, body);
  add(li, avatar, main);
  return li;
}

function renderList(list: HTMLOListElement, comments: PublicComment[], onReply: (c: PublicComment) => void): void {
  const byId = new Map(comments.map((c) => [c.id, c]));
  // One level of nesting: replies attach to their top-level ancestor.
  const rootOf = (c: PublicComment): PublicComment => {
    let cur = c;
    for (let guard = 0; cur.parentId !== null && byId.has(cur.parentId) && guard < 20; guard++) cur = byId.get(cur.parentId)!;
    return cur;
  };
  const sorted = [...comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id);
  const roots = sorted.filter((c) => rootOf(c) === c);
  const replies = new Map<number, PublicComment[]>();
  for (const c of sorted) {
    const root = rootOf(c);
    if (root !== c) replies.set(root.id, [...(replies.get(root.id) ?? []), c]);
  }

  list.replaceChildren();
  if (!roots.length) {
    add(list, el('li', 'comment-placeholder', '还没有评论，来抢沙发吧～'));
    return;
  }
  for (const root of roots) {
    const li = renderComment(root, onReply);
    const kids = replies.get(root.id);
    if (kids?.length) {
      const ol = el('ol', 'comment-replies');
      for (const k of kids) add(ol, renderComment(k, onReply));
      add(li.querySelector('.comment-main')!, ol);
    }
    add(list, li);
  }
}

// ---------- proof of work ----------

interface PendingPow {
  issuedAt: number;
  result: Promise<{ challenge: Challenge; solution: Solution } | null>;
}

function startPow(thread: string): PendingPow {
  const issuedAt = Date.now();
  const result = (async () => {
    const res = await fetch(`/api/comments/challenge?post=${encodeURIComponent(thread)}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`challenge ${res.status}`);
    const challenge = (await res.json()) as Challenge;
    const solution = await solveChallenge({ challenge, deriveKey, timeout: 60_000 });
    return solution ? { challenge, solution } : null;
  })();
  result.catch(() => {}); // surfaced on submit
  return { issuedAt, result };
}

// ---------- main ----------

export function initComments(root: HTMLElement): void {
  const thread = root.dataset.thread!;
  const list = root.querySelector<HTMLOListElement>('.comment-list')!;
  const count = root.querySelector<HTMLElement>('.comments-count')!;
  const form = root.querySelector<HTMLFormElement>('.comment-form')!;
  const status = form.querySelector<HTMLElement>('.form-status')!;
  const submit = form.querySelector<HTMLButtonElement>('.submit')!;
  const replying = form.querySelector<HTMLElement>('.replying')!;

  let serverComments: PublicComment[] = [];
  let parentId: number | null = null;
  let pow: PendingPow | null = null;

  const onReply = (c: PublicComment) => {
    parentId = c.id;
    replying.hidden = false;
    replying.querySelector('b')!.textContent = c.name;
    form.querySelector('textarea')!.focus();
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  replying.querySelector('.cancel-reply')!.addEventListener('click', () => {
    parentId = null;
    replying.hidden = true;
  });

  const rerender = () => {
    const serverIds = new Set(serverComments.map((c) => c.id));
    // Once a comment of ours is public it no longer needs a local copy.
    const mine = myComments(thread).filter((c) => !serverIds.has(c.id));
    saveMyComments(thread, mine);
    const all = [...serverComments, ...mine];
    count.textContent = all.length ? `(${all.length})` : '';
    renderList(list, all, onReply);
  };

  const load = async () => {
    try {
      const res = await fetch(`/api/comments?post=${encodeURIComponent(thread)}`);
      if (!res.ok) throw new Error(String(res.status));
      serverComments = ((await res.json()) as { comments: PublicComment[] }).comments;
    } catch {
      serverComments = [];
      list.replaceChildren(el('li', 'comment-placeholder', '评论加载失败，请稍后刷新重试。'));
      if (!myComments(thread).length) return;
    }
    rerender();
    if (location.hash.startsWith('#comment-')) document.querySelector(location.hash)?.scrollIntoView();
  };

  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        void load();
      }
    },
    { rootMargin: '600px 0px' },
  );
  io.observe(root);

  // Remembered identity
  const profile = readJson<Record<string, string>>(PROFILE_KEY, {});
  for (const key of ['name', 'email', 'url'] as const) {
    const input = form.elements.namedItem(key) as HTMLInputElement;
    if (profile[key]) input.value = profile[key];
  }

  // Start the proof of work as soon as someone shows intent to comment.
  const ensurePow = () => {
    if (!pow || Date.now() - pow.issuedAt > CHALLENGE_MAX_AGE_MS) pow = startPow(thread);
  };
  form.addEventListener('focusin', ensurePow);

  const setStatus = (text: string, error = false) => {
    status.textContent = text;
    status.classList.toggle('error', error);
  };

  const showErrors = (errors: Record<string, string>) => {
    for (const node of form.querySelectorAll('.field-error')) node.remove();
    for (const node of form.querySelectorAll('[aria-invalid]')) node.removeAttribute('aria-invalid');
    for (const [field, message] of Object.entries(errors)) {
      const input = form.elements.namedItem(field) as HTMLInputElement | null;
      if (!input) continue;
      input.setAttribute('aria-invalid', 'true');
      const wrapper = input.closest('.field');
      if (wrapper) add(wrapper, el('span', 'field-error', message));
    }
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const value = (k: string) => String(data.get(k) ?? '');
    const errors: Record<string, string> = {};
    if (!value('body').trim()) errors.body = '评论内容不能为空';
    if (!value('name').trim()) errors.name = '请填写昵称';
    showErrors(errors);
    if (Object.keys(errors).length) return;

    submit.disabled = true;
    setStatus('正在提交…');
    try {
      ensurePow();
      const solved = await pow!.result.catch(() => null);
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          post: thread,
          parentId,
          name: value('name'),
          email: value('email'),
          url: value('url'),
          body: value('body'),
          website: value('website'),
          pow: solved,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        comment?: PublicComment;
        errors?: Record<string, string>;
      };
      if (res.status === 400 && payload.errors) {
        showErrors(payload.errors);
        setStatus('请检查标红的字段。', true);
        return;
      }
      if (!res.ok || !payload.comment) throw new Error(String(res.status));

      writeJson(PROFILE_KEY, { name: value('name'), email: value('email'), url: value('url') });
      saveMyComments(thread, [...myComments(thread), payload.comment]);
      (form.elements.namedItem('body') as HTMLTextAreaElement).value = '';
      parentId = null;
      replying.hidden = true;
      pow = null; // each challenge is single-use
      rerender();
      document.getElementById(`comment-${payload.comment.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setStatus('评论成功，谢谢！');
    } catch {
      pow = null;
      setStatus('提交失败，请稍后重试。', true);
    } finally {
      submit.disabled = false;
    }
  });
}
