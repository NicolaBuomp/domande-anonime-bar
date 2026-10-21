# Runbook: serata domande anonime (ven 23/10/2026)

Per Nicola (gestore e responsabile del rilascio). Tutti i comandi SQL si lanciano nel **SQL Editor del progetto Supabase di produzione** (`domande-bar-prod`), salvo dove indicato.

Indirizzi:
- Form pubblico: `https://domande-anonime-bar.vercel.app` (= `NEXT_PUBLIC_SITE_URL`)
- Admin: `https://domande-anonime-bar.vercel.app/admin` · QR: `https://domande-anonime-bar.vercel.app/admin/qr` · Schermo: `https://domande-anonime-bar.vercel.app/screen`
- Preview della PR (protetta): `https://domande-anonime-bar-git-build-mvp-nicolabuomps-projects.vercel.app`
- Supabase prod: `https://supabase.com/dashboard/project/<ref di domande-bar-prod>` (si crea dopo la pausa di staging, §0.1)
- Supabase staging: `https://supabase.com/dashboard/project/gbkkewqazxftrvrspngx` (in pausa dopo i test)
- Vercel: `https://vercel.com/nicolabuomps-projects/domande-anonime-bar`
- Password dei DB, token di bypass e gestore di test: nel Portachiavi (`domande-bar-*`)

---

## 0. Preparazione dell'infrastruttura (una volta, entro giovedì mattina)

1. **Supabase**: due progetti nella regione UE (`eu-central-1`), `domande-bar-staging` e `domande-bar-prod`, in NicolaBuomp's Org. Il piano free ammette 2 progetti attivi per persona e lafossa-events-management ne occupa uno: staging si mette **in pausa** dopo e2e e load test sulla preview, poi si crea prod. Su entrambi:
   - Authentication → Sign In / Providers: **"Allow new users to sign up" disattivato**, anonymous sign-ins disattivato, provider **Email attivo** (serve al login del gestore);
   - Authentication → URL Configuration: Site URL = URL pubblico dell'ambiente.
2. **Migration**: `supabase link --project-ref <ref>` e poi `supabase db push`, prima su staging, poi su prod. Controllo: `select public.retention_status();` mostra `"schedule": "0 * * * *", "active": true`.
3. **Gestore**: Authentication → Users → Add user (email + password tua, "Auto confirm"), poi:
   ```sql
   insert into public.app_admins select id from auth.users where email = 'TUA_EMAIL';
   ```
   Su staging crea anche un gestore **di test** (email/password solo per gli e2e sulla preview).
4. **Vercel**: progetto collegato al repo. Variabili d'ambiente (vedi `.env.example`):
   - **Preview** → progetto staging; **Production** → progetto prod;
   - `SUBMIT_SALT` diverso nei due ambienti (`openssl rand -hex 32`);
   - `NEXT_PUBLIC_SITE_URL` = URL **di produzione** in entrambi (è quello che finisce nel QR).
   - `vercel.json` disattiva il deploy automatico di `main`: la produzione parte solo per tua scelta.
5. **E2E sulla preview**, dalla PR:
   ```bash
   E2E_BASE_URL=https://<preview>.vercel.app E2E_ADMIN_EMAIL=… E2E_ADMIN_PASSWORD=… VERCEL_AUTOMATION_BYPASS_SECRET=… npm run e2e
   ```
   ```bash
   VERCEL_AUTOMATION_BYPASS_SECRET=… npm run loadtest -- --url https://<preview>.vercel.app
   ```
   Contro la preview il load test parte da un solo IP: molti `429 busy` sono **attesi**. Conta solo che ci sia "nessun 5xx".
