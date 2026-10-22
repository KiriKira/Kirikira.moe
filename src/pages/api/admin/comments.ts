import type { APIRoute } from 'astro';
import { env } from '../../../lib/env';
import { adminIdentity } from '../../../lib/access';
import { isSameOrigin } from '../../../lib/http';
import { extractHosts } from '../../../lib/comments/spam';
import * as store from '../../../lib/comments/store';
import type { SpamRuleKind } from '../../../lib/comments/types';

export const prerender = false;

const RULE_KINDS: SpamRuleKind[] = ['keyword', 'domain', 'regex', 'ip_hash', 'email'];

/**
 * Form-post endpoint behind the admin pages. Every action redirects back to
 * `redirect` (same-origin paths only) so the admin UI works without JavaScript.
 */
export const POST: APIRoute = async ({ request, redirect }) => {
  if (!(await adminIdentity(request, env))) return new Response('Forbidden', { status: 403 });
  if (!isSameOrigin(request)) return new Response('Bad origin', { status: 403 });

  const form = await request.formData();
  const action = String(form.get('action') ?? '');
  const ids = form
    .getAll('id')
    .map(Number)
    .filter((n) => Number.isSafeInteger(n) && n > 0);
  const back = String(form.get('redirect') ?? '/admin/comments');
  const target = back.startsWith('/admin/') ? back : '/admin/comments';

  switch (action) {
    case 'delete':
      await store.deleteComments(env.DB, ids);
      break;
    case 'spam':
      await store.setStatus(env.DB, ids, 'spam');
      break;
    case 'publish':
      await store.setStatus(env.DB, ids, 'published');
      break;
    case 'ban-domains':
    case 'ban-ip':
    case 'ban-email': {
      // Build rules from the selected comments, then hide those comments.
      for (const id of ids) {
        const c = await store.getComment(env.DB, id);
        if (!c) continue;
        const note = `from comment #${id}`;
        if (action === 'ban-domains') {
          for (const host of new Set(extractHosts(`${c.body}\n${c.url ?? ''}`))) {
            await store.addRule(env.DB, { kind: 'domain', pattern: host, weight: 100, note });
          }
        } else if (action === 'ban-ip' && c.ip_hash) {
          await store.addRule(env.DB, { kind: 'ip_hash', pattern: c.ip_hash, weight: 100, note });
        } else if (action === 'ban-email' && c.email) {
          await store.addRule(env.DB, { kind: 'email', pattern: c.email.toLowerCase(), weight: 100, note });
        }
      }
      await store.setStatus(env.DB, ids, 'spam');
      break;
    }
    case 'add-rule': {
      const kind = String(form.get('kind')) as SpamRuleKind;
      const pattern = String(form.get('pattern') ?? '').trim();
      const weight = Number(form.get('weight') ?? 100);
      if (!RULE_KINDS.includes(kind) || !pattern || !Number.isFinite(weight)) {
        return new Response('Invalid rule', { status: 400 });
      }
      if (kind === 'regex') {
        try {
          new RegExp(pattern, 'imu');
        } catch {
          return new Response('Invalid regex', { status: 400 });
        }
      }
      await store.addRule(env.DB, { kind, pattern, weight: Math.round(weight), note: String(form.get('note') ?? '') || null });
      break;
    }
    case 'delete-rule':
      for (const id of ids) await store.deleteRule(env.DB, id);
      break;
    case 'purge-spam':
      await store.purgeOldSpam(env.DB, 0);
      break;
    default:
      return new Response('Unknown action', { status: 400 });
  }
  return redirect(target, 303);
};
