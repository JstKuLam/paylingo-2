-- Safe migration to update PayLingo to Username-based auth and RLS

-- 1. Drop existing policies to prevent conflicts
drop policy if exists "Users can read their own active access code" on public.access_codes;
drop policy if exists "Users can manage sessions under their access code" on public.sessions;
drop policy if exists "Users can manage transcript entries under their access code" on public.transcript_entries;
drop policy if exists "Users can manage their own sessions by username" on public.sessions;
drop policy if exists "Users can manage transcript entries under their sessions" on public.transcript_entries;

-- 2. Drop the foreign key constraint from sessions to access_codes
alter table public.sessions drop constraint if exists sessions_access_code_id_fkey;

-- 3. Make access_code_id column optional (nullable) since we migrated to username-based auth
alter table public.sessions alter column access_code_id drop not null;

-- 4. Add username column to sessions (allowing null temporarily for clean migration)
alter table public.sessions add column if not exists username text;

-- 5. Update any existing sessions without a username to have 'old_user'
update public.sessions set username = 'old_user' where username is null;

-- 6. Create new indices on sessions for username lookups
create index if not exists idx_sessions_username_started_at 
    on public.sessions(username, started_at desc);

-- 7. Setup new RLS Policies for Sessions (isolated by user_metadata ->> 'username')
create policy "Users can manage their own sessions by username"
    on public.sessions
    for all
    using (
        username = auth.jwt() -> 'user_metadata' ->> 'username'
        or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    )
    with check (
        username = auth.jwt() -> 'user_metadata' ->> 'username'
        or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    );

-- 8. Setup new RLS Policies for Transcript Entries
create policy "Users can manage transcript entries under their sessions"
    on public.transcript_entries
    for all
    using (
        exists (
            select 1 from public.sessions 
            where public.sessions.id = public.transcript_entries.session_id 
            and (public.sessions.username = auth.jwt() -> 'user_metadata' ->> 'username'
                 or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
        )
    )
    with check (
        exists (
            select 1 from public.sessions 
            where public.sessions.id = public.transcript_entries.session_id 
            and (public.sessions.username = auth.jwt() -> 'user_metadata' ->> 'username'
                 or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
        )
    );
