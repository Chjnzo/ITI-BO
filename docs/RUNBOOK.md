# RUNBOOK — ITI-BO

> Procedure operative: come si avvia l'ambiente, come si lavora, come si apre una PR, checklist
> pre-PR. Cambia quando si trova un metodo migliore. Se un'informazione risponde "come si fa",
> vive qui — non duplicarla in `OBIETTIVI.md` (cosa vogliamo), `STATO.md` (a che punto siamo) o
> `DECISIONI.md` (perché l'abbiamo fatto così).

## Avviare l'ambiente locale

```bash
supabase start                # scarica/avvia lo stack Docker (~10 container, prima volta lenta)
supabase db reset             # applica tutte le migration + supabase/seed.sql da zero (~30s)
npm run dev                   # Vite, porta 8080 — legge .env.development.local se presente
```

Per fermarlo **senza perdere il volume**: `./scripts/stop-locale.sh` (mai `supabase stop
--no-backup`, che lo distrugge). Dettagli completi, porte, utenti di test e differenze note
locale/produzione: `docs/riferimento/ambiente_locale.md`.

`.env.development.local` (gitignored) punta lo stack locale al posto di produzione solo per
`npm run dev` — cancellarlo per tornare a puntare a produzione in dev.

## Comandi quotidiani

```bash
npm run lint                  # ESLint — deve restare a 0 errori (CI lo verifica)
npm run build                 # build produzione (copia dist/index.html → dist/404.html)
npx tsc --noEmit -p .          # type-check completo, nessuno script npm dedicato: usare direttamente
npm run collaudo:rls          # collaudo RLS di sola lettura contro produzione (sicuro, mai scrive)
```

Non esiste una suite di test automatici (vedi `CLAUDE.md`) — `lint` + `tsc` + collaudo manuale in
browser sono l'unica rete di sicurezza prima di una PR.

## Ciclo di lavoro di una sessione

1. Avvia l'ambiente locale (sezione sopra) se lo tocchi — molte modifiche a UI pura non lo
   richiedono, ma qualunque cosa tocchi Supabase sì.
2. Lavora su un branch dedicato (`<nome>/<cosa-breve>`), **mai push diretto su `main`**.
3. Se la modifica tocca lo schema dati: crea una migration in `supabase/migrations/`, mai una
   modifica manuale da Supabase Studio. Poi `supabase db reset` per verificare che sia
   riproducibile da zero — se fallisce, è un segnale reale, non va aggirato.
4. Se la modifica tocca permessi/RLS: ricollauda tutti i ruoli coinvolti (oggi solo lettura via
   `npm run collaudo:rls`; le asserzioni di scrittura per ruolo restano da fare, vedi
   `STATO.md`), non solo la tabella che stai modificando.
5. Per modifiche UI/frontend: avvia `npm run dev` e verifica a mano nel browser il percorso
   principale (golden path) e almeno un caso limite, prima di dichiarare la modifica completa —
   `tsc`/`lint` verificano la correttezza del codice, non che la funzionalità sia quella attesa.
6. A fine sessione: se qualcosa di rilevante è cambiato, aggiorna `STATO.md` (avanzamento) e,
   se è stata presa una decisione non ovvia, aggiungi una voce a `DECISIONI.md`.
7. Commit in stile Conventional Commits (`feat(...)`, `fix(...)`, `docs(...)`, `security(...)`,
   `chore(...)`), coerenti con la cronologia esistente. Separare commit logicamente distinti
   invece di un commit unico "tuttofare".

## Checklist minima prima di aprire una PR

- [ ] `npm run lint` pulito.
- [ ] `npx tsc --noEmit -p .` pulito.
- [ ] `npm run build` completa senza errori.
- [ ] Se la migration è nuova: `supabase db reset` in locale applica tutto da zero senza errori.
- [ ] Se la modifica tocca RLS/permessi: ricollaudo per ruolo eseguito, non solo letto sulla
      carta.
- [ ] Verifica manuale in browser del percorso principale della funzionalità toccata (vedi nota
      punto 5 sopra) — non ci si affida solo a `tsc`/lint per funzionalità UI.
- [ ] Nessun dato reale (lead/clienti ITI) o segreto (`.env`, chiavi API) nel diff.
- [ ] Ogni modifica a schema/RLS scritta da un agente ma non richiesta esplicitamente è segnalata
      come tale prima del merge, non applicata in autonomia (vedi `CLAUDE.md`).
- [ ] `STATO.md` aggiornato se la PR chiude o apre un punto rilevante della roadmap.

## Migrazioni al database

- Unico punto di verità: `supabase/migrations/`. Mai modifiche a mano da Supabase Studio in
  produzione.
- Nome file: `<timestamp>_<descrizione_breve>.sql` (timestamp `YYYYMMDDHHMMSS`, crescente).
- Verificare sempre con `supabase db reset` in locale prima di considerarla pronta.
- `supabase/migrations-archivio/` contiene migration storiche non più riproducibili in sequenza
  dopo la baseline (vedi `docs/riferimento/ambiente_locale.md`) — non riattivarle, sono lì solo
  per riferimento storico.
- Applicare in produzione con `mcp__plugin_supabase_supabase__apply_migration` (o
  `supabase db push` da CLI) solo con conferma umana esplicita — mai in autonomia da un agente.

## Deploy

- Frontend: build statica (`npm run build`) → hosting configurato separatamente (non
  documentato ancora qui, vedi chi gestisce il dominio ITI se serve). Nessun deploy automatico è
  previsto da questo repository.
- Edge Function (`supabase/functions/*`): `mcp__plugin_supabase_supabase__deploy_edge_function`
  o `supabase functions deploy <nome>`, solo con conferma umana esplicita.
- Nessun push/deploy automatico su servizi condivisi senza che l'utente lo richieda
  esplicitamente in quella sessione — un'autorizzazione data una volta non vale per le sessioni
  successive.

## Dove guardare quando qualcosa non torna

| Sintomo | Prima cosa da controllare |
|---|---|
| Query Supabase fallisce con 403/500 su una colonna che "dovrebbe" esistere | `CLAUDE.md` sezione schema — alcune colonne documentate a parole sono state rimosse in produzione senza una migration nel repo (es. `tasks.tipologia`) |
| Task completate spariscono da sole | `pg_cron` `pulizia-task-bimensile` le cancella il 1° e il 14° del mese — non è un bug, vedi `CLAUDE.md` |
| `supabase db reset` fallisce con errori di oggetto duplicato | Probabile migration incompatibile con la baseline — vedi `docs/riferimento/ambiente_locale.md` §"Cosa ha richiesto il primo avvio" |
| Una tabella non compare/non si aggiorna dove serve nel Kanban immobili | Verificare `src/hooks/useImmobiliPipeline.ts` (fetch unico con join) prima di aggiungere una query separata |
