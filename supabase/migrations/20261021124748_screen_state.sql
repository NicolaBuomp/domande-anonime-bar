-- S4: stato dello schermo proiettato (spec §2.6, §3.1, §9 A3).
-- /screen usa la chiave anon e non può leggere questions: legge solo questa riga,
-- che contiene il testo in onda e il nickname. Niente id, niente altro.

create table public.screen_state (
  id          smallint primary key default 1 check (id = 1),
  text        text,
  nickname    text,
  updated_at  timestamptz not null default now()
);
insert into public.screen_state (id) values (1);

alter table public.screen_state enable row level security;
revoke all on table public.screen_state from anon, authenticated;
grant select on table public.screen_state to anon, authenticated;
create policy screen_state_read on public.screen_state
  for select to anon, authenticated using (true);

-- Riscrive la riga dalla domanda in onda (o null). Scatta su qualunque modifica a
-- questions, così resta coerente qualunque sia il percorso: RPC, delete del gestore,
-- cron di retention, SQL d'emergenza (anche TRUNCATE).
create function public.sync_screen_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_text text;
  v_nickname text;
begin
  select q.text, q.nickname into v_text, v_nickname
    from public.questions q
   where q.status = 'on_air'
   limit 1;

  -- aggiorna solo se cambia: niente eventi Realtime inutili a ogni nuova domanda
  update public.screen_state s
     set text = v_text, nickname = v_nickname, updated_at = now()
   where s.id = 1
     and (s.text is distinct from v_text or s.nickname is distinct from v_nickname);

  return null;
end;
$$;
revoke execute on function public.sync_screen_state() from public, anon, authenticated;

create trigger questions_sync_screen
  after insert or update or delete on public.questions
  for each statement execute function public.sync_screen_state();

create trigger questions_sync_screen_truncate
  after truncate on public.questions
  for each statement execute function public.sync_screen_state();

alter publication supabase_realtime add table public.screen_state;
