export type CommentStatus = 'published' | 'spam';

export interface CommentRow {
  id: number;
  post_id: string;
  parent_id: number | null;
  name: string;
  email: string | null;
  url: string | null;
  body: string;
  body_fp: string | null;
  status: CommentStatus;
  spam_score: number;
  spam_reasons: string | null;
  ip_hash: string | null;
  user_agent: string | null;
  pow_nonce: string | null;
  created_at: string;
  legacy_id: number | null;
}

export type SpamRuleKind = 'keyword' | 'domain' | 'regex' | 'ip_hash' | 'email';

export interface SpamRule {
  id: number;
  kind: SpamRuleKind;
  pattern: string;
  weight: number;
  note: string | null;
  created_at: string;
}

/** What the public API returns for each comment. Never includes email, url or ip. */
export interface PublicComment {
  id: number;
  parentId: number | null;
  name: string;
  html: string;
  createdAt: string;
}

/** Validated comment as submitted by a visitor. */
export interface CommentInput {
  postId: string;
  parentId: number | null;
  name: string;
  email: string;
  url: string;
  body: string;
}
