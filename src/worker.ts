import { handle } from '@astrojs/cloudflare/handler';
import { purgeOldSpam } from './lib/comments/store';

export default {
  fetch: handle,

  async scheduled(_controller, env, ctx) {
    const days = Number(env.SPAM_RETENTION_DAYS) || 30;
    ctx.waitUntil(purgeOldSpam(env.DB, days));
  },
} satisfies ExportedHandler<Env>;
