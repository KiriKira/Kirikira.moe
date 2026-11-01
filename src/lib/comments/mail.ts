/**
 * Outgoing email for reply notifications. Two interchangeable providers, picked by
 * configuration; with neither configured, notifications are simply off.
 *
 *  - Resend (https://resend.com): free plan 3,000 emails/month, 100/day, to anyone.
 *    Set the secret RESEND_API_KEY and verify the sending domain in Resend (DNS records).
 *  - Cloudflare Email Service (`send_email` binding named EMAIL): sending to arbitrary
 *    addresses needs the Workers Paid plan (3,000/month included). On the free plan it can
 *    only send to addresses verified in your own account, so it can't notify commenters.
 *
 * Both need MAIL_FROM, e.g. `Kiri 的博客 <noreply@kirikira.moe>`, on a domain the provider
 * has verified. Resend wins when both are configured.
 */

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
  /** Same key => the provider sends at most once (Resend honours it for 24h). */
  idempotencyKey?: string;
}

export interface Mailer {
  provider: 'resend' | 'cloudflare';
  send(message: MailMessage): Promise<void>;
}

type MailEnv = Pick<Env, 'RESEND_API_KEY' | 'MAIL_FROM' | 'EMAIL'>;

export function getMailer(env: MailEnv, fetchImpl: typeof fetch = fetch): Mailer | null {
  const from = env.MAIL_FROM?.trim();
  if (!from) return null;

  if (env.RESEND_API_KEY) {
    const key = env.RESEND_API_KEY;
    return {
      provider: 'resend',
      async send(m) {
        const res = await fetchImpl('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${key}`,
            'content-type': 'application/json',
            ...(m.idempotencyKey ? { 'idempotency-key': m.idempotencyKey } : {}),
          },
          body: JSON.stringify({ from, to: [m.to], subject: m.subject, text: m.text, html: m.html, headers: m.headers }),
        });
        if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
      },
    };
  }

  if (env.EMAIL) {
    const binding = env.EMAIL as unknown as { send(message: Record<string, unknown>): Promise<unknown> };
    return {
      provider: 'cloudflare',
      async send(m) {
        await binding.send({ from, to: m.to, subject: m.subject, text: m.text, html: m.html, headers: m.headers });
      },
    };
  }
  return null;
}
