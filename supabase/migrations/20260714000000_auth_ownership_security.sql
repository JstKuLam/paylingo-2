-- Security hardening: user-visible names are labels, never authorization keys.

alter table public.sessions
  add column if not exists owner_id uuid references auth.users(id) on delete set null;

alter table public.folders
  add column if not exists owner_id uuid references auth.users(id) on delete set null;

update public.sessions as session
set owner_id = (
  select auth_user.id
  from auth.users as auth_user
  where lower(auth_user.raw_user_meta_data ->> 'username') = lower(session.username)
  order by auth_user.created_at asc
  limit 1
)
where session.owner_id is null;

update public.folders as folder
set owner_id = coalesce(
  (
    select session.owner_id
    from public.sessions as session
    where session.folder_id = folder.id and session.owner_id is not null
    order by session.started_at asc
    limit 1
  ),
  (
    select auth_user.id
    from auth.users as auth_user
    where lower(auth_user.raw_user_meta_data ->> 'username') = lower(folder.username)
    order by auth_user.created_at asc
    limit 1
  )
)
where folder.owner_id is null;

alter table public.sessions alter column owner_id set default auth.uid();
alter table public.folders alter column owner_id set default auth.uid();

create index if not exists idx_sessions_owner_started_at
  on public.sessions(owner_id, started_at desc);

create index if not exists idx_folders_owner_updated_at
  on public.folders(owner_id, updated_at desc);

drop policy if exists "Users can manage their own sessions by username" on public.sessions;
drop policy if exists "Users can manage transcript entries under their sessions" on public.transcript_entries;
drop policy if exists "Users can manage their own folders by username" on public.folders;

create policy "Users can manage their own sessions by owner id"
  on public.sessions
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "Users can manage transcript entries under owned sessions"
  on public.transcript_entries
  for all
  using (
    exists (
      select 1 from public.sessions
      where public.sessions.id = public.transcript_entries.session_id
        and public.sessions.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.sessions
      where public.sessions.id = public.transcript_entries.session_id
        and public.sessions.owner_id = auth.uid()
    )
  );

create policy "Users can manage their own folders by owner id"
  on public.folders
  for all
  using (
    owner_id = auth.uid()
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  )
  with check (
    owner_id = auth.uid()
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- Public links must be read through the password-aware API, never directly via anon Supabase.
drop policy if exists "Public can read shared_summaries" on public.shared_summaries;
drop policy if exists "Users can manage their own shared_summaries" on public.shared_summaries;

create policy "Owners can manage shared summaries"
  on public.shared_summaries
  for all
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or exists (
      select 1 from public.sessions
      where public.sessions.id = public.shared_summaries.session_id
        and public.sessions.owner_id = auth.uid()
    )
    or exists (
      select 1 from public.folders
      where public.folders.id = public.shared_summaries.folder_id
        and public.folders.owner_id = auth.uid()
    )
  )
  with check (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or exists (
      select 1 from public.sessions
      where public.sessions.id = public.shared_summaries.session_id
        and public.sessions.owner_id = auth.uid()
    )
    or exists (
      select 1 from public.folders
      where public.folders.id = public.shared_summaries.folder_id
        and public.folders.owner_id = auth.uid()
    )
  );

create unique index if not exists idx_shared_summaries_unique_session
  on public.shared_summaries(session_id)
  where session_id is not null;

create unique index if not exists idx_shared_summaries_unique_folder
  on public.shared_summaries(folder_id)
  where folder_id is not null;
