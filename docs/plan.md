# Plan: domande anonime per la serata al bar

Stato: **approvato** il 21/10/2026 (comprese le modifiche di §10). Deviazioni registrate in §13.
Input: [`docs/spec.md`](spec.md) (approvata il 21/10 con tutti i default, compresi il cookie `did` e il tetto per IP). Fonte primaria: [`intent/intent.md`](../intent/intent.md).

Scadenza: **in produzione e provato giovedì 22/10 sera**. Evento: venerdì 23/10.

Questo documento basta per implementare senza aver seguito la conversazione. Dove dice "spec §x", la fonte di verità è la spec.

---

## 0. Ambiente verificato (21/10)

| Strumento | Versione | Note |
|---|---|---|
| Node / npm | 24.21 / 11.19 | |
| Next.js | 16.4.x | in Next 16 il middleware si chiama **`src/proxy.ts`** (ex `middleware.ts`) e `next lint` non esiste più: si usa `eslint` direttamente |
| Tailwind | 4.3.x | config CSS-first (`@import "tailwindcss"`), plugin `@tailwindcss/postcss` |
| @supabase/supabase-js / @supabase/ssr | 2.118 / 0.12 | |
| Supabase CLI | 2.120 | serve Docker: **OrbStack oggi è spento**, va avviato prima di `supabase start` |
| Vercel CLI / gh | 63.1 / 2.102 | |
| Repo GitHub | `NicolaBuomp/domande-anonime-bar`, **pubblico** | la branch protection è disponibile sul piano free |

---

## 1. Dipendenze (e perché)

Runtime:
- `next`, `react`, `react-dom`: lo stack deciso.
- `@supabase/supabase-js`: client DB, Auth e Realtime.
- `@supabase/ssr`: pacchetto ufficiale Supabase per la sessione nei cookie, che serve a `proxy.ts` e ai Server Component. Senza, l'auth lato server andrebbe riscritta a mano.
- `qrcode`: decisa.
- `server-only`: pacchetto del team Next. Fa **fallire il build** se un modulo server (la service role) viene importato da un Client Component. Costa zero e chiude il rischio più grave.

Dev: `typescript`, `@types/node`, `@types/react`, `@types/qrcode`, `tailwindcss`, `@tailwindcss/postcss`, `eslint`, `eslint-config-next`, `prettier`, `vitest`, `@playwright/test`.

