# Ambiente locale — Supabase via Docker

> Dettaglio tecnico denso richiamato da `docs/STATO.md`. **Eseguito 2026-08-20** — lo stack è
> stato avviato e verificato riproducibile da zero. Questo file ora documenta lo stato reale,
> non solo il piano.

## Come avviarlo

```bash
supabase start   # scarica/avvia i container (~10, la prima volta richiede qualche minuto)
supabase db reset  # ricrea schema (baseline + migration post-baseline) e applica supabase/seed.sql
npm run dev  # legge .env.development.local (priorità Vite più alta di .env.local) → punta allo stack locale
```

Per fermarlo senza perdere il volume: `./scripts/stop-locale.sh` (mai `supabase stop --no-backup`).

`.env.development.local` (gitignored, non committato) contiene `VITE_SUPABASE_URL`/
`VITE_SUPABASE_ANON_KEY` dello stack locale — sovrascrive `.env.local` (che punta a produzione)
solo per `npm run dev`, senza toccarlo. Cancellarlo per tornare a puntare a produzione in dev.

**Utenti di test** (password `locale123` per entrambi, seed in `supabase/seed.sql`):
- `admin@locale.test` — agente con `is_admin = true`
- `agente@locale.test` — agente normale

## Cosa ha richiesto il primo avvio

`supabase db reset` inizialmente falliva: le 11 migration incrementali pre-baseline (datate
2026-04/2026-05) ricreavano oggetti (es. policy RLS) già presenti in
`00000000000000_baseline.sql`, causando errori di duplicato. Confermato quindi che quelle
migration **non sono riproducibili in sequenza dopo la baseline** — spostate in
`supabase/migrations-archivio/` (vedi README lì dentro), non cancellate. Restano attive solo la
baseline e le migration datate 2026-08-20 in poi, che si applicano correttamente sopra di essa.

## Perché

Il precedente staging (progetto Supabase `ipgvfyyxtdetysuegioe` + progetto Cloudflare Pages
`iti-bo-staging`) richiedeva credenziali di un servizio esterno e non era ricostruibile da zero
in locale. Entrambi i progetti sono stati eliminati il 2026-08-20. Il "metodo Serplay" (vedi
`ADOZIONE-METODO-ALTRO-PROGETTO.md` §3) richiede invece un ambiente che chiunque clona il repo
possa avviare senza chiedere accesso a nessun servizio esterno — **oggi non esiste alcun
ambiente di staging/pre-produzione**, quindi questo piano ha priorità alta.

## Proprietà attese dello stack locale

- Gira in container (Docker Desktop / OrbStack / Colima).
- Ricostruibile da zero in pochi minuti con un solo comando che applica migration + seed.
- Porte dedicate/non standard, per convivere con altri stack Supabase sulla stessa macchina.
- Persistente tra uno stop e l'altro (volume Docker), con uno stop "sicuro" che non rischia di
  distruggere il volume per errore.
- Popolato solo da dati di test versionati (mai dati reali di lead/clienti ITI).
- Nessuna credenziale di produzione necessaria per avviarlo.

## Passi previsti (Supabase CLI)

1. **`supabase init`** nella radice del repo — crea `supabase/config.toml` (oggi assente).
2. **Porte dedicate** in `config.toml`: usare un blocco `544xx` (o analogo) invece delle porte
   standard `543xx`, per evitare conflitti con altri progetti Supabase locali sulla stessa
   macchina.
3. **`supabase start`** — scarica/avvia lo stack Docker (~10 container: Postgres, Auth,
   PostgREST, Realtime, Storage, Studio, mailer di test).
4. **`supabase db reset`** — applica le 11 migration esistenti in `supabase/migrations/` da zero
   e un file di seed (da scrivere) con dati fittizi equivalenti a lead/immobili/task reali. Se
   questo comando fallisce, è un segnale reale che le migration non sono riproducibili da zero —
   non va aggirato modificando a mano il database.
5. **Utenti di test per ruolo**: creare utenti Supabase Auth di prova con password nota e uguale
   per tutti (es. `locale123`), uno per ogni ruolo/permesso rilevante nel modello ITI-BO, per
   poter collaudare rapidamente ogni ruolo.
6. **`npm run dev`** puntato alle variabili d'ambiente locali (`VITE_SUPABASE_URL` /
   `VITE_SUPABASE_ANON_KEY` dello stack locale, non più `.env.staging`).

## Script consigliati (da creare quando si esegue il piano)

- `scripts/stop-locale.sh` — esegue `supabase stop` preservando il volume; evita che si possa
  passare per errore il flag distruttivo (`--no-backup`).
- `scripts/db-reset-keep-data.sh` (opzionale) — reset completo per verificare la riproducibilità
  delle migration, salvando/ripristinando i dati inseriti manualmente durante lo sviluppo.
- `scripts/export-seed.sh` (opzionale) — cattura in un file di seed versionato i dati inseriti
  dall'interfaccia durante lo sviluppo.

## Tabelle da popolare quando il piano viene eseguito

- **Utenti di test**: uno per ruolo, password nota, "cosa deve vedere ciascuno".
- **Differenze note locale vs produzione**: es. email che non esce davvero in locale, chiavi
  esterne (OpenAI, Resend) non configurate per design.
- **Problemi frequenti → causa → rimedio**: aggiornata ogni volta che qualcuno perde tempo su un
  problema già visto.

## Stato di questo piano

Non ancora eseguito. Nessun `supabase/config.toml` presente nel repo al momento della stesura di
questo file (2026-08-20). Vedi `docs/STATO.md` per la posizione nella roadmap.
