-- Migration: Fix Legacy Session and Folder Ownership & RLS Policies

-- 1. Backfill owner_id for any sessions where owner_id is NULL
update public.sessions as session
set owner_id = (
  select auth_user.id
  from auth.users as auth_user
  where lower(auth_user.email) = lower(session.username)
     or lower(split_part(auth_user.email, '@', 1)) = lower(session.username)
     or lower(auth_user.raw_user_meta_data ->> 'username') = lower(session.username)
     or lower(auth_user.raw_user_meta_data ->> 'full_name') = lower(session.username)
     or lower(auth_user.raw_user_meta_data ->> 'name') = lower(session.username)
  order by auth_user.created_at asc
  limit 1
)
where session.owner_id is null;

-- 2. Backfill owner_id for any folders where owner_id is NULL
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
    where lower(auth_user.email) = lower(folder.username)
       or lower(split_part(auth_user.email, '@', 1)) = lower(folder.username)
       or lower(auth_user.raw_user_meta_data ->> 'username') = lower(folder.username)
       or lower(auth_user.raw_user_meta_data ->> 'full_name') = lower(folder.username)
       or lower(auth_user.raw_user_meta_data ->> 'name') = lower(folder.username)
    order by auth_user.created_at asc
    limit 1
  )
)
where folder.owner_id is null;

-- 3. Update RLS policies to allow access to owned sessions, legacy username sessions, and admins
drop policy if exists "Users can manage their own sessions by owner id" on public.sessions;
drop policy if exists "Users can manage transcript entries under owned sessions" on public.transcript_entries;
drop policy if exists "Users can manage their own folders by owner id" on public.folders;

create policy "Users can manage their own sessions"
  on public.sessions
  for all
  using (
    owner_id = auth.uid()
    or (
      owner_id is null and (
        lower(username) = lower(auth.jwt() ->> 'email')
        or lower(username) = lower(split_part(auth.jwt() ->> 'email', '@', 1))
        or lower(username) = lower(auth.jwt() -> 'user_metadata' ->> 'username')
        or lower(username) = lower(auth.jwt() -> 'user_metadata' ->> 'full_name')
        or lower(username) = lower(auth.jwt() -> 'user_metadata' ->> 'name')
      )
    )
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  )
  with check (
    owner_id = auth.uid()
    or (
      owner_id is null and (
        lower(username) = lower(auth.jwt() ->> 'email')
        or lower(username) = lower(split_part(auth.jwt() ->> 'email', '@', 1))
        or lower(username) = lower(auth.jwt() -> 'user_metadata' ->> 'username')
        or lower(username) = lower(auth.jwt() -> 'user_metadata' ->> 'full_name')
        or lower(username) = lower(auth.jwt() -> 'user_metadata' ->> 'name')
      )
    )
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

create policy "Users can manage transcript entries"
  on public.transcript_entries
  for all
  using (
    exists (
      select 1 from public.sessions
      where public.sessions.id = public.transcript_entries.session_id
        and (
          public.sessions.owner_id = auth.uid()
          or (
            public.sessions.owner_id is null and (
              lower(public.sessions.username) = lower(auth.jwt() ->> 'email')
              or lower(public.sessions.username) = lower(split_part(auth.jwt() ->> 'email', '@', 1))
              or lower(public.sessions.username) = lower(auth.jwt() -> 'user_metadata' ->> 'username')
              or lower(public.sessions.username) = lower(auth.jwt() -> 'user_metadata' ->> 'full_name')
              or lower(public.sessions.username) = lower(auth.jwt() -> 'user_metadata' ->> 'name')
            )
          )
          or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        )
    )
  )
  with check (
    exists (
      select 1 from public.sessions
      where public.sessions.id = public.transcript_entries.session_id
        and (
          public.sessions.owner_id = auth.uid()
          or (
            public.sessions.owner_id is null and (
              lower(public.sessions.username) = lower(auth.jwt() ->> 'email')
              or lower(public.sessions.username) = lower(split_part(auth.jwt() ->> 'email', '@', 1))
              or lower(public.sessions.username) = lower(auth.jwt() -> 'user_metadata' ->> 'username')
              or lower(public.sessions.username) = lower(auth.jwt() -> 'user_metadata' ->> 'full_name')
              or lower(public.sessions.username) = lower(auth.jwt() -> 'user_metadata' ->> 'name')
            )
          )
          or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        )
    )
  );

create policy "Users can manage their own folders"
  on public.folders
  for all
  using (
    owner_id = auth.uid()
    or (
      owner_id is null and (
        lower(username) = lower(auth.jwt() ->> 'email')
        or lower(username) = lower(split_part(auth.jwt() ->> 'email', '@', 1))
        or lower(username) = lower(auth.jwt() -> 'user_metadata' ->> 'username')
        or lower(username) = lower(auth.jwt() -> 'user_metadata' ->> 'full_name')
        or lower(username) = lower(auth.jwt() -> 'user_metadata' ->> 'name')
      )
    )
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  )
  with check (
    owner_id = auth.uid()
    or (
      owner_id is null and (
        lower(username) = lower(auth.jwt() ->> 'email')
        or lower(username) = lower(split_part(auth.jwt() ->> 'email', '@', 1))
        or lower(username) = lower(auth.jwt() -> 'user_metadata' ->> 'username')
        or lower(username) = lower(auth.jwt() -> 'user_metadata' ->> 'full_name')
        or lower(username) = lower(auth.jwt() -> 'user_metadata' ->> 'name')
      )
    )
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
