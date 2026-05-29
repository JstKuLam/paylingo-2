-- Up Migration: Initial Schema Setup for PayLingo

-- Enable UUID extension if not already enabled
create extension if not exists "pgcrypto";

-- Create access_codes table
create table if not exists public.access_codes (
    id uuid primary key default gen_random_uuid(),
    code text not null unique,
    label text not null,
    expires_at timestamptz not null,
    max_minutes int not null default 60,
    used_minutes int not null default 0,
    created_at timestamptz not null default now()
);

-- Create sessions table
create table if not exists public.sessions (
    id uuid primary key default gen_random_uuid(),
    access_code_id uuid not null references public.access_codes(id) on delete cascade,
    name text not null,
    partner_language text not null,
    started_at timestamptz not null default now(),
    ended_at timestamptz,
    duration_seconds int not null default 0
);

-- Create transcript_entries table
create table if not exists public.transcript_entries (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null references public.sessions(id) on delete cascade,
    speaker text not null check (speaker in ('host', 'partner')),
    original_text text not null,
    translated_text text not null,
    start_ms int not null,
    end_ms int not null,
    created_at timestamptz not null default now()
);

-- Create indices for performance
create index if not exists idx_sessions_access_code_started_at 
    on public.sessions(access_code_id, started_at desc);

create index if not exists idx_transcript_entries_session_start_ms 
    on public.transcript_entries(session_id, start_ms);

-- Enable Row-Level Security (RLS) on all tables
alter table public.access_codes enable row level security;
alter table public.sessions enable row level security;
alter table public.transcript_entries enable row level security;

-- Drop existing policies if they exist to prevent duplication errors
drop policy if exists "Admin has full access to access_codes" on public.access_codes;
drop policy if exists "Users can read their own active access code" on public.access_codes;
drop policy if exists "Admin has full access to sessions" on public.sessions;
drop policy if exists "Users can manage sessions under their access code" on public.sessions;
drop policy if exists "Admin has full access to transcript_entries" on public.transcript_entries;
drop policy if exists "Users can manage transcript entries under their access code" on public.transcript_entries;

-- Setup RLS Policies for Access Codes
create policy "Admin has full access to access_codes"
    on public.access_codes
    for all
    using (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    )
    with check (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    );

create policy "Users can read their own active access code"
    on public.access_codes
    for select
    using (
        id = (auth.jwt() -> 'user_metadata' ->> 'access_code_id')::uuid
        and expires_at > now()
    );

-- Setup RLS Policies for Sessions
create policy "Admin has full access to sessions"
    on public.sessions
    for all
    using (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    )
    with check (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    );

create policy "Users can manage sessions under their access code"
    on public.sessions
    for all
    using (
        access_code_id = (auth.jwt() -> 'user_metadata' ->> 'access_code_id')::uuid
    )
    with check (
        access_code_id = (auth.jwt() -> 'user_metadata' ->> 'access_code_id')::uuid
    );

-- Setup RLS Policies for Transcript Entries
create policy "Admin has full access to transcript_entries"
    on public.transcript_entries
    for all
    using (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    )
    with check (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    );

create policy "Users can manage transcript entries under their access code"
    on public.transcript_entries
    for all
    using (
        exists (
            select 1 from public.sessions 
            where public.sessions.id = public.transcript_entries.session_id 
            and public.sessions.access_code_id = (auth.jwt() -> 'user_metadata' ->> 'access_code_id')::uuid
        )
    )
    with check (
        exists (
            select 1 from public.sessions 
            where public.sessions.id = public.transcript_entries.session_id 
            and public.sessions.access_code_id = (auth.jwt() -> 'user_metadata' ->> 'access_code_id')::uuid
        )
    );
