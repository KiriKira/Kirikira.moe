-- Comments for kirikira.moe. Applied with `wrangler d1 migrations apply kirikira`.

CREATE TABLE comments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Stable thread key: the post's front-matter `cid` (legacy posts use the old Django pk).
  post_id      TEXT    NOT NULL,
  -- SET NULL: deleting a comment never takes other people's replies with it.
  parent_id    INTEGER REFERENCES comments(id) ON DELETE SET NULL,
  name         TEXT    NOT NULL,
  email        TEXT,
  url          TEXT,
  -- Raw Markdown as typed; rendered (with HTML disabled) when served.
  body         TEXT    NOT NULL,
  -- Case/whitespace/punctuation-insensitive fingerprint of body, for duplicate detection.
  body_fp      TEXT,
  -- 'published' is public; 'spam' is silently hidden from everyone but the author's own browser.
  status       TEXT    NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'spam')),
  spam_score   INTEGER NOT NULL DEFAULT 0,
  -- JSON array of rule ids that fired, shown in the admin UI.
  spam_reasons TEXT,
  -- HMAC(COMMENT_SECRET, ip): lets us rate-limit/ban without storing raw IPs.
  ip_hash      TEXT,
  user_agent   TEXT,
  -- Proof-of-work nonce, unique so a solved challenge can't be replayed.
  pow_nonce    TEXT,
  created_at   TEXT    NOT NULL,
  -- Django comments_comment.id for imported rows.
  legacy_id    INTEGER UNIQUE
);

CREATE INDEX idx_comments_post ON comments (post_id, status, created_at);
CREATE INDEX idx_comments_status_created ON comments (status, created_at);
CREATE INDEX idx_comments_ip_created ON comments (ip_hash, created_at);
CREATE INDEX idx_comments_body_fp ON comments (body_fp, created_at);
CREATE UNIQUE INDEX idx_comments_pow_nonce ON comments (pow_nonce) WHERE pow_nonce IS NOT NULL;

CREATE TABLE spam_rules (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  -- keyword: case-insensitive substring of name/body/url
  -- domain:  hostname (or parent domain) of any link or the url field
  -- regex:   JS regex (flags "imu") tested against name, body and url joined by newlines
  -- ip_hash / email: exact match
  kind       TEXT    NOT NULL CHECK (kind IN ('keyword', 'domain', 'regex', 'ip_hash', 'email')),
  pattern    TEXT    NOT NULL,
  weight     INTEGER NOT NULL DEFAULT 100,
  note       TEXT,
  created_at TEXT    NOT NULL,
  UNIQUE (kind, pattern)
);
