# Review: come si rivede una PR

Vale per le review umane e per quella automatica (claude-code-action in CI).
Contesto: app usata **una sera sola** (ven 23/10/2026) da 100–200 persone. Conta più che funzioni e che non esponga dati di quanto sia elegante.

Fonti di verità: [`docs/spec.md`](docs/spec.md) (cosa), [`docs/plan.md`](docs/plan.md) (come), [`CLAUDE.md`](CLAUDE.md) (regole).

## Classificazione

- **Important**: qualsiasi cosa che possa
  1. esporre dati (testo/nickname a chi non è il gestore, `submit_log`, hash, IP, user agent, service role, sale);
  2. rompere la serata (invio che fallisce, admin che non si aggiorna, schermo che mostra la cosa sbagliata, login impossibile);
  3. violare spec o piano senza che `docs/plan.md` §13 lo registri;
  4. lasciare un test rosso, o "aggiustare" un test indebolendo l'asserzione invece di correggere il codice.

  Ogni Important va risolto prima del merge.
- **Nit**: stile, naming, micro-refactor, commenti, piccole duplicazioni. **Massimo 5 nit per review**, i più utili. Un nit non blocca il merge.

Se un punto è dubbio, è Important finché non si dimostra il contrario. Ogni segnalazione indica file e riga, lo scenario concreto (input/stato → effetto) e la correzione proposta.

## Passata 1: Bug

- Il percorso critico regge? form → `POST /api/questions` → `submit_question` → Realtime admin → `go_on_air` → `screen_state` → `/screen`.
- Stati: solo `new→on_air`, `new→read`, `on_air→read`, più l'eliminazione. Mai due `on_air` (indice unico + lock).
- Concorrenza: due invii dallo stesso dispositivo, due tap "Manda in onda" da due dispositivi.
- Errori di rete e sessione: il form non perde il testo; l'admin mostra "Sessione scaduta" e non riprova da solo; lo schermo tiene l'ultima domanda.
- Realtime: canali con `postgres_changes_options: { wait: true }`, refetch a ogni `SUBSCRIBED`, polling di sicurezza attivo. Un evento perso non deve restare perso più di 60 s.
- Build senza env (`/screen` è prerenderizzata): nessun client Supabase creato durante il render.
- Testi UI: solo in `src/lib/strings.ts`, in italiano.

## Passata 2: Sicurezza

**RLS e grant**
- Ogni nuova tabella in `public` ha RLS attiva **e** `revoke all … from anon, authenticated`, con grant mirati.
- `questions`: nessuna SELECT/INSERT/UPDATE/DELETE per `anon`; per `authenticated` solo SELECT e DELETE con `is_admin()`; transizioni solo via funzioni `security definer` che controllano `is_admin()`.
- Funzioni `security definer`: `set search_path = ''`, nomi qualificati, `revoke execute … from public, anon` (e `authenticated` dove serve).
- Un test RLS copre ogni nuova tabella/funzione, con righe vere nel DB (un `[]` non deve passare per un blocco).

**Service role**
- Solo in `src/lib/supabase/service.ts` (`import "server-only"`), usata solo da `POST /api/questions`. Mai `NEXT_PUBLIC_`, mai in un Client Component.
- `npm run check:bundle` deve restare verde.

**Leak di `submit_log`**
- Mai in Realtime (publication), mai selezionata da viste admin, mai nelle risposte della route, mai nei log.
- Nessun riferimento a `questions` (niente `question_id`); `created_at` troncato al secondo.
- La route risponde solo `{ ok }` o `{ error, … }`: niente id, hash, stato.

**XSS sul testo delle domande**
- Testo e nickname resi solo come testo React. Vietati `dangerouslySetInnerHTML`, markdown, link automatici, `innerHTML`.
- Unica eccezione ammessa: il QR come data URI in `<img>` (generato dal server da `NEXT_PUBLIC_SITE_URL`).

**Rate limit aggirabile**
- IP letto solo da `x-real-ip` / `x-forwarded-for` (affidabili **solo** dietro Vercel, che li sovrascrive: su altri host sarebbero falsificabili).
- Cookie `did` cancellato o user agent ruotato → nuova chiave dispositivo: lo ferma il tetto per IP (`ip_hash`). Verificare che resti.
- Honeypot e parolacce non devono consumare il rate limit; un `did` non UUID va sostituito.
- Rischio accettato (spec A4): gli eventi Realtime DELETE su `questions` espongono la sola PK a un eventuale iscritto anon.

**Altro**
- `next` del login accettato solo sotto `/admin` (niente open redirect).
- Nessun segreto nel repo; `.env*` non toccati (tranne `.env.example`).

## Passata 3: Compliance

- Il cambiamento corrisponde a `docs/spec.md` (requisiti per rotta, testi §7, stati vuoti/errore §5, accessibilità §6)?
- Segue l'ordine e le scelte di `docs/plan.md`? Ogni deviazione è in §13 **nello stesso commit**?
- Le migration già committate non sono state modificate (solo migration nuove).
- Nuove dipendenze motivate nel piano.
- Accessibilità di base: label visibili, `aria-live` per gli errori, target ≥ 44 px, contrasto AA, `prefers-reduced-motion`.
- Definition of done: build, lint, unit, integrazione/RLS ed e2e verdi, output nella PR.

## Formato dell'output

```
## Important
1. [Sicurezza] src/app/…:42. Scenario → effetto. Correzione proposta.

## Nit (max 5)
1. …

## Esito
Approvabile / Da correggere (N Important)
```
