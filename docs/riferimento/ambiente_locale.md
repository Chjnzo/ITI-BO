# Ambiente locale — piano di adozione Supabase via Docker

> Dettaglio tecnico denso richiamato da `docs/STATO.md`. Questo file descrive il piano per
> sostituire l'ex staging cloud (secondo progetto Supabase + Cloudflare Pages, rimosso dal repo)
> con uno stack Supabase locale containerizzato. **I comandi qui sotto non sono ancora stati
> eseguiti** — richiedono Docker Desktop/OrbStack attivo sulla macchina e vanno lanciati in una
> sessione dedicata, con conferma esplicita prima di ogni comando che scrive su un progetto reale.

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
