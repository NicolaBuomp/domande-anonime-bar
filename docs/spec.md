# Spec: domande anonime per la serata al bar

Stato: **approvata** il 21/10/2026 con tutti i default (A1 compreso). Aggiornata con le modifiche di [`plan.md` §10](plan.md).
Input: [`intent/intent.md`](../intent/intent.md) e le decisioni già prese sullo stack (Next.js App Router + TypeScript su Vercel, Supabase, Tailwind).
Evento: venerdì 23/10/2026. In produzione e provato entro giovedì 22/10 sera.

Per le domande aperte dell'intent valgono i default: (1) lo schermo mostra solo la domanda "in onda"; (2) il filtro parolacce rifiuta con un messaggio neutro; (3) nome e logo del bar sono ancora da fornire (vedi §9).

---

## 1. Attori e glossario

| Termine | Significato |
|---|---|
| Pubblico | Chiunque nel locale. Usa `/` da smartphone, senza login. |
| Gestore | Unico utente Supabase Auth (email + password), creato a mano. Usa `/admin` e `/admin/qr`. |
| Schermo | Browser a tutto schermo collegato al proiettore, su `/screen`. Nessun login. |
| Domanda | Testo di max 300 caratteri, con nickname facoltativo di max 30. |
| In onda | La domanda (al massimo una) che lo schermo sta mostrando. |
| Chiave dispositivo | `sha256` salato che identifica un dispositivo solo ai fini dell'antispam (§3.2, §9 A1). |

"Caratteri" = code point Unicode dopo normalizzazione (§2.2), sia lato client sia lato server sia nel `CHECK` di Postgres (`char_length`).

---

## 2. Requisiti funzionali per rotta

### 2.1 `/`: form pubblico (mobile-first)

- F1. Mostra logo e nome del bar, un titolo e una riga che spiega l'anonimato (testi in §7).
- F2. Campo **Domanda** (textarea, obbligatorio, max 300) con contatore `n/300` sempre visibile; oltre il limite il contatore diventa rosso e il pulsante si disattiva.
- F3. Campo **Nickname** (input, facoltativo, max 30), con l'avviso che sarà visibile se la domanda va sullo schermo.
- F4. Campo honeypot `website`: nascosto alla vista e agli screen reader (`aria-hidden`, `tabindex=-1`, `autocomplete=off`, fuori dallo schermo con CSS, non `display:none`).
- F5. Pulsante **Invia**: disabilitato se la domanda è vuota (dopo il trim) o troppo lunga, oppure mentre l'invio è in corso (con spinner, per evitare doppi invii).
- F6. In caso di successo il form viene sostituito dalla schermata "Grazie" (§7). Non viene mostrato nient'altro sullo stato della domanda. È presente un link "Fai un'altra domanda" che riporta al form vuoto (il rate limit si applica comunque).
- F7. In caso di errore il testo inserito **non si perde**: resta nei campi, il messaggio compare sopra il pulsante in una regione `aria-live`.
- F8. Bozza: il testo della domanda e il nickname vengono salvati in `localStorage` durante la digitazione e cancellati dopo un invio riuscito. Se il wifi cade e la pagina si ricarica, la bozza non va persa.
- F9. La pagina non apre connessioni Realtime e non usa la chiave anon per leggere dati: parla solo con `POST /api/questions`.

### 2.2 `POST /api/questions`: route handler server-side

Unico punto di scrittura delle domande. Usa la service role, che vive solo sul server.

**Request**: `Content-Type: application/json`, body ≤ 2 KB.
```json
{ "text": "string", "nickname": "string | null", "website": "string (honeypot)" }
```

**Pipeline, in quest'ordine:**
0. Raccolta chiusa (`SUBMISSIONS_OPEN=false`) → `503 { "error": "closed" }`.
1. Content-Type o JSON non validi, oppure body troppo grande → `400 { "error": "bad_request" }`.
2. **Honeypot** non vuoto → `201 { "ok": true }` **senza salvare nulla** (successo finto, così il bot non capisce di essere stato scartato). Non conta per il rate limit.
3. **Normalizzazione** di `text` e `nickname`: NFC, rimozione dei caratteri di controllo e zero-width, sostituzione di ogni sequenza di spazi o a capo con uno spazio singolo, trim. Un nickname vuoto diventa `null`.
4. **Validazione**: testo di 1–300 caratteri, nickname di 1–30 oppure `null` → altrimenti `400 { "error": "invalid", "field": "text" | "nickname", "reason": "empty" | "too_long" }`.
5. **Filtro parolacce** su testo e nickname (§2.2.1) → `422 { "error": "rejected" }`. Non conta per il rate limit.
6. **Calcolo delle chiavi** (§3.2): `device_hash` e `ip_hash`.
7. **Rate limit e inserimento atomici**, con un'unica chiamata alla funzione Postgres `submit_question` (§3.4):
   - cooldown: l'ultima domanda accettata dallo stesso `device_hash` risale a meno di 60 s fa → `429 { "error": "cooldown", "retryAfter": <secondi> }` e header `Retry-After`;
   - tetto per sera: 10 domande accettate per `device_hash` nelle ultime 12 ore → `429 { "error": "daily_limit" }`;
   - tetto per IP (§9 A1): 30 domande accettate per `ip_hash` nell'ultimo minuto (sovrascrivibile con `RATE_LIMIT_IP_PER_MINUTE`) → `429 { "error": "busy", "retryAfter": <secondi> }`;
   - altrimenti inserisce la riga in `questions` e quella in `submit_log` nella stessa transazione → `201 { "ok": true }`.
