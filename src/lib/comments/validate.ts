import type { CommentInput } from './types';

export const LIMITS = {
  name: 50,
  email: 255,
  url: 200,
  body: 5000,
} as const;

export type ValidationResult =
  | { ok: true; value: CommentInput }
  | { ok: false; errors: Record<string, string> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Checks a submission for mistakes a human would want to fix. Only these produce
 * a visible error; spam judgements are silent and handled elsewhere.
 */
export function validateComment(raw: Record<string, unknown>): ValidationResult {
  const errors: Record<string, string> = {};
  const postId = str(raw.post);
  const name = str(raw.name);
  const email = str(raw.email);
  const url = str(raw.url);
  // Keep the body's inner whitespace (code blocks), just drop trailing blank lines.
  const body = typeof raw.body === 'string' ? raw.body.replace(/\s+$/, '') : '';

  let parentId: number | null = null;
  if (raw.parentId !== undefined && raw.parentId !== null && raw.parentId !== '') {
    const n = Number(raw.parentId);
    if (!Number.isSafeInteger(n) || n <= 0) errors.parentId = '回复的评论不存在';
    else parentId = n;
  }

  if (!postId || postId.length > 100) errors.post = '文章不存在';
  if (!name) errors.name = '请填写昵称';
  else if (name.length > LIMITS.name) errors.name = `昵称不能超过 ${LIMITS.name} 个字符`;
  if (email && (email.length > LIMITS.email || !EMAIL_RE.test(email))) errors.email = '邮箱格式不正确';
  if (url) {
    if (url.length > LIMITS.url) errors.url = `网址不能超过 ${LIMITS.url} 个字符`;
    else {
      try {
        const u = new URL(url);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') errors.url = '网址需以 http(s):// 开头';
      } catch {
        errors.url = '网址需以 http(s):// 开头';
      }
    }
  }
  if (!body.trim()) errors.body = '评论内容不能为空';
  else if (body.length > LIMITS.body) errors.body = `评论不能超过 ${LIMITS.body} 个字符`;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { postId, parentId, name, email, url, body } };
}