6. **Produzione** (solo dopo l'e2e verde sulla preview): merge della PR su `main` e poi, dal tuo terminale su `main` aggiornato, `vercel --prod`. In alternativa usa "Promote to Production" dal dashboard, ma subito dopo fai i controlli del punto 7.
7. **Controlli in produzione** (le variabili `NEXT_PUBLIC_` sono fissate al momento della build):
   - `/admin/qr` mostra in alto "URL nel QR:" con l'URL di **produzione**;
   - una domanda di prova dal telefono compare in `/admin` (quindi punta al DB di prod), poi la elimini.

---

## 1. Checklist di giovedì 22/10 sera (prova generale)

- [ ] **Telefoni**: 3–4 telefoni diversi (almeno un iPhone e un Android), sul **wifi del locale** e anche in 4G:
  - [ ] scansionano il QR **stampato** e aprono il form;
  - [ ] inviano una domanda → "Grazie!";
  - [ ] secondo invio subito dopo → "Hai appena inviato una domanda…" con i secondi che scalano;
  - [ ] una parolaccia → "Questa domanda non può essere inviata…".
- [ ] **Login admin** su telefono **e** tablet; password salvata nel password manager di entrambi.
- [ ] Le domande compaiono in `/admin` **senza ricaricare**, su tutti e due i dispositivi; il pallino è verde "Live".
- [ ] **Proiettore**: laptop collegato, browser a tutto schermo (F11 / ⌃⌘F) su `/screen`, che mostra "Hai una domanda?".
- [ ] Da tablet: "Manda in onda" → compare sul proiettore in 1–2 secondi; "Letta" → torna "Hai una domanda?".
- [ ] Tablet in standby per 10 minuti, poi riattivato: la lista si aggiorna da sola (se compare "Sessione scaduta" → "Accedi di nuovo").
- [ ] Laptop del proiettore: standby e salvaschermo **disattivati**, alimentatore collegato, notifiche silenziate.
- [ ] **Stampa del QR**: da `/admin/qr` in produzione, pulsante "Stampa", A4, scala 100%. Scansionalo dal foglio con 2 telefoni prima di fotocopiarlo.
- [ ] Pulizia dopo la prova: elimina le domande di prova da `/admin` (oppure §4.3 se sono tante).

## 2. Checklist di venerdì 23/10 (30 minuti prima)

- [ ] Login di nuovo su telefono e tablet (sessione fresca); pallino verde "Live".
- [ ] `/screen` aperto sul proiettore, "Hai una domanda?" visibile.
- [ ] Hotspot di riserva acceso e testato (vedi §3).
- [ ] Caricatori: tablet, telefono del gestore, laptop.
- [ ] QR sui tavoli e vicino al bancone.
- [ ] Domanda di prova da un telefono → compare → "Elimina".

---

## 3. Se cade il wifi del locale

- **Pubblico**: l'app è su internet, non sulla rete del locale. Chi è in 4G/5G non si accorge di niente. Chi è sul wifi vede "Sembra che la connessione non ci sia. La tua domanda è ancora qui: riprova." e il testo resta salvato. Annuncio: *"Se non vi va, staccate il wifi e usate i dati."*
- **Admin (tablet/telefono)**: il pallino diventa ambra "Riconnessione…" o rosso "Offline". Passa all'**hotspot del telefono** (o router 4G). Quando torna la rete la lista si ricarica da sola, senza perdere niente.
- **Proiettore**: tiene l'ultima domanda; dopo 10 s compare "Riconnessione…" in basso a destra. Collega il laptop all'hotspot. Se serve, ricarica la pagina (⌘R / F5).
- **Consiglio**: admin e proiettore **sempre sull'hotspot**, non sul wifi dei clienti, dall'inizio della serata.

## 4. Emergenze

### 4.1 Qualcosa di sbagliato sul proiettore
Da `/admin`: **"Letta"** o **"Elimina" → "Sicuro?"** sulla domanda in onda. Lo schermo torna in attesa in 1–2 secondi.
Se l'admin non risponde: chiudi la scheda del proiettore o spegni l'ingresso del proiettore. Per svuotare lo schermo dal DB:
```sql
update public.questions set status = 'read', read_at = now() where status = 'on_air';
```

### 4.2 Spam o troppe domande dallo stesso wifi
- Qualcuno vede "Un attimo di pazienza: riprova tra N secondi" troppo spesso (tetto di 30 invii/minuto per IP del locale): in Vercel → Settings → Environment Variables (Production) imposta `RATE_LIMIT_IP_PER_MINUTE=60` e fai **Redeploy** (~1 minuto).
- **Chiudere la raccolta**: `SUBMISSIONS_OPEN=false` + Redeploy. Il form risponde "Per stasera le domande sono chiuse. Grazie!". Per riaprire: togli la variabile e fai Redeploy.

### 4.3 Svuotare tutto
Cancella **definitivamente** tutte le domande e i dati tecnici. Il trigger svuota anche lo schermo.
```sql
truncate public.questions, public.submit_log;
select * from public.screen_state;   -- text e nickname devono essere NULL
```

### 4.4 "Sessione scaduta" sull'admin
Tocca "Accedi di nuovo" e rientra. Le domande non si perdono: sono nel DB e la lista si ricarica.

### 4.5 L'app non risponde (Vercel o Supabase giù)
Controlla `https://www.vercel-status.com` e `https://status.supabase.com`. Ripiego: domande a voce e foglietti sui tavoli. Le domande già arrivate restano nel DB; per vederle senza app:
```sql
select created_at, nickname, text, status from public.questions order by created_at;
```

---

## 5. Verificare la cancellazione automatica dopo 48 ore

Il job gira ogni ora al minuto 0 e cancella ciò che ha più di 48 ore: ogni riga sparisce **tra 48 e 49 ore** dopo l'invio. Per una serata finita a mezzanotte, controlla **domenica 25/10 dopo l'1:00** (meglio lunedì mattina).

```sql
select public.retention_status();
```
Esito sano:
- `job.active = true`, `job.schedule = "0 * * * *"`;
- `last_run.status = "succeeded"` con `start_time` nell'ultima ora;
- `expired_rows.questions = 0` e `expired_rows.submit_log = 0`.

Controlli aggiuntivi:
```sql
select count(*) from public.questions;   -- 0 se sono passate 48 h dall'ultima domanda
select count(*) from public.submit_log;  -- idem
select status, return_message, start_time
  from cron.job_run_details order by start_time desc limit 5;
```
Se `last_run.status` è `failed` o il job non c'è: lancia a mano `select public.purge_expired();` e poi riapplica la migration `retention` (`supabase db push`).

---

## 6. Dopo l'evento

- [ ] **Ruota `SUBMIT_SALT`** in Production (nuovo `openssl rand -hex 32` + Redeploy), oppure metti in pausa il progetto se non serve più.
- [ ] Se non ci sono altre serate: `SUBMISSIONS_OPEN=false` + Redeploy.
- [ ] Da sapere (spec A7): i **backup** giornalieri di Supabase e i **log** di Vercel (che possono contenere l'IP delle richieste) hanno una retention propria, non coperta dal job delle 48 ore. Il nostro codice non logga mai IP, user agent, testi o hash. Il titolare del trattamento è il bar.
