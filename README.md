# domande-anonime-bar

Domande anonime per la serata al bar: il pubblico scrive da telefono (QR), il gestore vede tutto in tempo reale e manda "in onda" una domanda alla volta sul proiettore.

- Cosa: [docs/spec.md](docs/spec.md)
- Come e in che ordine: [docs/plan.md](docs/plan.md)
- Comandi e regole per chi ci lavora: [CLAUDE.md](CLAUDE.md)

Avvio locale: `supabase start`, poi `npm run dev`. Il dev server usa sempre il database locale (chiavi lette da `supabase status`, che hanno la precedenza su `.env.local`): non tocca mai il progetto remoto.
