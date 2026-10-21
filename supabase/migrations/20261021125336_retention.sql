-- S6: cancellazione automatica dopo 48 ore (spec §3.6).

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- Cancella domande e dati tecnici più vecchi di 48 ore. Il trigger di screen_state
-- svuota lo schermo se la domanda in onda era tra quelle cancellate.
create function public.purge_expired()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_questions integer;
  v_submit_log integer;
begin
  delete from public.questions where created_at < now() - interval '48 hours';
  get diagnostics v_questions = row_count;

  delete from public.submit_log where created_at < now() - interval '48 hours';
  get diagnostics v_submit_log = row_count;

  return jsonb_build_object('questions', v_questions, 'submit_log', v_submit_log);
end;
$$;
revoke execute on function public.purge_expired() from public, anon, authenticated;
grant execute on function public.purge_expired() to service_role;

-- Ogni ora al minuto 0: ogni riga sparisce fra 48 e 49 ore dopo l'inserimento.
select cron.schedule('retention-48h', '0 * * * *', 'select public.purge_expired()');

-- Stato del job per il runbook e per i test: esiste, è attivo, com'è andata
-- l'ultima esecuzione, quante righe scadute restano (deve essere 0).
create function public.retention_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'job', (
      select jsonb_build_object('schedule', j.schedule, 'active', j.active, 'command', j.command)
        from cron.job j
       where j.jobname = 'retention-48h'
    ),
    'last_run', (
      select jsonb_build_object(
               'status', d.status,
               'start_time', d.start_time,
               'end_time', d.end_time,
               'return_message', d.return_message)
        from cron.job_run_details d
        join cron.job j on j.jobid = d.jobid
       where j.jobname = 'retention-48h'
       order by d.start_time desc
       limit 1
    ),
    'expired_rows', jsonb_build_object(
      'questions', (select count(*) from public.questions
                     where created_at < now() - interval '48 hours'),
      'submit_log', (select count(*) from public.submit_log
                      where created_at < now() - interval '48 hours')
    )
  );
$$;
revoke execute on function public.retention_status() from public, anon, authenticated;
grant execute on function public.retention_status() to service_role;
