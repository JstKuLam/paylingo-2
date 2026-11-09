-- Add Soniox v6 speaker diarization label column to transcript_entries
ALTER TABLE transcript_entries ADD COLUMN speaker_label TEXT;

-- Add owner_id column to session_summaries and persistent D1 rate limit table for AI summarize
ALTER TABLE session_summaries ADD COLUMN owner_id TEXT;
CREATE INDEX IF NOT EXISTS idx_session_summaries_owner_created ON session_summaries(owner_id, created_at);

CREATE TABLE IF NOT EXISTS ai_rate_limits (
    id TEXT PRIMARY KEY,
    ip TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_rate_limits_ip_created ON ai_rate_limits(ip, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_rate_limits_user_created ON ai_rate_limits(user_id, created_at);
