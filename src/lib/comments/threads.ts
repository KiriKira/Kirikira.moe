export type Threads = Record<string, { url: string; title: string }>;

let cache: { at: number; data: Threads } | null = null;
const TTL_MS = 60_000;

/** Reads the prerendered /threads.json (see src/pages/threads.json.ts), cached per isolate. */
export async function getThreads(env: Env, requestUrl: string | URL): Promise<Threads> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const url = new URL('/threads.json', requestUrl);
  const res = env.ASSETS ? await env.ASSETS.fetch(url) : await fetch(url);
  if (!res.ok) throw new Error(`threads.json: ${res.status}`);
  const data = (await res.json()) as Threads;
  cache = { at: Date.now(), data };
  return data;
}
