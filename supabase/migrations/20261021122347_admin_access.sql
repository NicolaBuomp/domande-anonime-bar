-- S3: accesso del gestore (spec §3.3, §3.4, §3.5).

-- Allowlist del gestore: difesa in profondità. Anche se un domani si attivassero
-- signup o anonymous sign-ins, i nuovi utenti "authenticated" non vedrebbero nulla.
create table public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.app_admins enable row level security;
revoke all on table public.app_admins from anon, authenticated;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

-- Il gestore legge e cancella; nessun INSERT né UPDATE diretto (le transizioni
-- passano dalle funzioni qui sotto).
grant select, delete on table public.questions to authenticated;
create policy questions_admin_select on public.questions
  for select to authenticated using (public.is_admin());
create policy questions_admin_delete on public.questions
  for delete to authenticated using (public.is_admin());

-- Manda in onda: la precedente in onda diventa letta, quella scelta va in onda.
-- Il lock serializza i tap quasi simultanei da due dispositivi: vince l'ultimo.
create function public.go_on_air(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('on_air', 0));

  if not exists (select 1 from public.questions where id = p_id and status = 'new') then
    raise exception 'not_found_or_invalid_state' using errcode = 'P0002';
  end if;

  update public.questions
     set status = 'read', read_at = now()
   where status = 'on_air';

  update public.questions
     set status = 'on_air', on_air_at = now()
   where id = p_id;
end;
$$;

-- Segna come letta: new → read oppure on_air → read.
create function public.mark_read(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.questions
     set status = 'read', read_at = now()
   where id = p_id and status in ('new', 'on_air');

  if not found then
    raise exception 'not_found_or_invalid_state' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.go_on_air(uuid) from public, anon;
revoke execute on function public.mark_read(uuid) from public, anon;
grant execute on function public.go_on_air(uuid) to authenticated, service_role;
grant execute on function public.mark_read(uuid) to authenticated, service_role;

-- Realtime per /admin: gli eventi INSERT/UPDATE passano dalla policy di select.
-- submit_log NON va mai nella publication.
alter publication supabase_realtime add table public.questions;
