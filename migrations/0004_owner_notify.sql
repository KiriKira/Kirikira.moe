-- Emails to the site owner about every new comment (src/lib/comments/notify.ts, ADMIN_EMAIL).
-- Notification rows get a kind; "one email per comment" becomes one per comment and kind.
-- Backwards compatible: the previous version inserts without kind and gets 'reply'.
ALTER TABLE notifications ADD COLUMN kind TEXT NOT NULL DEFAULT 'reply'; -- reply | owner
DROP INDEX idx_notifications_comment;
CREATE UNIQUE INDEX idx_notifications_comment ON notifications (comment_id, kind) WHERE status = 'sent';
