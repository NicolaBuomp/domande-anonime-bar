# Intent: domande anonime per la serata al bar
Autore: Nicola. Stato: draft. Data evento: venerdì 23/10/2026.

## Problema
Durante la serata il pubblico vuole fare domande al gestore senza esporsi.
A voce o per alzata di mano molte persone non le fanno, e chi le fa non è anonimo.

## Risultato atteso
- Chi è nel locale scansiona un QR code, apre un form da telefono e invia una
  domanda, con un nickname facoltativo. Dopo l'invio vede solo "Grazie".
- Il gestore vede tutte le domande in tempo reale, senza ricaricare la pagina,
  e le legge ad alta voce. Può segnarle come lette o eliminarle.
- Le stesse domande si possono consultare da telefono, da tablet e da una vista
  "schermo grande" proiettata nel locale.

## Utenti e sistemi coinvolti
- Pubblico: 100–200 domande in una sera, da smartphone, senza login.
- Gestore: una sola persona, con accesso protetto.
- Sistemi: frontend leggero su Vercel e Supabase (Postgres, Realtime, Auth, pg_cron).

## Vincoli
- Anonimato: il gestore non deve vedere chi ha scritto. Per l'antispam è ammesso
  un identificativo tecnico (hash salato del dispositivo/IP), che non deve mai
  essere esposto nelle viste del gestore.
- Antispam:
  - limite di caratteri su domanda e nickname;
  - rate limit per dispositivo;
  - filtro sulle parolacce;
  - honeypot.
- Retention: domande e dati tecnici vengono cancellati automaticamente 48 ore
  dopo l'inserimento.
- Brand: logo del bar, fornito come file.
- Si tratta di un evento singolo: nessuna gestione multi-evento o multi-locale.
- Il QR code viene generato dall'app, in una pagina stampabile riservata al gestore.
- Scadenza fissa: deve essere in produzione e provato entro giovedì 22/10 sera.

## Fuori scope
Voto o visualizzazione delle domande da parte del pubblico, evidenziazione e
riordino delle domande, multi-evento, analytics.

## Domande aperte
1. Vista schermo grande: le domande non moderate restano visibili a tutto il
   locale. Default proposto: lo schermo mostra solo la domanda che il gestore
   "manda in onda" in quel momento (un tap da tablet o telefono), che poi viene
   segnata come letta. Alternativa: lista completa delle non lette, con il
   rischio di mostrare contenuti indesiderati.
2. Il filtro parolacce deve rifiutare la domanda o solo segnalarla al gestore?
   Default proposto: rifiuto, con un messaggio neutro.
3. Nome del bar e file del logo, da fornire prima del build.
