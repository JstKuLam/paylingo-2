-- Cloudflare D1 SQL Schema for PayLingo

-- 1. Auth Tables
CREATE TABLE IF NOT EXISTS auth_users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    email_confirmed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS auth_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions(token);

-- 2. Access Codes Table
CREATE TABLE IF NOT EXISTS access_codes (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    max_minutes INTEGER NOT NULL DEFAULT 60,
    used_minutes INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 3. Folders Table
CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    username TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_folders_owner 
    ON folders(owner_id);

-- 4. Sessions Table
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    username TEXT NOT NULL,
    folder_id TEXT,
    name TEXT NOT NULL,
    partner_language TEXT NOT NULL DEFAULT 'en',
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at TEXT,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    access_code_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_owner_started 
    ON sessions(owner_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_folder 
    ON sessions(folder_id);

-- 5. Transcript Entries Table
CREATE TABLE IF NOT EXISTS transcript_entries (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    speaker TEXT NOT NULL CHECK (speaker IN ('host', 'partner')),
    speaker_label TEXT,
    original_text TEXT NOT NULL,
    translated_text TEXT NOT NULL,
    start_ms INTEGER NOT NULL DEFAULT 0,
    end_ms INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_transcript_session_start 
    ON transcript_entries(session_id, start_ms);

-- 6. Summaries Tables
CREATE TABLE IF NOT EXISTS session_summaries (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
    folder_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
    owner_id TEXT,
    summary_text TEXT NOT NULL,
    style TEXT NOT NULL DEFAULT 'standard',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_session_summaries_session ON session_summaries(session_id);
CREATE INDEX IF NOT EXISTS idx_session_summaries_folder ON session_summaries(folder_id);
CREATE INDEX IF NOT EXISTS idx_session_summaries_owner_created ON session_summaries(owner_id, created_at);

CREATE TABLE IF NOT EXISTS ai_rate_limits (
    id TEXT PRIMARY KEY,
    ip TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ai_rate_limits_ip_created ON ai_rate_limits(ip, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_rate_limits_user_created ON ai_rate_limits(user_id, created_at);

CREATE TABLE IF NOT EXISTS shared_summaries (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    folder_id TEXT,
    title TEXT NOT NULL,
    summary_content TEXT NOT NULL,
    password_hash TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_shared_summaries_session ON shared_summaries(session_id);
CREATE INDEX IF NOT EXISTS idx_shared_summaries_folder ON shared_summaries(folder_id);

-- 7. API Settings & Usage Logs
CREATE TABLE IF NOT EXISTS api_settings (
    key TEXT PRIMARY KEY,
    api_key TEXT,
    endpoint TEXT,
    model TEXT,
    provider TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS usage_logs (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    action TEXT NOT NULL,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_usage_logs_created ON usage_logs(created_at DESC);
