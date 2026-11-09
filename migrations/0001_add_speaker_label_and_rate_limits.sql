-- Idempotent D1 migration for AI summarize rate limiting and summary ownership index.
-- Note: `transcript_entries.speaker_label` and `session_summaries.owner_id` are defined in `supabase/d1-schema.sql`
-- and idempotently ensured at runtime via `ALTER TABLE ... ADD COLUMN` guards in API routes so `wrangler d1 migrations apply`
-- never fails with `duplicate column name` on databases initialized from `d1-schema.sql`.

CREATE TABLE IF NOT EXISTS ai_rate_limits (
    id TEXT PRIMARY KEY,
    ip TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_rate_limits_ip_created ON ai_rate_limits(ip, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_rate_limits_user_created ON ai_rate_limits(user_id, created_at);
