-- Workers AI (Clef-flash) spam scoring results, shown in the admin and used for re-scans.
ALTER TABLE comments ADD COLUMN ai_spam REAL;          -- probability 0..1 the comment is spam
ALTER TABLE comments ADD COLUMN ai_kind TEXT;          -- most likely category (ad, seo, scam, ...)
ALTER TABLE comments ADD COLUMN ai_checked_at TEXT;    -- when it was scored; NULL = never

CREATE INDEX idx_comments_ai_unchecked ON comments (status, ai_checked_at);
