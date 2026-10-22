/// <reference types="@cloudflare/workers-types" />

// Bindings and vars from wrangler.jsonc (kept by hand so CI needs no `wrangler types`).
interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Secret: signs PoW challenges and keys IP hashes. */
  COMMENT_SECRET: string;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  SPAM_RETENTION_DAYS: string;
}

declare namespace Cloudflare {
  interface Env extends globalThis.Env {}
}

declare module 'aplayer';