Volutamente **senza**: zod (la validazione è su due campi, bastano 30 righe testate), librerie di UI, librerie per il filtro parolacce (sono orientate all'inglese), Redis o Upstash (vedi §9), `pg` (i test passano da supabase-js e da RPC), autocannon (il load test usa `fetch` nativo di Node 24).

---

## 2. Architettura in breve

```
Telefono ──POST /api/questions──▶ Route Handler (Node, service role) ──rpc submit_question──▶ Postgres
                                                                                    │
Admin (tablet/telefono) ◀──postgres_changes(questions, RLS is_admin)── Realtime ◀───┤
   └─rpc go_on_air / mark_read, DELETE (RLS) ─────────────────────────────────────▶ │
Schermo (/screen, anon) ◀──postgres_changes(screen_state)──────────── Realtime ◀───┘ (trigger)
pg_cron ogni ora ──▶ purge_expired()  (questions + submit_log > 48h)
```

- La service role vive **solo** in `src/lib/supabase/service.ts` (`import 'server-only'`), usata solo dalla route.
- Il browser usa la chiave anon: `/admin` con la sessione del gestore, `/screen` senza sessione e solo su `screen_state`.
- Vercel ha la region di funzione `fra1`, Supabase la regione UE più vicina (es. `eu-central-1`), per tenere bassa la latenza fra i due.

---

## 3. File che cambiano

```
.claude/settings.json                 hook (S0, vedi §6)
.claude/hooks/guard-files.mjs         blocca .env* (eccetto .env.example) e le migration già committate
.claude/hooks/guard-deploy.mjs        blocca i deploy in produzione senza RELEASE_APPROVAL
.claude/hooks/format.mjs              prettier + eslint --fix sul file modificato
.github/workflows/ci.yml              lint, build, test, e2e su Supabase locale + claude-code-action
.env.example                          tutte le variabili (spec §3.7 + §10 di questo piano)
.gitignore                            .env*, !.env.example, test-results/, artifacts/
CLAUDE.md                             < 1 pagina (comandi, convenzioni, architettura, "Cose da non sbagliare")
REVIEW.md                             tre passate: bug, sicurezza, compliance
README.md                             breve, rimanda a CLAUDE.md e docs/
vercel.json                           regions fra1, nessun deploy dal branch development (S9)
next.config.ts                        header di sicurezza
eslint.config.mjs, .prettierrc, postcss.config.mjs, tsconfig.json, vitest.config.ts, playwright.config.ts
package.json                          script (§5)

docs/spec.md                          stato → approvata + modifiche di §10
docs/plan.md                          questo file
docs/runbook.md                       S9

public/logo.png                       logo del locale (era il placeholder logo.svg)
src/config/site.ts                    nome del bar (placeholder "Il Bar"), percorso del logo, URL del sito
src/lib/strings.ts                    tutti i testi UI della spec §7 (un solo posto)
src/lib/text.ts                       normalize(), charCount() (code point), validateQuestion()
src/lib/profanity.ts                  lista + normalizzazione + containsProfanity()
src/lib/limits.ts                     costanti dei limiti (+ override del tetto per IP da env)
src/lib/device.ts                     getClientIp(), deviceHash(), ipHash(), newDeviceId()
src/lib/supabase/service.ts           client service role (server-only)
src/lib/supabase/server.ts            client SSR con i cookie (Server Component, proxy)
src/lib/supabase/browser.ts           client browser (anon)
src/lib/database.types.ts             generato: supabase gen types typescript --local
src/proxy.ts                          protegge /admin/* tranne /admin/login
src/app/layout.tsx, globals.css       lang="it", font, Tailwind
src/app/page.tsx                      / (Server Component che rende QuestionForm)
src/app/QuestionForm.tsx              client: form, bozza, stati di errore, grazie
src/app/api/questions/route.ts        POST (spec §2.2)
src/app/admin/login/page.tsx          + LoginForm.tsx
src/app/admin/layout.tsx              verifica getUser() lato server (difesa oltre al proxy)
src/app/admin/page.tsx                + AdminBoard.tsx (client, realtime), QuestionCard.tsx
src/app/admin/qr/page.tsx             QR stampabile
src/app/screen/page.tsx               + ScreenView.tsx (client, realtime + polling di fallback)

supabase/config.toml                  enable_signup=false, anonymous sign-ins=false
supabase/migrations/<ts>_questions_and_submit.sql   S2
supabase/migrations/<ts>_admin_access.sql           S3
supabase/migrations/<ts>_screen_state.sql           S4
supabase/migrations/<ts>_retention.sql              S6

tests/setup/env.ts                    legge `supabase status -o json` e imposta le env di test
tests/setup/admin.ts                  crea l'admin di test con password casuale per ogni run
tests/unit/*.test.ts                  text, profanity, limits, device
tests/integration/questions-route.test.ts
tests/integration/retention.test.ts
tests/rls/rls.test.ts
e2e/flow.spec.ts                      flusso completo (spec §4)
e2e/visual.spec.ts                    screenshot + PDF di stampa
scripts/loadtest.mjs                  200 invii da 50 dispositivi in 2 minuti
scripts/check-client-bundle.mjs       cerca stringhe vietate in .next/static
```

Per le migration si usa `supabase migration new <nome>`, che genera il timestamp. **Una migration committata non si modifica mai**: le correzioni vanno in una migration nuova (lo impone anche l'hook).

---

## 4. Ordine del lavoro

Il percorso critico viene prima: **form → DB → admin realtime → screen → QR → retention**. Ogni step termina con un commit (o pochi) con build, lint e test verdi.

Si lavora sul branch `build/mvp`, creato da `main` (che contiene già intent, spec e piano). Dopo S0 faccio push del branch e apro una PR in draft, così Vercel genera le preview fin da subito. **Il merge su `main` lo approvi tu.**

### S0. Scaffolding, tooling e guardrail (circa 1 h)
- `create-next-app@16.4` (TS, App Router, Tailwind, ESLint, `src/`, alias `@/*`) in una cartella temporanea, poi copiato nel repo, perché la directory non è vuota.
- Dipendenze di §1. Script di §5. `vitest.config.ts` con progetti `unit`, `integration`, `rls`. `playwright.config.ts` con `webServer: npm run build && npm run start`.
- `supabase init`, poi in `config.toml`: `[auth] enable_signup = false`, `enable_anonymous_sign_ins = false`, `site_url = http://localhost:3000`.
- `.claude/settings.json` e hook (§6), **anticipati da Fase 5 a S0**, così proteggono anche il build. Vedi §10.
- `CLAUDE.md` (Fase 3, punto 1), `.env.example`, `.gitignore`, `vercel.json` (`{"regions":["fra1"],"git":{"deploymentEnabled":{"main":false}}}`), `next.config.ts` con header `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- `src/config/site.ts`, `public/logo.svg` placeholder, `src/lib/strings.ts` con tutti i testi.
- **Fatto quando**: `npm run build`, `npm run lint` e `npm test` (un test di smoke) sono verdi. Un tentativo di Edit su `.env.local` viene bloccato con il motivo.

### S1. Form pubblico + route `POST /api/questions` (circa 2 h)
- `src/lib/text.ts`: normalizzazione e validazione come da spec §2.2, punti 3–4. `charCount = [...s].length`, coerente con il `char_length` di Postgres.
- `src/lib/profanity.ts`: spec §2.2.1. La lista è un array di `{ term, mode: 'word' | 'prefix' }` più `allow: string[]`. Va scritta con cura: parolacce, bestemmie, insulti e termini d'odio italiani comuni.
- `src/lib/device.ts`:
  - `getClientIp(headers)`: `x-real-ip`, poi il primo valore di `x-forwarded-for`, poi `"unknown"`;
  - `deviceHash` e `ipHash` con `node:crypto` (spec §3.2);
  - `newDeviceId()`: `crypto.randomUUID()`.
- `src/lib/limits.ts`: `COOLDOWN_S=60`, `MAX_PER_WINDOW=10`, `WINDOW_H=12`, `IP_MAX_PER_MIN = Number(process.env.RATE_LIMIT_IP_PER_MINUTE ?? 30)`.
- `route.ts` (runtime `nodejs`, `dynamic = 'force-dynamic'`): segue la pipeline della spec §2.2. Legge e scrive il cookie `did` da `NextRequest` e `NextResponse`, **non** con `cookies()` di `next/headers`, così la funzione è testabile chiamandola con una `Request`. Passa i limiti come parametri a `submit_question` (vedi §10). Se `SUBMISSIONS_OPEN === 'false'` → `503 { error: "closed" }`. Nei log scrive solo `console.error` con il codice di errore, mai il body.
- `QuestionForm.tsx`: spec §2.1 (contatore, honeypot, bozza in `localStorage` in `try/catch`, timeout di 10 s con `AbortController`, countdown per i 429, `aria-live`, focus sul messaggio di errore).
- **Test**: unit `text`, `profanity` (positivi: leet, lettere spaziate, ripetizioni, accenti; negativi: "configurazione", "scazzottata" se in allow, nomi comuni), `device` (hash deterministico; cambia al cambiare di sale, `did`, ua o ip; output esadecimale da 64 caratteri), `limits`. La route si prova in S2, quando esiste il DB.
- **Fatto quando**: unit verdi, il form si vede a 375 px e gli errori client-side funzionano.

### S2. DB: schema, RLS, `submit_question` (circa 1,5 h)
- Migration `questions_and_submit`:
  - enum, `questions`, `submit_log` (con `created_at` troncato al secondo), indici e indice unico parziale `on_air` (spec §3.1);
  - `alter table … enable row level security` su entrambe;
  - `revoke all on questions, submit_log from anon, authenticated`;
  - funzione `submit_question(p_text, p_nickname, p_device_hash, p_ip_hash, p_cooldown_s, p_max_per_window, p_window_h, p_ip_max_per_min) returns jsonb`: `pg_advisory_xact_lock(hashtextextended(p_device_hash, 0))`, poi i controlli nell'ordine cooldown → daily_limit → busy, poi l'insert in `questions` e in `submit_log`. `retry_after` si calcola da `created_at` dell'ultima riga rilevante. `security invoker`, `set search_path = ''`, `revoke execute … from public, anon, authenticated`, `grant execute … to service_role`.
- `supabase db reset`, poi `supabase gen types typescript --local > src/lib/database.types.ts`.
- **Test di integrazione** `questions-route.test.ts` (Vitest contro Supabase locale; la funzione `POST` viene importata e chiamata con una `Request`):
  ok → 201, riga in `questions`, riga in `submit_log`, cookie `did` impostato, body che **non** contiene hash né id · testo di 301 caratteri → 400 `too_long` · testo vuoto o solo spazi → 400 `empty` · nickname di 31 caratteri → 400 · JSON non valido → 400 · honeypot compilato → 201 e **zero** righe nuove · parolaccia nel testo → 422 e zero righe · parolaccia nel nickname → 422 · secondo invio entro 60 s con lo stesso `did`/ip/ua → 429 `cooldown` con `Retry-After` · undicesimo invio in 12 h (`submit_log` precompilato con righe retrodatate via service role) → 429 `daily_limit` · 31 invii in un minuto dallo stesso IP con `did` diversi → 429 `busy` · due richieste concorrenti dallo stesso dispositivo → una sola 201 · `SUBMISSIONS_OPEN=false` → 503.
- **Test RLS** `rls.test.ts` (parte 1), con chiave anon: SELECT su `questions` → errore · INSERT su `questions` → errore · SELECT e INSERT su `submit_log` → errore · `rpc('submit_question')` → errore.
- **Fatto quando**: unit, integrazione e RLS verdi. Il form invia davvero in locale.

### S3. Admin: login, proxy, realtime (circa 2,5 h) — lo step più rischioso, vedi §8
- Migration `admin_access`:
  - `app_admins`, `is_admin()` (security definer, stable, `search_path=''`);
  - `grant select, delete on questions to authenticated`, policy `select` e `delete` `using (public.is_admin())`;
  - `go_on_air(uuid)` e `mark_read(uuid)` (security definer, `if not is_admin() then raise exception 'forbidden'`, transizioni come da spec §3.4), con `grant execute` a `authenticated`;
  - `alter publication supabase_realtime add table public.questions`.
- `src/proxy.ts`: matcher `/admin/:path*`. Lascia passare `/admin/login`. `createServerClient` aggiorna i cookie e chiama `auth.getUser()`; se non c'è un utente → redirect a `/admin/login?next=<path>`.
- `admin/layout.tsx`: verifica di nuovo con `getUser()` lato server (redirect se manca), così la protezione non dipende solo dal proxy.
- `LoginForm`: `signInWithPassword`, `next` accettato solo se inizia con `/admin`.
- `AdminBoard.tsx`:
  - fetch iniziale con colonne esplicite (`id,text,nickname,status,created_at,on_air_at,read_at`), ordinato per `created_at`, `limit 500`;
  - stato in un `Map<id, Question>`;
  - canale `postgres_changes` su `questions` (INSERT/UPDATE/DELETE);
  - refetch completo quando il canale passa a `SUBSCRIBED` (anche dopo una riconnessione) e su `visibilitychange → visible`;
  - **polling di fallback ogni 20 s** finché il canale non è `SUBSCRIBED`;
  - indicatore Live / Riconnessione / Offline;
  - azioni via `rpc` e `delete`; su 401, 403 o JWT scaduto si mostra il banner "Sessione scaduta";
  - titolo della scheda `(n) Domande`, `aria-live` per le nuove;
  - layout telefono e tablet (spec §2.4).
- `tests/setup/admin.ts`: `auth.admin.createUser` (service role, email `e2e-admin@example.test`, password casuale generata a ogni run e tenuta solo in `process.env`), poi insert in `app_admins`. Crea anche un utente "non admin" per i test RLS.
- **Test**:
  - RLS (parte 2): utente autenticato non admin → SELECT su `questions` restituisce `[]`, DELETE non cancella, `go_on_air` va in errore. Admin → SELECT ok, `go_on_air` ok, una seconda `go_on_air` fa diventare `read` la precedente, mai due `on_air`.
  - E2E parziale: login → invio da contesto mobile → la domanda compare in `/admin` **senza reload**.
  - Test: `/admin` senza sessione → redirect al login.
- **Fatto quando**: tutto verde e verificato a mano su telefono e tablet (DevTools).

### S4. Schermo (circa 1,5 h)
- Migration `screen_state`:
  - tabella a riga singola (spec §3.1), RLS, `grant select … to anon, authenticated`, policy `select using (true)`, nessun grant di scrittura;
  - funzione trigger `sync_screen_state()` (security definer) e trigger `after insert or update or delete on questions for each statement` che riscrive la riga 1 dalla domanda `on_air` (oppure `null`);
  - aggiunta alla publication.
- `ScreenView.tsx`: client anon, `select text,nickname from screen_state`, canale `postgres_changes` UPDATE su `screen_state`, polling ogni 30 s, indicatore dopo 10 s di disconnessione, Wake Lock (riacquisito su `visibilitychange`), cursore nascosto dopo 3 s, font a scaglioni in `vw` (≤60 caratteri: 6.25vw ≈ 120 px; ≤120: 5vw; ≤200: 3.75vw; oltre: 2.9vw ≈ 56 px a 1920 px), dissolvenza disattivata con reduced-motion.
- **Test**:
  - RLS: anon SELECT su `screen_state` ok, UPDATE errore, nessuna colonna id.
  - Integrazione: `go_on_air`, poi `screen_state.text` uguale al testo; `mark_read` → `null`; DELETE della domanda in onda → `null`.
  - E2E: aggiunti i passi "manda in onda → compare in `/screen`" e "letta → schermo in attesa".

### S5. QR stampabile (circa 45 min)
- `admin/qr/page.tsx` (Server Component): `QRCode.toString(SITE_URL, { type: 'svg', errorCorrectionLevel: 'M', margin: 4 })`, convertito in data URI e reso con `<img>` (niente `dangerouslySetInnerHTML`). Layout A4 e CSS di stampa come da spec §2.5. Se manca `NEXT_PUBLIC_SITE_URL` → messaggio `qr.missingUrl`.
- **Test**: unit sulla funzione che costruisce il data URI (URL corretto, errore se manca). E2E visuale: `emulateMedia({ media: 'print' })` + screenshot + `page.pdf({ format: 'A4' })`, controllati a mano.

### S6. Retention (circa 45 min)
- Migration `retention`:
  - `create extension if not exists pg_cron`;
  - funzione `purge_expired() returns jsonb` (cancella da `questions` e `submit_log` con `created_at < now() - interval '48 hours'`, restituisce i conteggi), eseguibile solo da `service_role`/`postgres`;
  - `cron.schedule('retention-48h', '0 * * * *', 'select public.purge_expired()')`;
  - funzione `retention_status()` (solo `service_role`) che restituisce il job e l'ultima esecuzione da `cron.job_run_details`, usata dal runbook e dal test.
- **Test** `retention.test.ts`: inserisce righe retrodatate di 49 h e di 47 h, chiama `purge_expired()`, verifica che le prime siano sparite e le seconde no. Verifica che la domanda in onda retrodatata, una volta cancellata, svuoti `screen_state`. Verifica che `retention_status()` riporti il job con schedule `0 * * * *` e `active = true`.

### S7. Test completi, verifica visiva, load test (circa 1,5 h)
- `e2e/flow.spec.ts`: tre contesti.
  1. Pubblico in viewport mobile (Pixel 7 su Chromium e iPhone 13 su WebKit): invia una domanda.
  2. Admin in viewport tablet, loggato: la domanda compare senza reload.
  3. "Manda in onda": compare in `/screen` a 1920×1080.
  4. "Letta": lo schermo torna in attesa.
  5. "Elimina" → "Sicuro?": la card sparisce.
- `e2e/visual.spec.ts` salva in `artifacts/screenshots/` (gitignored): `/` (375×812, anche in stato di errore e di grazie), `/admin` (390×844 e 820×1180, con dati), `/screen` (1920×1080, in onda con domanda di 300 caratteri e in attesa), `/admin/qr` (print + PDF). **Li guardo uno per uno e correggo quello che non va** (overflow, contrasto, testi tagliati, target piccoli).
- `scripts/loadtest.mjs --url <base> [--bypass <token>]`: 50 dispositivi virtuali, ognuno con un user agent realistico e un cookie jar proprio, 4 invii a istanti casuali in 120 s (200 in totale). Al termine stampa la distribuzione degli status. **Esce con codice ≠ 0 se c'è anche un solo 5xx o errore di rete.** In locale controlla anche che le righe inserite rispettino i limiti (nessun dispositivo con più di 2 accettate a meno di 60 s di distanza). Secondo la spec §9 A5 i 429 sono attesi.
- `scripts/check-client-bundle.mjs` (eseguito dopo il build in CI e in `npm run build:check`): cerca in `.next/static/**` le stringhe `submit_log`, `service_role`, `SUBMIT_SALT`, `SUPABASE_SERVICE_ROLE_KEY` e i **valori** delle variabili segrete presenti nell'env. Fallisce se ne trova una.
- **Fatto quando**: `npm run build`, `npm run lint`, `npm test` e `npm run e2e` sono verdi, l'output è incollato nella PR, gli screenshot sono controllati e il load test locale ha zero 5xx.

### S8. Guardrail, review, CI, branch protection (circa 1 h)
- Gli hook ci sono già da S0 (§6).
- `REVIEW.md`: tre passate.
  - **Bug**.
  - **Sicurezza**: RLS, service role, leak di `submit_log`, XSS sul testo, rate limit aggirabile (header IP su host diversi da Vercel, rotazione dello user agent, cookie cancellato), DELETE di Realtime con la sola PK (accettato, spec A4).
  - **Compliance**: aderenza a spec e piano.
  - **Important** = qualsiasi cosa possa esporre dati, rompere la serata, violare la spec o lasciare un test rosso. **Nit** = stile, naming, micro-refactor, al massimo 5 per review.
- `ci.yml` (on `pull_request`):
  - job `checks`: checkout, setup-node 24, `npm ci`, `supabase/setup-cli`, `supabase start -x studio,imgproxy,edge-runtime,logflare,vector,storage-api`, `npm run lint`, `npm run build`, `node scripts/check-client-bundle.mjs`, `npm test`, `npx playwright install --with-deps chromium webkit`, `npm run e2e`, upload del report Playwright in caso di errore;
  - job `review`: `anthropics/claude-code-action@v1` con prompt "Esegui la review secondo REVIEW.md", `permissions: contents: read, pull-requests: write`, secret `ANTHROPIC_API_KEY`. Gira solo se la PR non viene da un fork (repo pubblico: mai `pull_request_target`).
- Branch protection su `main` (`gh api -X PUT repos/NicolaBuomp/domande-anonime-bar/branches/main/protection`): PR obbligatoria, status check `checks` richiesto, `enforce_admins: true`, niente force push. **0 approvazioni richieste**, perché sei l'unico maintainer e GitHub non permette di approvare la propria PR: altrimenti nessuno potrebbe più fare merge.

### S9. Deploy di preview e runbook (circa 1 h, giovedì mattina)
- Preview Vercel dalla PR (Git integration), con le variabili Preview che puntano al progetto Supabase **staging**. Migration applicate a staging con `supabase link` + `supabase db push`.
- `npm run e2e` contro la preview (`E2E_BASE_URL`, header `x-vercel-protection-bypass`), poi il load test contro la preview.
- `docs/runbook.md`: spec §9 e Fase 6. Contiene:
  - checklist di giovedì;
  - wifi di riserva (hotspot);
  - kill switch `SUBMISSIONS_OPEN`;
  - svuotamento d'emergenza (SQL: `truncate questions, submit_log;` + verifica di `screen_state`);
  - verifica della retention (`select public.retention_status();` + conteggio delle righe più vecchie di 48 h = 0);
  - rotazione di `SUBMIT_SALT` dopo l'evento;
  - nota sui backup e sui log di piattaforma (spec A7).
- **Il deploy in produzione lo fai tu**, dopo l'e2e verde sulla preview: "Promote to Production" dal dashboard Vercel, oppure `vercel --prod` dal tuo terminale.

---

## 5. Comandi (`package.json`)

| Script | Cosa fa |
|---|---|
| `dev` | `next dev` |
| `build` | `next build` |
| `start` | `next start` |
| `lint` | `eslint . --max-warnings=0` |
| `format` | `prettier --write .` |
| `test` | `vitest run`: unit + integrazione + RLS. Richiede `supabase start`; se il DB non risponde fallisce con "Avvia Supabase: supabase start" |
| `test:unit` | solo unit, senza DB |
| `e2e` | `playwright test` (base URL locale o `E2E_BASE_URL`) |
| `db:reset` | `supabase db reset` + generazione dei tipi |
| `loadtest` | `node scripts/loadtest.mjs` |

Le env di test non stanno in file: `tests/setup/env.ts` le ricava da `supabase status -o json` (chiavi locali, valori di test).

---

## 6. Hook (`.claude/settings.json`)

| Evento | Matcher | Script | Comportamento |
|---|---|---|---|
| PreToolUse | `Edit\|Write\|MultiEdit\|NotebookEdit` | `guard-files.mjs` | Exit 2 con motivo su stderr se il path corrisponde a `.env*` (tranne `.env.example`, che non contiene segreti ed è richiesto dalle regole), oppure se è in `supabase/migrations/` ed è già tracciato da git (`git ls-files --error-unmatch`). Messaggio: "Migration già committata/applicata: crea una nuova migration con `supabase migration new`." |
| PreToolUse | `Bash` | `guard-deploy.mjs` | Se il comando contiene `vercel … --prod`, `--target production`/`--target=production`, `vercel promote` o `vercel alias` e **la variabile d'ambiente di processo** `RELEASE_APPROVAL` non è impostata → exit 2 con motivo. Un `RELEASE_APPROVAL=…` scritto *dentro* il comando viene ignorato e bloccato (altrimenti l'agente potrebbe autorizzarsi da solo). |
| PreToolUse | `mcp__.*__(create_deployment\|request_promote\|assign_alias\|request_rollback)` | `guard-deploy.mjs` | Stessa regola per i tool MCP di Vercel quando il target è la produzione. |
| PostToolUse | `Edit\|Write\|MultiEdit` | `format.mjs` | `prettier --write` + `eslint --fix` sul solo file toccato (se l'estensione è supportata). Non blocca: riporta gli errori di eslint rimasti. |

Gli hook sono script Node, senza dipendenza da `jq`, e hanno un test unitario (`tests/unit/hooks.test.ts`) che passa JSON finti su stdin.

---

## 7. Strategia di test (riepilogo)

| Livello | Cosa | Strumento | Gira contro |
|---|---|---|---|
| Unit | validazione, normalizzazione, filtro parolacce, limiti/`retryAfter`, hash, IP, QR data URI, hook | Vitest | niente |
| Integrazione | `POST /api/questions` (tutti i casi di S2), retention, trigger dello schermo | Vitest | Supabase locale |
| RLS | anon (questions, submit_log, screen_state, RPC), autenticato non admin, admin | Vitest + supabase-js | Supabase locale |
| E2E | flusso completo mobile → admin → schermo → letta → elimina; redirect senza sessione | Playwright (Chromium + WebKit) | `next start` locale, poi la preview |
| Visiva | screenshot e PDF di stampa | Playwright | locale |
| Carico | 200 invii / 50 dispositivi / 2 minuti, zero 5xx | `scripts/loadtest.mjs` | locale, poi la preview |
| Leak | stringhe e segreti vietati nel bundle client | `check-client-bundle.mjs` | output del build |

Regola: un task è finito solo con build, lint, unit ed e2e verdi e l'output incollato. **Se un test fallisce si corregge il codice, non il test.**

---

## 8. Domande che mi sono fatto

### 8.1 Cosa può rompersi la sera dell'evento

**Cade il wifi del locale**
- *Pubblico*: l'app è su internet, non in LAN, quindi chi è in 4G/5G non se ne accorge. Chi è sul wifi riceve `form.offline` e la bozza resta salvata: basta riprovare o passare ai dati mobili.
- *Admin e schermo*: se usano il wifi del locale, Realtime cade. L'indicatore diventa ambra o rosso e lo schermo tiene l'ultima domanda. Alla riconnessione si fa un refetch completo, quindi non si perde nulla.
- *Mitigazione nel runbook*: admin e laptop dello schermo su un **hotspot dedicato** (telefono del gestore o router 4G), non sul wifi dei clienti.

**Picco di invii (annuncio "fateci domande!")**
- 50 invii in un minuto sono pochissimi per Vercel e PostgREST. La route è stateless e il lock è per dispositivo, non globale.
- Il punto debole è **il tetto per IP sul wifi condiviso** (30 al minuto): se tutto il locale scrive dallo stesso wifi nello stesso minuto, qualcuno riceve "Un attimo di pazienza: riprova tra N secondi".
- Mitigazione: il tetto è sovrascrivibile da env (`RATE_LIMIT_IP_PER_MINUTE`, redeploy in circa 1 minuto) e la procedura è nel runbook.
- Realtime sul piano free arriva a 200 connessioni concorrenti. Noi ne usiamo circa 3 (admin + schermo), perché il form non apre canali.

**Sessione admin scaduta**
- L'access token dura 1 h e si rinnova da solo. Il refresh token non scade per inattività con la config di default.
- Rischio reale: il tablet dorme per ore e al risveglio il refresh fallisce o il canale resta "zombie".
- Mitigazioni:
  - refetch e risottoscrizione su `visibilitychange`;
  - polling di fallback;
  - banner "Sessione scaduta" con un tasto che riporta al login preservando `next`;
  - nel runbook: login di nuovo su telefono e tablet **30 minuti prima** dell'inizio, password nel password manager di entrambi i dispositivi.

**Altro**
- *Il laptop dello schermo va in standby*: Wake Lock + impostazioni del sistema operativo (checklist).
- *Il browser dello schermo si ricarica*: `/screen` rilegge lo stato in meno di 1 s.
- *Il QR non si legge*: QR ≥ 12 cm, correzione `M`, nero su bianco, URL stampato in chiaro, prova con 3–4 telefoni giovedì.
- *Il QR punta all'URL sbagliato*: si stampa **solo da produzione**, dopo aver scansionato e inviato una domanda di prova.
- *Uno spammer determinato*: cooldown, tetto per sera e per IP, filtro parolacce. Sullo schermo va solo ciò che sceglie il gestore. In emergenza c'è `SUBMISSIONS_OPEN=false` + redeploy, oppure lo svuotamento SQL.
- *Supabase o Vercel giù*: probabilità bassa, impatto totale. Ripiego: le domande a voce, con carta e penna sui tavoli (runbook).
- *Batteria del tablet*: caricatore nella checklist.

### 8.2 Lo step più rischioso: S3 (admin realtime)

È l'unico punto in cui si intrecciano RLS, JWT dentro Realtime, sessione nei cookie via proxy, più dispositivi e tablet che vanno in standby. Ed è quello su cui il gestore conta tutta la sera.

Il guasto tipico è **silenzioso**: le domande arrivano nel DB ma non compaiono in admin, e il gestore pensa che nessuno scriva.

Mitigazioni:
1. Lo faccio subito dopo il percorso di scrittura, mercoledì, non giovedì.
2. L'indicatore di connessione è sempre visibile.
3. Refetch completo a ogni (ri)sottoscrizione e quando la pagina torna visibile, più polling di fallback: anche se Realtime non funzionasse, l'admin si aggiorna entro 20 s.
4. Un e2e verifica esplicitamente la comparsa **senza reload**.
5. Prova reale su tablet giovedì, compreso lo standby di 10 minuti.

Al secondo posto c'è la **configurazione di produzione** (env, URL del QR, utente admin, cron attivo). Si mitiga con la checklist del runbook, eseguita giovedì su produzione.

### 8.3 Alternative scartate

| Alternativa | Perché no |
|---|---|
| Rate limit in memoria nella funzione | Su Vercel ogni istanza ha la sua memoria: il limite sarebbe casuale. |
| Redis/Upstash o Vercel KV per il rate limit | Dipendenza e servizio in più. Postgres con advisory lock regge ampiamente 200 invii a sera, e il conteggio sta nella stessa transazione dell'insert. |
| Server Action al posto di `POST /api/questions` | La decisione dice route handler. Inoltre è più semplice da testare in integrazione e da sottoporre al load test con `fetch`. |
| Policy SELECT anon sulle righe `on_air` per `/screen` | Viola "nessuna SELECT anon su `questions`". Al suo posto c'è `screen_state` (spec A3). |
| Realtime Broadcast su canale privato al posto di `postgres_changes` | Più sicuro sul leak delle PK nei DELETE (spec A4), ma ha più parti mobili (trigger, policy su `realtime.messages`) a 48 h dall'evento. Rimandato. |
| `/screen` solo in polling | La decisione è Realtime. Il polling resta come rete di sicurezza. |
| Azioni admin via API server con service role | Allargherebbe l'uso della service role. RLS + RPC con `is_admin()` mantengono il principio del minimo privilegio. |
| Magic link per il login | Dipende dalla consegna delle email al bar e dai rate limit SMTP di Supabase. Email + password è deciso ed è più robusto. |
| CAPTCHA (Turnstile/hCaptcha) | Script di terze parti, attrito sul telefono, e non era nell'intent. |
| Libreria npm per le parolacce | Orientate all'inglese, e sarebbe una dipendenza in più. Una lista italiana curata è più efficace. |
| Edge runtime per la route | `node:crypto` e supabase-js sono più collaudati su Node, e la latenza è irrilevante. |
| CSP stretta con nonce | Con l'App Router richiede rendering dinamico ovunque e ha regressioni possibili. L'XSS è già coperto dall'escaping di React e dall'assenza di HTML dinamico. Ci sono solo gli header di base. |
| Un solo progetto Supabase per preview e produzione | L'e2e e il load test sporcherebbero i dati della serata. Si usano due progetti (staging e produzione). |
| Deploy automatico di `main` in produzione | Contrasta con "la produzione la autorizzo io": `vercel.json` lo disattiva. |
| Limiti di rate scritti nella funzione SQL (come nella prima versione della spec) | Per cambiarli servirebbe una migration durante la serata. Passarli come parametri dal server, con override del tetto per IP da env, è più operabile (vedi §10). |

---

## 9. Rischi

| # | Rischio | Prob. | Impatto | Mitigazione |
|---|---|---|---|---|
| R1 | Realtime admin silenzioso | M | Alto | §8.2 |
| R2 | Il tetto per IP blocca utenti legittimi sul wifi | M | Medio | override da env, messaggio con countdown, runbook |
| R3 | Il filtro parolacce rifiuta frasi innocue | M | Basso | token interi, lista `allow`, test negativi, lista rivista da te |
| R4 | Errore di configurazione in produzione (env, URL QR, admin, cron) | M | Alto | checklist runbook, verifica giovedì, `qr.missingUrl` |
| R5 | Leak della service role o di `submit_log` | B | Molto alto | `server-only`, check del bundle, test RLS, REVIEW sicurezza |
| R6 | Tempi: un giorno e mezzo di lavoro | A | Alto | ordine per percorso critico, tagli in §11 |
| R7 | Docker o OrbStack non disponibile, quindi niente test DB locali | B | Alto | avviare OrbStack subito. In CI `supabase start` è indipendente |
| R8 | Protezione delle preview Vercel blocca e2e e load test | M | Medio | token "Protection Bypass for Automation" passato come header |
| R9 | **Vercel Hobby non ammette uso commerciale** (un evento di un bar lo è, probabilmente) | — | Legale/contrattuale | decisione tua: Hobby o Pro (circa 20 $/mese, disdicibile). Vedi §12 |
| R10 | Supabase free: nessun SLA, progetti in pausa dopo 7 giorni di inattività | B | Medio | non è un problema per venerdì. Verificare il progetto attivo giovedì |

---

## 10. Modifiche alla spec introdotte da questo piano (le applico nello stesso commit)

1. **Limiti come parametri**: `submit_question` riceve i limiti dal server (`src/lib/limits.ts`, unica fonte). Il tetto per IP è sovrascrivibile con `RATE_LIMIT_IP_PER_MINUTE`. Motivo: R2, operabilità durante la serata.
2. **Kill switch** `SUBMISSIONS_OPEN` (default `true`): con `false` la route risponde `503 closed` e il form mostra `form.closed`: "Per stasera le domande sono chiuse. Grazie!". È il modo in cui si concretizza il default B8 della spec.
3. **Hook anticipati a S0** (erano in Fase 5): proteggono `.env*` e le migration già durante il build.
4. **`.env.example` è escluso** dal blocco `.env*` dell'hook: va scritto e aggiornato, e per regola non contiene segreti.
5. **Funzioni aggiuntive** `purge_expired()` e `retention_status()`: rendono testabile la retention e verificabile dal runbook.

Nuove variabili in `.env.example`: `RATE_LIMIT_IP_PER_MINUTE` (opz., default 30), `SUBMISSIONS_OPEN` (opz., default `true`). Solo per i test su preview: `E2E_BASE_URL`, `VERCEL_AUTOMATION_BYPASS_SECRET`.

---

## 11. Tempi e tagli

| Quando | Cosa |
|---|---|
| Mer 21/10 pomeriggio e sera | S0 → S4 (scrittura, DB, admin, schermo) |
| Gio 22/10 mattina | S5 → S8 (QR, retention, test completi, guardrail e CI) |
| Gio 22/10 entro le 14 | S9 preview + e2e e load test su preview, runbook |
| Gio 22/10 pomeriggio | **tu**: deploy in produzione, utente admin, stampa del QR |
| Gio 22/10 sera | prova reale con 3–4 telefoni, tablet, proiettore (checklist) |
| Ven 23/10 | solo hotfix, freeze dalle 18:00 |

Se siamo in ritardo, taglio in quest'ordine, senza toccare build, lint, unit, e2e e test RLS:
1. job `claude-code-action`;
2. WebKit nell'e2e (resta Chromium con viewport iPhone);
3. load test sulla preview (resta quello locale);
4. Wake Lock e cursore nascosto;
5. bozza in `localStorage`.

---

## 12. Azioni che servono da te (non posso farle io: segreti, account, approvazioni)

1. **Avviare OrbStack** (o autorizzarmi a farlo con `open -a OrbStack`).
2. **Supabase**: creare due progetti (`domande-bar-staging`, `domande-bar-prod`, regione UE), oppure autorizzarmi a crearli via MCP. Nel dashboard di entrambi (Authentication → Sign In / Providers): "Allow new users to sign up" **disattivato**, anonymous sign-ins disattivato, ma il provider **Email resta attivo** (serve per il login del gestore). `supabase link` + `supabase db push` su staging li posso lanciare io dopo il tuo `supabase login`. **Su produzione le migration le applichi tu o mi autorizzi esplicitamente.**
3. **Utente admin** (su entrambi i progetti): Auth → Add user (auto-confirm) con la tua password, poi in SQL editor `insert into public.app_admins select id from auth.users where email = '<tua email>';`. Io la password non la vedo mai.
4. **Vercel**: collegare il repo a un progetto e scegliere Hobby o Pro (R9). Impostare le variabili per Preview (staging) e Production (prod): spec §3.7 + §10. `SUBMIT_SALT` diversi per i due ambienti (`openssl rand -hex 32`). Generare il token di Protection Bypass for Automation ed esportarlo nella shell come `VERCEL_AUTOMATION_BYPASS_SECRET`.
5. **GitHub**: secret `ANTHROPIC_API_KEY` per la claude-code-action. OK alla branch protection (la applico io con `gh` in S8).
6. **Nome del bar, logo, dominio** (spec B2), appena li hai.
7. **Push del branch `build/mvp` e PR in draft dopo S0**: l'approvazione di questo piano vale come OK per il push del branch (non di `main`).

---

## 13. Deviazioni dal piano (registro)

| Step | Deviazione | Motivo |
|---|---|---|
| S0 | `cacheComponents` (e `partialPrefetching`) **disattivati** in `next.config.ts`, attivi di default nel template Next 16.4 | Con Cache Components ogni lettura dei cookie (sessione admin) deve stare in `<Suspense>`, pena errore di build, più la validazione "instant navigation". L'app è quasi tutta dinamica o client: il modello classico ha meno trappole. |
| S0 | `@tailwindcss/turbopack` al posto di `@tailwindcss/postcss` | È quello che genera il template di Next 16.4 (loader Turbopack). Nessun `postcss.config.mjs`. |
| S0 | `@types/node@^24` (il template usava `^20`) e `"type": "module"` in `package.json` | vitest 5 richiede `@types/node` ≥ 22, e il runtime è Node 24. Il modulo ESM elimina l'avviso di Vite sulla config. |
| S0 | Porte Supabase locali **553xx** (API 55321, DB 55322) invece di 543xx | Sulla macchina gira già un altro progetto Supabase locale sulle porte di default. In CI non cambia nulla. |
| S0 | Aggiunto `e2e/smoke.spec.ts` | Verifica fin da S0 che la pipeline Playwright (build + start + Chromium/WebKit) funzioni. |
| S0 | L'hook su Bash blocca **qualsiasi** comando che contenga un deploy in produzione, anche dentro `echo` o `grep` | Falso positivo accettato: meglio bloccare troppo che troppo poco. Per testare l'hook si usano payload da file. |
| S1 | Aggiunti `scripts/with-local-env.mjs` (script `dev:local`, `start:local`) e `.claude/launch.json` | Avviano l'app con le chiavi di `supabase status` senza `.env.local`, che l'hook non permette di scrivere. Servono anche per la verifica visiva. |
| S2 | `submit_question` prende due advisory lock (IP, poi dispositivo) invece di uno; `p_nickname` è l'ultimo parametro con default `null` | Il lock per IP impedisce di sforare il tetto per IP con richieste concorrenti da dispositivi diversi. Il default serve perché i tipi generati rendano il nickname facoltativo. |
| S2 | Il cookie `did` è `Secure` in base al protocollo della richiesta, non a `NODE_ENV` | Su `http://localhost` (e2e) WebKit scartava il cookie `Secure` e il cooldown non si vedeva. Su Vercel il protocollo è sempre https. |
| S2 | Aggiunto `e2e/form.spec.ts` (invio reale, cooldown, parolaccia) già in S2 | Prova il percorso di scrittura end-to-end prima di passare all'admin. |
| S3 | `config.toml`: `[auth.email] enable_signup` riportato a `true` | In S0 l'avevo messo a `false`, ma in quella sezione spegne l'intero provider email, login compreso. I signup restano bloccati da `[auth] enable_signup = false`, verificato da un test. **In produzione**: disattivare "Allow new users to sign up", NON il provider Email. |
| S3 | Canale Realtime con `postgres_changes_options: { wait: true }` | Trovato con l'e2e: senza `wait`, `SUBSCRIBED` arrivava prima che lo slot di replica trasmettesse. L'indicatore diceva "Live" ma la prima domanda non arrivava (guasto silenzioso, R1). Con `wait` è passato 3/3 anche dopo un reset a freddo del DB. |
| S3 | Polling di sicurezza ogni **60 s anche quando è "Live"** (20 s se non lo è) | Il piano prevedeva il polling solo a canale giù. Il battito lento limita a un minuto qualsiasi guasto silenzioso futuro di Realtime, al costo di una query al minuto per dispositivo. |
| S3 | Pagine protette nel route group `src/app/admin/(protected)/`; `/admin/login` fuori dal gruppo | Il layout con `getUser()` non deve coprire la pagina di login. Gli URL non cambiano. |
| S3 | "Elimina" spostato nella riga nickname/orario della card | Visto negli screenshot: su telefono e tablet andava a capo su una riga a sé. Così ogni card perde una riga e l'azione distruttiva resta lontana da "Manda in onda". |
| S3 | `e2e/visual.spec.ts` e `e2e/local-db.ts` anticipati da S7 (form e admin) | Servivano per la verifica visiva di S3; S7 aggiungerà `/screen` e `/admin/qr`. |
| S4 | Trigger anche su `TRUNCATE` (oltre a insert/update/delete) e aggiornamento di `screen_state` solo se cambia | Lo svuotamento d'emergenza del runbook usa `truncate` e deve pulire anche lo schermo. Aggiornare solo se cambia evita un evento Realtime a ogni nuova domanda. |
| S4 | Il logo d'angolo di `/screen` si vede solo quando c'è una domanda in onda | Visto negli screenshot: in attesa il logo compariva due volte (angolo e centro). |
| S5 | Client Supabase di `/screen` creato solo negli effetti (non in render) | La build senza env falliva: `/screen` è prerenderizzata e il client veniva creato durante il render. In S8 la CI fa `npm run build` **senza** env Supabase per bloccare la regressione. |
| S8 | Action alle major attuali (checkout/setup-node/upload-artifact v7, supabase/setup-cli v3) e job `review` solo su PR non draft | Le versioni del piano erano generiche. La review automatica su ogni push di una PR draft costerebbe senza servire: parte con `ready_for_review` e sui push successivi. |
| S8 | Branch protection applicata: PR obbligatoria (0 approvazioni), check `checks` richiesto, regole valide anche per gli admin, niente force push e cancellazioni | Verificata con un push diretto su `main`, rifiutato (GH006). |
| S9 | Logo in `public/logo.png` (non SVG), ricostruito dal file del locale: disco nero nuovo e monogramma ricentrato | L'originale era uno screenshot con il disco tagliato dai bordi e non concentrico al monogramma. La spec B2 ammette il PNG. |
| S9 | Un solo progetto Supabase free attivo per volta oltre a quello già esistente: staging va in pausa dopo e2e e load test sulla preview, poi si crea prod | Il piano free ammette 2 progetti attivi per persona su tutte le org. Venerdì gli hotfix si provano in locale. |
| S9 | Protezione Vercel ristretta alle sole preview (`ssoProtection: preview`) | Il default del progetto proteggeva anche l'URL di produzione `*.vercel.app`: dal QR i clienti avrebbero visto il login Vercel. |
| S9 | Job `review` (claude-code-action) **spento**: parte solo con la variabile di repo `ENABLE_CLAUDE_REVIEW=true` | Nessun credito API per `ANTHROPIC_API_KEY` (decisione di Nicola). È il taglio n. 1 di §11. La review secondo `REVIEW.md` la faccio in sessione prima del merge. |
| S9 | Branch `development` (sostituisce `build/mvp`, eliminato) senza deploy; **merge su `main` = deploy automatico in produzione** (`vercel.json`: `deploymentEnabled.development = false` al posto di `main = false`) | Decisione di Nicola. Supera l'alternativa scartata in §8.3: la produzione resta autorizzata da lui, perché il merge su `main` (protetto, PR obbligatoria) lo fa solo lui. La PR #1 è sostituita dalla PR da `development`. |
| S9 | Review secondo `REVIEW.md` fatta in sessione: 1 Important corretto (la risincronizzazione dell'admin prendeva le 500 domande più **vecchie**: oltre 500 righe sparivano le nuove), test `e2e/admin-volume.spec.ts`; 1 nit (annuncio per screen reader spostato in `strings.ts`) | Il job automatico è spento (vedi sopra). |
