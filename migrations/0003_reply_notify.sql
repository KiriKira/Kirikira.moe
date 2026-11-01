-- Email notifications when someone replies to a comment (src/lib/comments/notify.ts).
-- Backwards compatible: the column has a default, so the previous version's INSERTs keep working.

-- 1 = email this comment's author when it gets a reply ("有人回复时邮件通知我" in the form).
-- Imported and older comments default to 1; every email has a one-click unsubscribe link.
ALTER TABLE comments ADD COLUMN notify INTEGER NOT NULL DEFAULT 1;

-- Addresses that unsubscribed from all reply notifications. Only an HMAC of the address is kept.
CREATE TABLE email_optouts (
  email_hash TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

-- One row per notification attempt: makes sending idempotent (one email per reply) and
-- enforces the daily caps. Holds no address, only its HMAC.
CREATE TABLE notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id INTEGER NOT NULL,          -- the reply that triggered it
  to_hash    TEXT    NOT NULL,
  status     TEXT    NOT NULL,          -- sent | failed
  error      TEXT,
  created_at TEXT    NOT NULL
);
CREATE UNIQUE INDEX idx_notifications_comment ON notifications (comment_id) WHERE status = 'sent';
CREATE INDEX idx_notifications_created ON notifications (created_at);
CREATE INDEX idx_notifications_to ON notifications (to_hash, created_at);
