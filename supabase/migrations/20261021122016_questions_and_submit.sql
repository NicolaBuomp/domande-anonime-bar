-- S2: domande, log antispam e funzione di invio atomica (spec §3.1, §3.3, §3.4).

create type public.question_status as enum ('new', 'on_air', 'read');

create table public.questions (
  id          uuid primary key default gen_random_uuid(),
  text        text not null check (char_length(text) between 1 and 300),
  nickname    text check (nickname is null or char_length(nickname) between 1 and 30),
  status      public.question_status not null default 'new',
  created_at  timestamptz not null default now(),
  on_air_at   timestamptz,
  read_at     timestamptz
);
create index questions_created_at_idx on public.questions (created_at);
-- al massimo una domanda in onda, garantito dal DB
create unique index questions_one_on_air on public.questions ((true)) where status = 'on_air';

-- dati tecnici antispam: NESSUN riferimento alla domanda.
-- created_at troncato al secondo per ridurre la correlazione con questions (spec §9 A2).
create table public.submit_log (
  id           bigint generated always as identity primary key,
  device_hash  text not null check (device_hash ~ '^[0-9a-f]{64}$'),
  ip_hash      text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  created_at   timestamptz not null default date_trunc('second', now())
);
create index submit_log_device_idx on public.submit_log (device_hash, created_at desc);
create index submit_log_ip_idx on public.submit_log (ip_hash, created_at desc);

-- Due barriere: RLS senza policy + nessun grant per anon/authenticated.
-- (Supabase concede di default tutto ai ruoli API sulle nuove tabelle di public.)
alter table public.questions enable row level security;
alter table public.submit_log enable row level security;
revoke all on table public.questions from anon, authenticated;
revoke all on table public.submit_log from anon, authenticated;
revoke all on sequence public.submit_log_id_seq from anon, authenticated;

-- Rate limit + inserimento nella stessa transazione. I limiti arrivano dal server
-- (src/lib/limits.ts, plan §10). Eseguibile solo dalla service role.
create function public.submit_question(
  p_text            text,
  p_device_hash     text,
  p_ip_hash         text,
  p_cooldown_s      integer,
  p_max_per_window  integer,
  p_window_h        integer,
  p_ip_max_per_min  integer,
  p_nickname        text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now    timestamptz := now();
  v_last   timestamptz;
  v_count  integer;
  v_oldest timestamptz;
begin
  -- serializza le richieste concorrenti dello stesso IP e dello stesso dispositivo
  -- (ordine fisso dei lock: prima IP, poi dispositivo, per evitare deadlock)
  perform pg_advisory_xact_lock(hashtextextended('ip:' || p_ip_hash, 0));
  perform pg_advisory_xact_lock(hashtextextended('dev:' || p_device_hash, 0));

  -- 1. cooldown per dispositivo
  select max(created_at) into v_last
    from public.submit_log
   where device_hash = p_device_hash;
  if v_last is not null and v_last > v_now - make_interval(secs => p_cooldown_s) then
    return jsonb_build_object(
      'status', 'cooldown',
      'retry_after', greatest(1, ceil(extract(epoch from
        (v_last + make_interval(secs => p_cooldown_s)) - v_now)))
    );
  end if;

  -- 2. tetto per sera (finestra mobile) per dispositivo
  select count(*) into v_count
    from public.submit_log
   where device_hash = p_device_hash
     and created_at > v_now - make_interval(hours => p_window_h);
  if v_count >= p_max_per_window then
    return jsonb_build_object('status', 'daily_limit');
  end if;

  -- 3. tetto per IP al minuto (wifi condiviso del locale)
  select count(*), min(created_at) into v_count, v_oldest
    from public.submit_log
   where ip_hash = p_ip_hash
     and created_at > v_now - interval '1 minute';
  if v_count >= p_ip_max_per_min then
    return jsonb_build_object(
      'status', 'busy',
      'retry_after', greatest(1, ceil(extract(epoch from
        (v_oldest + interval '1 minute') - v_now)))
    );
  end if;

  insert into public.questions (text, nickname) values (p_text, p_nickname);
  insert into public.submit_log (device_hash, ip_hash) values (p_device_hash, p_ip_hash);
  return jsonb_build_object('status', 'ok');
end;
$$;

revoke execute on function public.submit_question(text, text, text, integer, integer, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.submit_question(text, text, text, integer, integer, integer, integer, text)
  to service_role;
