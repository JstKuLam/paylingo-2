-- Migration: Folders, Folder Sessions, and AI Shared Summaries

-- 1. Create public.folders table
create table if not exists public.folders (
    id uuid primary key default gen_random_uuid(),
    username text not null,
    name text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- 2. Add folder_id column to sessions (allowing NULL)
alter table public.sessions add column if not exists folder_id uuid references public.folders(id) on delete set null;

-- 3. Create public.shared_summaries table for AI-generated protected public shares
create table if not exists public.shared_summaries (
    id uuid primary key default gen_random_uuid(),
    session_id uuid references public.sessions(id) on delete cascade,
    folder_id uuid references public.folders(id) on delete cascade,
    title text not null,
    summary_content text not null,
    password_hash text, -- Optional simple password hash or plain text password
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- 4. Create indices for performance
create index if not exists idx_folders_username on public.folders(username);
create index if not exists idx_sessions_folder_id on public.sessions(folder_id);
create index if not exists idx_shared_summaries_session_id on public.shared_summaries(session_id);
create index if not exists idx_shared_summaries_folder_id on public.shared_summaries(folder_id);

-- 5. Enable Row-Level Security (RLS) on all new tables
alter table public.folders enable row level security;
alter table public.shared_summaries enable row level security;

-- Drop existing policies if they exist to prevent duplicates
drop policy if exists "Users can manage their own folders by username" on public.folders;
drop policy if exists "Admin has full access to folders" on public.folders;
drop policy if exists "Public can read shared_summaries" on public.shared_summaries;
drop policy if exists "Users can manage their own shared_summaries" on public.shared_summaries;

-- 6. Setup RLS Policies for Folders
create policy "Users can manage their own folders by username"
    on public.folders
    for all
    using (
        username = auth.jwt() -> 'user_metadata' ->> 'username'
        or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    )
    with check (
        username = auth.jwt() -> 'user_metadata' ->> 'username'
        or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    );

-- 7. Setup RLS Policies for Shared Summaries
-- Public can read shared summaries by ID (to allow direct link viewing)
create policy "Public can read shared_summaries"
    on public.shared_summaries
    for select
    using (true);

-- Only session/folder owners can create or edit shared summaries
create policy "Users can manage their own shared_summaries"
    on public.shared_summaries
    for all
    using (
        exists (
            select 1 from public.sessions 
            where public.sessions.id = public.shared_summaries.session_id 
            and (public.sessions.username = auth.jwt() -> 'user_metadata' ->> 'username'
                 or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
        )
        or
        exists (
            select 1 from public.folders 
            where public.folders.id = public.shared_summaries.folder_id 
            and (public.folders.username = auth.jwt() -> 'user_metadata' ->> 'username'
                 or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
        )
    )
    with check (
        exists (
            select 1 from public.sessions 
            where public.sessions.id = public.shared_summaries.session_id 
            and (public.sessions.username = auth.jwt() -> 'user_metadata' ->> 'username'
                 or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
        )
        or
        exists (
            select 1 from public.folders 
            where public.folders.id = public.shared_summaries.folder_id 
            and (public.folders.username = auth.jwt() -> 'user_metadata' ->> 'username'
                 or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
        )
    );
