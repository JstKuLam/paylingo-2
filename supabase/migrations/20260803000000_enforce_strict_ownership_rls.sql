-- Security hardening: mutable profile metadata must never grant data access.
-- Existing ownerless rows remain inaccessible until an administrator backfills
-- them using a trusted mapping. The NOT VALID constraints protect all new writes.

drop policy if exists "Users can manage their own sessions by username" on public.sessions;
drop policy if exists "Users can manage sessions under their access code" on public.sessions;
drop policy if exists "Users can manage their own sessions by owner id" on public.sessions;
drop policy if exists "Users can manage their own sessions" on public.sessions;
drop policy if exists "Users can manage transcript entries under their sessions" on public.transcript_entries;
drop policy if exists "Users can manage transcript entries under their access code" on public.transcript_entries;
drop policy if exists "Users can manage transcript entries under owned sessions" on public.transcript_entries;
drop policy if exists "Users can manage transcript entries" on public.transcript_entries;
drop policy if exists "Users can manage their own folders by username" on public.folders;
drop policy if exists "Users can manage their own folders by owner id" on public.folders;
drop policy if exists "Users can manage their own folders" on public.folders;
drop policy if exists "Users can read their own active access code" on public.access_codes;

create policy "Users can manage strictly owned sessions"
  on public.sessions
  for all
  using (owner_id = auth.uid() or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check (owner_id = auth.uid() or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "Users can manage entries under strictly owned sessions"
  on public.transcript_entries
  for all
  using (
    exists (
      select 1 from public.sessions
      where public.sessions.id = public.transcript_entries.session_id
        and (public.sessions.owner_id = auth.uid() or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.sessions
      where public.sessions.id = public.transcript_entries.session_id
        and (public.sessions.owner_id = auth.uid() or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    )
  );

create policy "Users can manage strictly owned folders"
  on public.folders
  for all
  using (owner_id = auth.uid() or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check (owner_id = auth.uid() or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

alter table public.sessions drop constraint if exists sessions_owner_required;
alter table public.sessions add constraint sessions_owner_required check (owner_id is not null) not valid;
alter table public.folders drop constraint if exists folders_owner_required;
alter table public.folders add constraint folders_owner_required check (owner_id is not null) not valid;
