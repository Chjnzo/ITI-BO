# STATO — ITI-BO

> Fotografia dell'avanzamento reale: cosa è fatto, cosa è aperto, vulnerabilità note, debito
> tecnico, prossimi passi in ordine. Si aggiorna ad ogni sessione di lavoro rilevante. Se
> un'informazione risponde "a che punto siamo", vive qui — non duplicarla in `OBIETTIVI.md`
> (cosa vogliamo) o `DECISIONI.md` (perché l'abbiamo fatto così).

_Ultimo aggiornamento: 2026-08-20 — adozione "metodo Serplay": fondamenta + dismissione staging cloud._

## Cosa funziona

- 10 route applicative dietro `ProtectedRoute` (Dashboard, Immobili, Leads, Tasks, Agenda,
  Valutazioni) + 1 route pubblica (`/report/:slug`) + auth (login/reset password).
- Schema dati su **11 migration versionate** in `supabase/migrations/` — unico punto di verità
  rispettato, nessuna modifica nota fuori schema.
- RLS attiva e documentata per tabella/operazione/ruolo (vedi `CLAUDE.md` sezione Security).
- RPC `upsert_lead` (SECURITY DEFINER) con hardening: regex email, dedup su email/telefono nelle
  24h, `search_path` fissato.
- 5 Edge Function attive: `generate-evaluation`, `generate-pdf`, `notify-new-lead`,
  `geocode-address`, `find-location-data`.

## Debito tecnico noto

- **Nessun test automatico e nessuna CI** (`.github/workflows` assente) — nessun modo
  automatico di verificare che una modifica non abbia rotto altro.
- **Nessuno script di collaudo RLS per ruolo** — le policy sono scritte e documentate ma non
  ricollaudate sistematicamente ad ogni modifica a schema/permessi.
- **File oltre la soglia di 500 righe** (in ordine di rischio, righe / modifiche negli ultimi
  100 commit):
  - `src/pages/Leads.tsx` — 2201 righe, 37 modifiche → massima concentrazione di rischio.
  - `src/pages/ValuazioneReport.tsx` — 1182 righe.
  - `src/components/valutazioni/ValuationWizard.tsx` — 1160 righe.
  - `src/components/properties/PropertyWizard.tsx` — 931 righe, 16 modifiche.
  - `src/components/agenda/EventFormModal.tsx` — 737 righe, 16 modifiche.
  - `src/pages/Tasks.tsx` — 663 righe.
  - `src/components/agenda/WeeklyPlanningView.tsx` — 557 righe, 13 modifiche.
  - `src/components/properties/ValuationForm.tsx` — 536 righe, **deprecato** (vedi sotto).
- **`src/components/properties/ValuationForm.tsx` deprecato ma non rimosso** — `CLAUDE.md` lo
  segnala esplicitamente come da non usare; sostituito da `ValuationWizard.tsx`. Non rimosso in
  questa sessione (nessuna richiesta esplicita).
- **`src/pages/OpenHouses.tsx` orfano** — esiste nel repo ma non ha una route in `App.tsx`. Non
  toccare senza conferma esplicita (vedi `CLAUDE.md`).
- **Nessun ambiente locale containerizzato** — lo staging cloud che lo precedeva è stato
  dismesso (vedi sezione sotto); nessuno stack riproducibile da zero l'ha ancora sostituito.

## Ambiente di staging — dismesso, sostituzione in corso

Il precedente staging cloud (documentato in `STAGING.md`, rimosso dal repo) usava un secondo
progetto Supabase (`ipgvfyyxtdetysuegioe`) + un progetto Cloudflare Pages (`iti-bo-staging`).

- [x] Riferimenti nel repo rimossi (`STAGING.md`, `.env.staging`, script `dev:staging`).
- [x] Progetto Supabase staging `ipgvfyyxtdetysuegioe` eliminato (confermato dall'utente,
      2026-08-20).
- [x] Progetto Cloudflare Pages `iti-bo-staging` eliminato (confermato dall'utente, 2026-08-20).

**Nessun ambiente di staging/pre-produzione esiste al momento.** Fino a quando lo stack Docker
locale (`docs/riferimento/ambiente_locale.md`, non ancora eseguito) non è operativo, non c'è un
modo per verificare una migration/modifica prima di applicarla in produzione — trattare questo
come un rischio attivo, non solo come debito tecnico.

## Dati sensibili

Dati personali reali di lead/clienti (nome, telefono, email, budget). Nessun dato di minori o
sanitario. RLS restringe lettura/scrittura alle tabelle CRM ad `authenticated`.

## Prossimi passi in ordine

1. Impostare lo stack Supabase locale via Docker (`docs/riferimento/ambiente_locale.md`) —
   priorità alta: oggi non esiste alcun ambiente di verifica pre-produzione.
2. Analisi completa della codebase per pulizia/riorganizzazione (prossima sessione).
3. Introdurre uno script di collaudo RLS per ruolo.
4. CI minima (lint + build) su ogni PR.
5. `docs/RUNBOOK.md` e `docs/DECISIONI.md` (rimandati da questa sessione).
6. Cartella `supabase/migrations-proposte/` per modifiche a schema/RLS scritte da agenti ma non
   ancora validate da un umano.
