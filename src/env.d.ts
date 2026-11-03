/// <reference types="@cloudflare/workers-types" />

// Bindings and vars from wrangler.jsonc (kept by hand so CI needs no `wrangler types`).
interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Secret: signs PoW challenges and keys IP hashes. */
  COMMENT_SECRET: string;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  /** Preview-only admin login secret (see src/lib/access.ts). */
  ADMIN_TOKEN?: string;
  /** Workers AI binding (Clef-flash spam scoring). */
  AI?: Ai;
  AI_SPAM_CHECK?: string;
  SPAM_RETENTION_DAYS: string;
  /** Reply notifications (src/lib/comments/mail.ts): sender, e.g. "Kiri 的博客 <noreply@kirikira.moe>". */
  MAIL_FROM?: string;
  /** Secret: Resend API key (free plan, 100 emails/day). */
  RESEND_API_KEY?: string;
  /** Cloudflare Email Service binding (sending to anyone needs Workers Paid). */
  EMAIL?: SendEmail;
  /** Max notification emails per 24h (default 90, under Resend's free 100/day). */
  MAIL_DAILY_LIMIT?: string;
  /** Secret: the owner's address; every new comment (published or caught as spam) is emailed there. */
  ADMIN_EMAIL?: string;
  /** Max owner notifications per 24h (default 30). */
  ADMIN_EMAIL_DAILY_LIMIT?: string;
}

declare namespace Cloudflare {
  interface Env extends globalThis.Env {}
}

declare module 'aplayer';
