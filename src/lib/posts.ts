import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'posts'>;

/** Published posts, newest first. Drafts are visible in `astro dev` only. */
export async function getPosts(): Promise<Post[]> {
  const posts = await getCollection('posts', ({ data }) => import.meta.env.DEV || !data.draft);
  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf() || b.id.localeCompare(a.id));
}

export const postUrl = (post: Post) => `/post/${post.id}/`;
/**
 * Comment thread key in D1. Migrated posts use their Django id (comments were imported
 * with it), so neither a slug rename nor the CMS touching `cid` can orphan them.
 */
export const commentThreadId = (post: Post) =>
  post.data.legacyId !== undefined ? String(post.data.legacyId) : (post.data.cid ?? post.id);

/** Category/tag names go straight into the URL; the browser percent-encodes them. */
export const categoryUrl = (name: string) => `/category/${encodeURIComponent(name)}/`;
export const tagUrl = (name: string) => `/tag/${encodeURIComponent(name)}/`;

export function groupBy<K>(posts: Post[], keys: (p: Post) => K[]): Map<K, Post[]> {
  const map = new Map<K, Post[]>();
  for (const post of posts) {
    for (const key of keys(post)) {
      const list = map.get(key) ?? [];
      list.push(post);
      map.set(key, list);
    }
  }
  return map;
}

const fmt = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
export const formatDate = (d: Date) => fmt.format(d);

/** "2026年2月27日 15:40", as Django rendered dates on the old site. */
const longParts = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
export function formatDateTime(d: Date): string {
  const p = Object.fromEntries(longParts.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}年${p.month}月${p.day}日 ${p.hour}:${p.minute}`;
}
