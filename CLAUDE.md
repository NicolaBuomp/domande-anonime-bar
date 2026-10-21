# Domande anonime al bar

Form anonimo da QR → lista live per il gestore → domanda "in onda" sul proiettore. Evento: ven 23/10/2026.
Fonte di verità: `docs/spec.md` (cosa) e `docs/plan.md` (come, in che ordine). Leggi `AGENTS.md` per Next 16.

## Comandi (prima: `supabase start`, porte 553xx)

| Comando | Output sano |
|---|---|
| `npm run build` | `✓ Compiled successfully` … `Finished TypeScript` … tabella `Route (app)`, exit 0 |
| `npm run lint` | solo l'intestazione `> eslint . --max-warnings=0`, nessun problema, exit 0 |
| `npm test` | `Test Files  N passed (N)` / `Tests  N passed (N)`, exit 0. "Avvia Supabase" = DB spento |
| `npm run e2e` | `✓ … [mobile-chromium] …`, `✓ … [mobile-webkit] …`, `N passed`, exit 0 |

Altri: `npm run dev` (dev sempre sul Supabase locale: le chiavi di `supabase status` vincono su `.env.local`), `npm run test:unit` (senza DB), `npm run db:reset` (migration + tipi), `npm run check:bundle` (dopo il build: niente segreti nel client), `npm run loadtest -- --url …`.
Un task è finito solo con build, lint, unit ed e2e verdi. Se un test fallisce si corregge il codice, non il test.

## Architettura

- `POST /api/questions` (Node, service role) → RPC `submit_question` (rate limit + insert atomici) → `questions` + `submit_log`.
- `/admin` (sessione Supabase Auth, RLS `is_admin()`) ascolta `questions` via Realtime; azioni via RPC `go_on_air`/`mark_read` e DELETE.
- `/screen` (anon) legge solo `screen_state`, una riga sincronizzata da trigger. `/admin/qr` stampa il QR di `NEXT_PUBLIC_SITE_URL`.
- pg_cron ogni ora: `purge_expired()` cancella `questions` e `submit_log` oltre 48 h.

## Convenzioni

- TypeScript strict, App Router, Tailwind. Nessuna nuova dipendenza senza motivarla in `docs/plan.md`.
- Testi UI solo in `src/lib/strings.ts`, in italiano, tono amichevole e breve.
- Migration: `supabase migration new <nome>`. Mai modificare una migration committata (l'hook blocca).
- Commit piccoli, Conventional Commits in italiano (`feat(admin): …`). Se ti discosti dal piano, aggiorna `docs/plan.md` nello stesso commit.
- Lavoro su branch + PR, mai push su `main`. Il deploy in produzione lo autorizza Nicola (`RELEASE_APPROVAL`).
- Variabili d'ambiente documentate in `.env.example`. I file `.env*` non si toccano (l'hook blocca).

## Cose da non sbagliare

- **Mai esporre `submit_log`** al client: niente grant, niente policy, niente Realtime, niente select dalle viste admin.
- **Mai la service role nel client**: vive solo in `src/lib/supabase/service.ts` (`import 'server-only'`), mai `NEXT_PUBLIC_`.
- **Nessuna SELECT (né INSERT) anon su `questions`**: `/screen` legge solo `screen_state`.
- Mai loggare testo, nickname, IP, user agent o hash. La risposta della route non contiene id né hash.
- Testo delle domande sempre come testo React: niente `dangerouslySetInnerHTML`, markdown o link automatici.
