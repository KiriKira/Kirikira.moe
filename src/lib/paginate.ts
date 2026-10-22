import { SITE } from '../site';

export function pageCount(total: number, size = SITE.postsPerPage): number {
  return Math.max(1, Math.ceil(total / size));
}

export function pageSlice<T>(items: T[], page: number, size = SITE.postsPerPage): T[] {
  return items.slice((page - 1) * size, page * size);
}

/** The old Django site served page 1 at both / and /page/1/; keep both working. */
export const homePageHref = (n: number) => (n === 1 ? '/' : `/page/${n}/`);