8. Qualsiasi altro errore → `500 { "error": "server" }`. Nei log finiscono solo il codice di errore e lo stack: **mai** testo, nickname, IP, user agent o hash.

La risposta non contiene mai l'id della domanda, gli hash, né informazioni sullo stato.

#### 2.2.1 Filtro parolacce (`src/lib/profanity.ts`)
- Lista di parole e radici italiane (parolacce, insulti, bestemmie, termini d'odio più comuni), versionata nel repo.
- Prima del confronto si applica: minuscolo, rimozione degli accenti, leetspeak (`0→o 1→i 3→e 4→a 5→s 7→t @→a $→s`), compressione delle lettere ripetute (`caaazzo→cazo`, confrontato anche con la forma a doppia), rimozione di punteggiatura e spazi *fra singole lettere* (`c a z z o`, `c.a.z.z.o`).
- Il confronto avviene su token interi o su radici esplicitamente marcate come prefisso, per evitare falsi positivi (es. "Scunthorpe": `figa` non deve colpire "configurazione"). La lista ha una sezione `allow` per le eccezioni note.
- Restituisce solo `boolean`. Il messaggio all'utente è neutro e non dice quale parola ha fatto scattare il filtro.

### 2.3 `/admin/login`: login del gestore

Rotta in più rispetto a quelle elencate: serve per il login (vedi §9 B1).
- Email e password, pulsante "Entra". Signup e reset password non sono esposti.
- Se l'utente è già autenticato → redirect a `/admin`. Dopo il login → redirect alla pagina richiesta in origine (`?next=`, solo percorsi interni che iniziano con `/admin`).
- Errore generico in caso di credenziali sbagliate (§7). Il rate limit sui tentativi è quello nativo di Supabase Auth.

### 2.4 `/admin`: lista domande in tempo reale (telefono e tablet)

Protetta dal middleware: senza sessione valida → redirect a `/admin/login?next=/admin`. In più, i dati sono protetti da RLS (§3.3): il middleware da solo non basta.

- A1. **Header**: logo piccolo, indicatore di connessione (pallino verde "Live", ambra "Riconnessione…", rosso "Offline"), link a "QR" (`/admin/qr`) e "Schermo" (`/screen`, in una nuova scheda), pulsante "Esci".
- A2. **Sezione "In onda"** (fissa in alto, sticky): la domanda attualmente in onda, oppure il placeholder "Niente in onda". Azioni: **Letta** (→ `read`, lo schermo torna in attesa) ed **Elimina**.
- A3. **Sezione "Nuove (n)"**: domande `new`, dalla più vecchia alla più recente (ordine di lettura). Ogni card mostra il testo, il nickname (oppure "Anonimo") e l'orario relativo ("3 min fa"). Azioni: **Manda in onda**, **Letta**, **Elimina**.
- A4. **Sezione "Lette (n)"**: chiusa di default, dalla più recente. Azione: **Elimina**.
- A5. **Tempo reale**: le nuove domande compaiono senza ricaricare la pagina, con un'evidenziazione breve (≤ 2 s, disattivata con `prefers-reduced-motion`). Il titolo della scheda mostra il numero di nuove: `(3) Domande`.
- A6. **Manda in onda**: una sola chiamata atomica (`go_on_air`). La domanda precedentemente in onda diventa `read`, quella scelta diventa `on_air`. Se due dispositivi del gestore la premono quasi in contemporanea, vince l'ultima.
- A7. **Elimina**: conferma in due tempi sullo stesso pulsante ("Elimina" → "Sicuro?" per 3 s), senza dialog modale. L'eliminazione è definitiva. Se la domanda era in onda, lo schermo torna in attesa.
- A8. **Risincronizzazione**: al primo caricamento e a ogni (ri)connessione del canale Realtime, la lista viene ricaricata per intero (max 500 righe, sufficienti per 48 h di dati), così gli eventi persi durante la disconnessione non si perdono. Lo stesso avviene quando la pagina torna visibile (`visibilitychange`).
- A9. **Sessione**: il refresh del token è automatico. Se la sessione non è più valida (refresh fallito, oppure 401 o un errore RLS su un'azione), compare il banner "Sessione scaduta" con il pulsante "Accedi di nuovo", che porta a `/admin/login?next=/admin`. Le azioni non riuscite non vengono riprovate in automatico.
- A10. **Layout**: telefono (≥ 360 px) a una colonna con pulsanti grandi. Tablet (≥ 768 px) con "In onda" e le azioni sempre visibili e la lista a griglia di 2 colonne. Nessuna informazione tecnica sul mittente (hash, IP, user agent): lo schema esposto non le contiene proprio.
- A11. Le azioni sono ottimistiche solo nell'aspetto (pulsante disabilitato e spinner). Lo stato finale arriva dal DB tramite Realtime o dalla risposta della RPC. In caso di errore compare un toast (§7).

### 2.5 `/admin/qr`: QR stampabile

Protetta dal middleware come `/admin`.
- Q1. Su schermo: anteprima del foglio con il pulsante "Stampa" (`window.print()`) e l'URL codificato.
- Q2. Foglio A4 verticale (default, §9 B5): logo, nome del bar, titolo "Fai una domanda anonima", QR grande (≥ 12 cm di lato, correzione d'errore `M`, margine di 4 moduli), URL pubblico in chiaro sotto il QR, una riga "Nessun login, nessun nome. Il gestore non sa chi scrive."
- Q3. L'URL codificato è `NEXT_PUBLIC_SITE_URL` (l'URL di produzione), **mai** quello della richiesta corrente, così un QR stampato da una preview non punta alla preview. Se la variabile manca, la pagina mostra un errore invece del QR.
- Q4. Il QR è un SVG generato con `qrcode` (lato server o client: è indifferente, non contiene segreti), in nero su bianco, senza logo sovrapposto (per la leggibilità).
- Q5. CSS di stampa: header e pulsanti nascosti, `@page { size: A4; margin: 15mm }`, nessuno sfondo colorato.

### 2.6 `/screen`: vista proiettata

Pubblica, nessun login. Legge **solo** la tabella `screen_state` (§3.1), mai `questions`.
- S1. **In onda**: il testo della domanda centrato, con un font enorme che si adatta alla lunghezza (circa 120 px fino a 60 caratteri, scala fino a circa 56 px per 300 caratteri a 1920×1080, senza scroll). Il nickname, se presente, compare sotto in corpo più piccolo ("— Marco"). Logo piccolo in un angolo.
- S2. **In attesa** (niente in onda): logo, nome del bar e l'invito "Hai una domanda? Scansiona il QR sul tavolo" con l'URL in chiaro (QR sullo schermo: vedi §9 B4).
- S3. Il cambio di domanda avviene con una dissolvenza ≤ 300 ms, senza animazioni con `prefers-reduced-motion`.
- S4. **Tempo reale** tramite Realtime su `screen_state`. A ogni (ri)connessione e ogni 30 s fa anche una lettura di sicurezza dello stato (polling di fallback, molto leggero, su una sola riga).
- S5. Se la connessione è assente da più di 10 s compare un indicatore discreto in un angolo ("Riconnessione…"). L'ultima domanda resta visibile.
- S6. Tema scuro ad alto contrasto, cursore nascosto dopo 3 s di inattività. Prova a tenere lo schermo acceso con la Screen Wake Lock API (se non è supportata, va bene comunque).
- S7. Non espone altro: niente lista, niente conteggi, niente id nel DOM.

---

## 3. Dati, sicurezza e job

### 3.1 Schema

```sql
create type question_status as enum ('new', 'on_air', 'read');

create table public.questions (
  id          uuid primary key default gen_random_uuid(),
  text        text not null check (char_length(text) between 1 and 300),
  nickname    text check (nickname is null or char_length(nickname) between 1 and 30),
  status      question_status not null default 'new',
  created_at  timestamptz not null default now(),
  on_air_at   timestamptz,
  read_at     timestamptz
);
create index questions_created_at_idx on public.questions (created_at);
-- al massimo una domanda in onda, garantito dal DB
create unique index questions_one_on_air on public.questions ((true)) where status = 'on_air';

-- dati tecnici antispam: NESSUN riferimento alla domanda
create table public.submit_log (
  id           bigint generated always as identity primary key,
  device_hash  text not null,   -- hex sha256, vedi 3.2
  ip_hash      text not null,   -- hex sha256, vedi 3.2
  created_at   timestamptz not null default date_trunc('second', now())  -- troncato: vedi §9 A2
);
create index submit_log_device_idx on public.submit_log (device_hash, created_at desc);
create index submit_log_ip_idx     on public.submit_log (ip_hash, created_at desc);

-- unica riga letta da /screen
create table public.screen_state (
  id          smallint primary key default 1 check (id = 1),
  text        text,
  nickname    text,
  updated_at  timestamptz not null default now()
);
insert into public.screen_state (id) values (1);

-- allowlist del gestore (difesa in profondità, vedi 3.3)
create table public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
```

- `submit_log` non ha `question_id`: con le sole tabelle non si può risalire a quale dispositivo abbia scritto quale domanda (sul residuo legato ai timestamp vedi §9 A2).
- `screen_state` non contiene l'id della domanda: `/screen` non riceve identificativi.
- `screen_state` viene sincronizzata da un trigger `after insert or update or delete on questions` (security definer). Dopo ogni modifica copia testo e nickname della riga `on_air`, oppure `null` se non ce n'è. In questo modo resta coerente qualunque sia il percorso: RPC, delete del gestore, cron di retention, SQL manuale d'emergenza.

### 3.2 Chiavi antispam (solo server)

```
did         = cookie httpOnly, Secure, SameSite=Lax, 128 bit casuali, durata 2 giorni, impostato dal server al primo POST
ip          = IP del client come fornito da Vercel (header x-real-ip / primo valore di x-forwarded-for)
device_hash = sha256(ip + "|" + user_agent + "|" + did + "|" + SUBMIT_SALT)
ip_hash     = sha256("ip|" + ip + "|" + SUBMIT_SALT)
```
- `SUBMIT_SALT`: almeno 32 byte casuali, variabile d'ambiente solo server, da ruotare dopo l'evento. Senza sale l'IPv4 è enumerabile e l'hash sarebbe reversibile.
- Il `did` è in aggiunta alla formula decisa (`ip + user_agent + SALT`): vedi §9 A1 per il motivo concreto.
- IP, user agent e `did` in chiaro non vengono mai salvati né loggati.

### 3.3 Ruoli, grant e RLS

| Oggetto | `anon` | `authenticated` (solo se `is_admin()`) | `service_role` |
|---|---|---|---|
| `questions` | nessun grant; RLS senza policy → SELECT e INSERT falliscono | SELECT, DELETE tramite policy `using (is_admin())`; nessun INSERT né UPDATE diretto | tutto (bypassa RLS) |
| `submit_log` | nessun grant, nessuna policy | nessun grant, nessuna policy | tutto |
| `screen_state` | SELECT `using (true)` | SELECT `using (true)` | tutto |
| `app_admins` | nessun grant | nessun grant (letta solo da `is_admin()` security definer) | tutto |
| `submit_question()` | `revoke execute` | `revoke execute` | `grant execute` |
| `go_on_air()`, `mark_read()` | `revoke execute` | `grant execute`; dentro: `if not is_admin() then raise` | — |

- RLS è **abilitata su tutte** le tabelle di `public`. In più, `revoke all on questions, submit_log, app_admins from anon, authenticated` e grant mirati come da tabella: si fa affidamento su due barriere, non su una.
- `is_admin()`: `exists (select 1 from app_admins where user_id = auth.uid())`, `security definer`, `stable`, con `search_path` fissato. Serve anche se il signup è disabilitato: se un domani qualcuno attivasse il signup o gli *anonymous sign-ins* di Supabase, i nuovi utenti `authenticated` non vedrebbero comunque nulla.
- Le funzioni `security definer` hanno `set search_path = ''` e nomi pienamente qualificati.
- Nomenclatura delle chiavi Supabase: "anon" = chiave publishable (`NEXT_PUBLIC_…`), "service role" = chiave secret (solo server).

### 3.4 Funzioni Postgres

- `submit_question(p_text, p_nickname, p_device_hash, p_ip_hash, p_cooldown_s, p_max_per_window, p_window_h, p_ip_max_per_min) returns jsonb`: prende `pg_advisory_xact_lock` su `device_hash` (così due richieste concorrenti dello stesso dispositivo non passano entrambe), conta in `submit_log` le righe che servono ai tre limiti di §2.2, e inserisce in `questions` e `submit_log` oppure restituisce `{ "status": "cooldown" | "daily_limit" | "busy", "retry_after": n }`. I limiti arrivano come parametri dal server, che li prende da `src/lib/limits.ts` (unica fonte: 60 s, 10/12 h, 30 per IP al minuto con override da env). Così si possono cambiare durante la serata senza migration.
- `purge_expired() returns jsonb` (cancellazione delle righe con più di 48 h, usata dal cron) e `retention_status()` (stato del job), eseguibili solo da `service_role`.
- `go_on_air(p_id uuid)`: `is_admin()`, poi in transazione `update … set status='read', read_at=now() where status='on_air' and id <> p_id` e `update … set status='on_air', on_air_at=now() where id = p_id and status = 'new'`. Se la domanda non esiste o non è `new` → errore `not_found_or_invalid_state`.
- `mark_read(p_id uuid)`: `is_admin()`, poi `new|on_air → read`.
- Transizioni ammesse: `new→on_air`, `new→read`, `on_air→read`, più l'eliminazione da qualsiasi stato. Nessun ritorno indietro (§9 B3).

### 3.5 Realtime

- Publication `supabase_realtime`: **solo** `questions` e `screen_state`. `submit_log` non va mai nella publication.
- `/admin` si sottoscrive a `postgres_changes` (`*`) su `questions` con la sessione del gestore: RLS filtra INSERT e UPDATE. Gli eventi DELETE arrivano con la sola PK (`replica identity` di default).
- `/screen` si sottoscrive a `postgres_changes` (`UPDATE`) su `screen_state` con la chiave anon.
- Il form pubblico non usa Realtime.

### 3.6 Retention (pg_cron)

```sql
select cron.schedule('retention-48h', '0 * * * *', 'select public.purge_expired()');
-- purge_expired(): delete da questions e submit_log dove created_at < now() - interval '48 hours'
```
Ogni riga viene cancellata fra 48 e 49 ore dopo l'inserimento. `screen_state` si svuota da sola tramite il trigger. L'esito si verifica in `cron.job_run_details` (procedura nel runbook).

### 3.7 Variabili d'ambiente (documentate in `.env.example`)

| Nome | Dove | Note |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | chiave publishable/anon |
| `SUPABASE_SERVICE_ROLE_KEY` | **solo server** | usata solo in `POST /api/questions`; mai importata da file client |
| `SUBMIT_SALT` | **solo server** | ≥ 32 byte casuali |
| `NEXT_PUBLIC_SITE_URL` | client + server | URL di produzione codificato nel QR |
| `RATE_LIMIT_IP_PER_MINUTE` | solo server, facoltativa | default 30 |
| `SUBMISSIONS_OPEN` | solo server, facoltativa | default `true`; `false` chiude la raccolta (503) |

---

## 4. Flussi

**F-A. Invio di una domanda**
1. Il pubblico scansiona il QR e apre `/`, scrive la domanda (la bozza viene salvata in locale) e preme "Invia".
2. Il client valida (lunghezza e campo vuoto) e chiama `POST /api/questions`.
3. Il server segue la pipeline di §2.2 e chiama `submit_question()`, che fa un'INSERT in `questions` e una in `submit_log`.
4. Risposta `201`: il client cancella la bozza e mostra "Grazie".
5. Postgres → Realtime → `/admin` riceve l'INSERT, che compare in "Nuove".

**F-B. Lettura in onda**
1. Il gestore preme "Manda in onda" su una domanda nuova e parte la RPC `go_on_air(id)`.
2. La domanda in onda precedente diventa `read`, quella scelta diventa `on_air`, e il trigger aggiorna `screen_state`.
3. Realtime: `/admin` riceve due UPDATE e sposta le card; `/screen` riceve l'UPDATE di `screen_state` e mostra la domanda.
4. Il gestore la legge ad alta voce e preme "Letta" (`mark_read`): `screen_state` si svuota e `/screen` torna in attesa. In alternativa preme "Manda in onda" sulla successiva.

**F-C. Eliminazione**: "Elimina" → "Sicuro?" → DELETE (RLS `is_admin()`). Il trigger aggiorna `screen_state` se serviva e Realtime notifica il DELETE (PK) ad `/admin`.

**F-D. Login e sessione**: `/admin` senza sessione → middleware → `/admin/login?next=/admin` → `signInWithPassword` → cookie di sessione (`@supabase/ssr`) → redirect. Il token si rinnova da solo. Se il refresh fallisce compare il banner "Sessione scaduta" (A9).

**F-E. Disconnessione**: il canale Realtime cade, l'indicatore diventa ambra o rosso e il client si riconnette da solo. Alla riconnessione si fa un refetch completo (A8, S4).

**F-F. Retention**: ogni ora pg_cron cancella le righe con più di 48 h e il trigger svuota `screen_state` se la domanda in onda è stata cancellata.

---

## 5. Stati vuoti e di errore

| Dove | Situazione | Comportamento |
|---|---|---|
| `/` | domanda vuota | pulsante disabilitato, nessun messaggio aggressivo |
| `/` | oltre 300 / 30 caratteri | contatore rosso, pulsante disabilitato, messaggio `form.tooLong` |
| `/` | 400 `invalid` | messaggio `form.invalid`, campi intatti |
| `/` | 422 `rejected` | `form.rejected`, campi intatti |
| `/` | 429 `cooldown` | `form.cooldown` con i secondi che scalano, pulsante disabilitato fino allo zero |
| `/` | 429 `daily_limit` | `form.dailyLimit`, pulsante disabilitato |
| `/` | 429 `busy` | `form.busy` con countdown |
| `/` | rete assente o timeout (10 s) | `form.offline`, campi intatti, il pulsante resta attivo per riprovare |
| `/` | 500 | `form.serverError` |
| `/` | 503 `closed` | `form.closed`, pulsante disabilitato |
| `/admin` | lista vuota | `admin.emptyAll` |
| `/admin` | nessuna nuova (ma ci sono lette) | `admin.emptyNew` |
| `/admin` | niente in onda | `admin.noOnAir` |
| `/admin` | Realtime disconnesso | indicatore ambra o rosso con `admin.reconnecting` / `admin.offline` |
| `/admin` | azione fallita | toast `admin.actionError` |
| `/admin` | sessione scaduta | banner `admin.sessionExpired` + pulsante |
| `/admin/login` | credenziali errate | `login.error` |
| `/admin/qr` | `NEXT_PUBLIC_SITE_URL` mancante | `qr.missingUrl`, nessun QR |
| `/screen` | niente in onda | stato in attesa (S2) |
| `/screen` | connessione persa > 10 s | indicatore `screen.reconnecting`, l'ultima domanda resta |

---

## 6. Accessibilità di base

- `<html lang="it">`, un `h1` per pagina, landmark (`header`, `main`).
- Ogni campo ha una `<label>` visibile. Contatore ed errori sono collegati con `aria-describedby`. Gli errori compaiono in `role="alert"` / `aria-live="polite"` e il focus va al messaggio dopo un invio fallito.
- Contrasto WCAG AA (≥ 4.5:1 per il testo, ≥ 3:1 per i componenti). Lo schermo usa bianco su nero, ben oltre il AAA.
- Target touch ≥ 44×44 px, spaziatura fra "Letta" ed "Elimina" ≥ 8 px. Focus visibile (`focus-visible`) su tutti i controlli.
- Le azioni non si distinguono solo col colore: icona + testo.
- Rispetto di `prefers-reduced-motion` (evidenziazioni e dissolvenze disattivate).
- Lo zoom del browser resta abilitato. I campi del form hanno font ≥ 16 px, così iOS non zooma in automatico.
- In `/admin` il nuovo contenuto è annunciato con una regione `aria-live="polite"` ("Nuova domanda") che non sposta il focus.

---

## 7. Testi UI (italiano, tono amichevole e breve)

`{bar}` = nome del bar (§9 B2).

| Chiave | Testo |
|---|---|
| `form.title` | Fai una domanda a {bar} |
| `form.subtitle` | È anonima: il gestore non sa chi scrive. |
| `form.questionLabel` | La tua domanda |
| `form.questionPlaceholder` | Scrivi qui… |
| `form.nicknameLabel` | Nickname (facoltativo) |
| `form.nicknameHint` | Se la domanda va sullo schermo, comparirà anche questo. |
| `form.submit` | Invia |
| `form.sending` | Invio… |
| `form.tooLong` | Un po' troppo lunga: accorciala un attimo. |
| `form.invalid` | Controlla la domanda e riprova. |
| `form.rejected` | Questa domanda non può essere inviata. Prova a riformularla. |
| `form.cooldown` | Hai appena inviato una domanda. Puoi riprovare tra {s} secondi. |
| `form.dailyLimit` | Per stasera hai già fatto tante domande. Grazie della partecipazione! |
| `form.busy` | Un attimo di pazienza: riprova tra {s} secondi. |
| `form.offline` | Sembra che la connessione non ci sia. La tua domanda è ancora qui: riprova. |
| `form.serverError` | Qualcosa è andato storto. Riprova tra poco. |
| `form.closed` | Per stasera le domande sono chiuse. Grazie! |
| `form.privacy` | Non salviamo chi sei. Per evitare lo spam teniamo un codice tecnico anonimo, cancellato dopo 48 ore insieme alle domande. |
| `thanks.title` | Grazie! |
| `thanks.body` | La tua domanda è arrivata al bancone. |
| `thanks.again` | Fai un'altra domanda |
| `login.title` | Area gestore |
| `login.email` | Email |
| `login.password` | Password |
| `login.submit` | Entra |
| `login.error` | Email o password non corretti. |
| `admin.title` | Domande |
| `admin.live` | Live |
| `admin.reconnecting` | Riconnessione… |
| `admin.offline` | Offline: le nuove domande arriveranno appena torna la rete. |
| `admin.onAir` | In onda |
| `admin.noOnAir` | Niente in onda. |
| `admin.new` | Nuove |
| `admin.read` | Lette |
| `admin.anonymous` | Anonimo |
| `admin.goOnAir` | Manda in onda |
| `admin.markRead` | Letta |
| `admin.delete` | Elimina |
| `admin.confirmDelete` | Sicuro? |
| `admin.emptyAll` | Ancora nessuna domanda. Arriveranno qui da sole. |
| `admin.emptyNew` | Hai letto tutto. |
| `admin.actionError` | Non ci sono riuscito, riprova. |
| `admin.sessionExpired` | Sessione scaduta. |
| `admin.loginAgain` | Accedi di nuovo |
| `admin.logout` | Esci |
| `admin.linkQr` | QR |
| `admin.linkScreen` | Schermo |
| `qr.title` | Fai una domanda anonima |
| `qr.subtitle` | Nessun login, nessun nome. Il gestore non sa chi scrive. |
| `qr.print` | Stampa |
| `qr.missingUrl` | Manca l'URL pubblico (NEXT_PUBLIC_SITE_URL): il QR non può essere generato. |
| `screen.idleTitle` | Hai una domanda? |
| `screen.idleBody` | Scansiona il QR sul tavolo. È anonima. |
| `screen.reconnecting` | Riconnessione… |

---

## 8. Requisiti non funzionali

- Carico: 100–200 domande a sera. Picchi stimati < 1 invio/s. Obiettivo di test: 200 invii da 50 dispositivi simulati in 2 minuti, **nessun 5xx** (sono attesi 429 per il cooldown: vedi §9 A5).
- Latenza fra invio e comparsa in `/admin` inferiore a 2 s in condizioni normali.
- Browser: Safari iOS ≥ 16, Chrome Android ≥ 110, Chrome/Edge/Safari desktop recenti per `/screen`.
- Il form pesa poco (nessuna libreria UI, JS minimo) per funzionare anche con il 4G scarso del locale.
- Nessun analytics e nessuno script di terze parti.
- Il testo delle domande è sempre reso come testo (escaping di React). Niente `dangerouslySetInnerHTML`, niente link automatici, niente markdown.

---

## 9. Aree di attenzione

### A. Conflitti fra vincoli

**A1. Antispam per dispositivo vs wifi condiviso del locale. ⚠️ Serve una tua decisione.**
La formula decisa `sha256(ip + user_agent + SALT)` sul wifi del bar collassa molte persone sulla stessa chiave. Dietro il NAT tutti hanno lo stesso IP pubblico, e Safari su iOS ha un user agent congelato, quasi identico fra iPhone diversi. Risultato: gli iPhone sul wifi del locale condividerebbero **un solo** cooldown di 60 s e **un solo** tetto di 10 domande per sera. È un blocco reale proprio nello scenario principale.
Proposta (già scritta così in §2.2 e §3.2):
- aggiungere alla formula un cookie tecnico casuale `did` (httpOnly, impostato dal server): `sha256(ip|ua|did|SALT)`. Così ogni telefono ha la sua chiave;
- siccome il cookie si azzera con una finestra in incognito, aggiungere un tetto per IP (`ip_hash`, 30 invii al minuto), largo abbastanza per tutto il locale e stretto abbastanza da fermare uno script.
Alternativa: tenere la formula originale e accettare il problema. La sconsiglio.

**A2. Anonimato vs antispam: correlazione per timestamp.**
`submit_log` non ha `question_id`, ma `questions.created_at` e `submit_log.created_at` coincidono al millisecondo. Chi ha accesso al DB (dashboard Supabase o service role, non le viste admin) potrebbe raggruppare le domande per dispositivo. Le viste admin non lo permettono.
Proposta: troncare `submit_log.created_at` al secondo (basta per il cooldown) e accettare il rischio residuo, che vale solo per chi ha accesso al DB, entro le 48 h. In più, il testo `form.privacy` dice "il gestore non sa chi scrive", non "è impossibile risalire": è onesto.
Default se non dici nulla: troncamento al secondo e rischio accettato.

**A3. "SELECT anon vietata su `questions`" vs `/screen` pubblica e in tempo reale.**
`/screen` non ha login, quindi usa la chiave anon. Per ricevere Realtime da `questions` servirebbe una policy SELECT anon, che è vietata.
Soluzione (già in spec): la tabella `screen_state` a riga singola, mantenuta da un trigger, leggibile da anon e senza id. `/screen` non tocca mai `questions`. È coerente con le decisioni: aggiunge una tabella, non cambia le regole.

**A4. Realtime DELETE e RLS.**
Gli eventi DELETE di `postgres_changes` non vengono filtrati da RLS. Un client anon che si sottoscrivesse a `questions` riceverebbe la **sola PK** delle righe cancellate: niente testo, niente nickname. È un leak trascurabile (un uuid e l'istante della cancellazione).
Alternativa: Realtime Broadcast da trigger, su un canale privato con policy su `realtime.messages`. È più sicura ma ha più parti mobili a 48 ore dall'evento.
Default: `postgres_changes` e rischio accettato, documentato in REVIEW.md.

**A5. Load test vs rate limit.**
"200 invii da 50 dispositivi in 2 minuti" significa 4 invii per dispositivo in 120 s, ma il cooldown ne permette 2. Inoltre da una sola macchina l'IP è uno solo, quindi scatta anche il tetto per IP.
Interpretazione: il load test verifica **nessun 5xx** e risposte coerenti (201 o 429, mai doppi inserimenti oltre i limiti), non 200 inserimenti.
Default: questa. Se invece vuoi provare 200 inserimenti reali, il test deve girare con limiti alzati da una variabile solo-test. La sconsiglio, perché prova una configurazione diversa da quella di produzione.

**A6. "Dopo l'invio vede solo Grazie" vs errori di antispam.**
Il rifiuto per parolacce, cooldown e limite giornaliero deve per forza mostrare un messaggio diverso da "Grazie" (decisione: messaggio neutro). Fa eccezione solo l'honeypot, che risponde con un finto successo.
Default: come in §2.2 e §5.

**A7. Retention 48 h vs copie dei dati fuori dal nostro controllo.**
- pg_cron cancella fra 48 e 49 ore.
- I backup giornalieri di Supabase (in base al piano) e i log di piattaforma (Vercel request log con IP, per il loro periodo di retention) non sono coperti dal job.
- Il nostro codice non logga IP, user agent, testo o hash.

Da sapere. Il titolare del trattamento è il bar e questo non è un parere legale. Default: lo documento nel runbook, senza azioni ulteriori.

**A8. Filtro parolacce: efficacia vs falsi positivi.**
Una lista per parole, anche normalizzata, non ferma gli insulti "puliti" e qualche variante creativa, e può rifiutare frasi innocue.
La mitigazione vera è il default (1): sullo schermo va solo ciò che il gestore sceglie. Default: lista conservativa, rivedibile da te prima di giovedì.

### B. Ambiguità dell'intent (default proposti)

**B1. Rotta di login.** Non è nell'elenco delle rotte, ma serve. Default: `/admin/login`, esclusa dal middleware.

**B2. Nome del bar, file del logo, URL pubblico. ⚠️ Serve un tuo input prima del build.**
- Nome e logo (SVG o PNG ad alta risoluzione, idealmente anche in versione chiara per lo schermo scuro).
- Dominio: va bene il `*.vercel.app` di produzione o c'è un dominio custom? Il QR si stampa giovedì e deve puntare all'URL **definitivo**.

Default se mancano: placeholder "Il Bar" e logo testuale, sostituibili con un file (`public/logo.svg`) e una costante (`src/config/site.ts`).

**B3. Errori del gestore.** Se si preme "Letta" o "Manda in onda" per sbaglio, con gli stati lineari non si torna indietro. Default: nessun "annulla" (stati come da decisione). Una domanda letta resta comunque visibile nella sezione "Lette".

**B4. Schermo in attesa: QR sì o no?** Mostrare il QR sul proiettore quando niente è in onda aiuterebbe la partecipazione, ma va oltre "mostra solo la domanda in onda". Default: **no**, solo l'invito testuale e l'URL. Dimmi se lo vuoi.

**B5. Formato di stampa del QR.** Default: un A4 verticale. Alternativa: 4 cartoncini A6 per pagina da mettere sui tavoli.

**B6. Nickname sullo schermo.** Default: sì, se presente, perché l'ha scelto chi scrive ed è avvisato da `form.nicknameHint`. Anche il nickname passa dal filtro parolacce.

**B7. Cosa vuol dire "a sera" per il tetto di 10.** Default: finestra mobile di 12 ore.

**B8. Chiusura della raccolta.** Dopo la serata il form resta aperto (fino a 48 h la retention lo ripulisce). Non c'è un interruttore "domande chiuse" in UI perché non è nell'intent. Esiste però un kill switch da env (`SUBMISSIONS_OPEN=false` + redeploy), descritto nel runbook.

**B9. Svuotamento d'emergenza.** Nessun pulsante "svuota tutto" in UI (rischio di tap accidentale da telefono). Default: per togliere qualcosa dallo schermo bastano "Letta" o "Elimina". Lo svuotamento totale si fa con SQL dal dashboard Supabase, descritto nel runbook.

---

## 10. Decisioni che mi servono

1. **A1**: aggiungo il cookie `did` alla chiave dispositivo e il tetto per IP? (Consigliato: sì.)
2. **B2**: nome del bar, file del logo, dominio di produzione.
3. **B4**: QR sullo schermo quando è in attesa? (Default: no.)
4. **B5**: formato di stampa del QR? (Default: A4 singolo.)

Tutto il resto procede con i default indicati, salvo tue correzioni.
