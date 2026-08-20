# OBIETTIVI — ITI-BO

> Cos'è il progetto, per chi, il mandato, i vincoli non negoziabili, la roadmap a fasi (solo la
> *definizione* delle fasi, non lo stato — per quello vedi `STATO.md`). Cambia solo se cambia
> l'obiettivo del progetto. Non duplicare qui informazioni che vivono in `STATO.md` (avanzamento),
> `DECISIONI.md` (perché) o `RUNBOOK.md` (come si fa) — richiamale con un link.

## Cos'è

ITI-BO è il CRM/Back Office per **ITI (Il Tuo Immobiliare)**, agenzia immobiliare di Bergamo.
Gestisce lead, immobili, appuntamenti/task e valutazioni immobiliari assistite da AI. Include
anche un report pubblico condivisibile (`/report/:slug`) generato dalle valutazioni.

## Per chi

Gli agenti immobiliari di ITI, che lo usano ogni giorno per gestire il ciclo di vita di un
contatto (lead → appuntamento → trattativa → chiuso/perso) e il portafoglio immobili.

## Mandato

Sostituire la gestione manuale/sparsa di lead e immobili con un unico strumento interno,
collegato al sito pubblico ITI2.0 tramite l'RPC `upsert_lead` per l'acquisizione automatica dei
contatti dal form di contatto.

## Vincoli non negoziabili

Adattati dalle policy trasversali del "metodo Serplay" alla realtà di questo progetto:

1. **Zero dati reali in locale o in ambienti di prova.** I dati di lead/clienti (nome, telefono,
   email, budget) sono dati personali: nei seed di test si usano sempre dati fittizi equivalenti,
   mai un estratto di produzione.
2. **Un solo punto di verità per lo schema dati.** Tutte le modifiche passano da migration
   versionate in `supabase/migrations/` — mai una modifica manuale dal dashboard Supabase.
   *Già rispettato oggi*: 11 migration versionate, nessuna modifica fuori schema nota.
3. **Mai push diretto sul branch `main`.** Ogni modifica nasce su un branch dedicato e arriva a
   `main` solo via Pull Request.
4. **Nessun deploy automatico e nessun push su ambienti condivisi senza conferma umana
   esplicita** — vale sia per il deploy applicativo (Cloudflare Pages) sia per modifiche a un
   progetto Supabase reale (`apply_migration`, `execute_sql` su produzione).
5. **Un agente non applica da solo modifiche a schema o a regole di sicurezza (RLS/permessi)**
   non esplicitamente richieste. Le propone (es. in un file separato con motivo e conseguenze in
   testa), un umano rilegge e conferma prima di applicarle.
6. **Non presumere risposte a un punto aperto.** Se serve una decisione su sicurezza, schema o
   UX per procedere, si chiede esplicitamente invece di sceglierne una in autonomia.
7. **File sotto una soglia di righe ragionevole (qui: 500).** Se una modifica porterebbe un file
   oltre soglia, è un segnale per valutare di spezzarlo, non per ignorarlo.
8. **Correzioni ai dati di test vanno nei file di seed versionati**, non applicate solo al
   proprio ambiente locale.
9. **Commit in stile Conventional Commits** (`feat(...)`, `fix(...)`, `docs(...)`,
   `security(...)`, `chore(...)`), coerenti con la cronologia esistente.
10. **Ogni regola RLS va collaudata attivamente per ruolo**, non solo letta sulla carta, e
    ricollaudata ad ogni modifica a schema o permessi. *Gap noto oggi*: non esiste ancora uno
    script di collaudo automatizzato (vedi `STATO.md`).

## Roadmap a fasi

- **Fase attuale — CRM in produzione.** Tutte le funzionalità core (lead, immobili, agenda,
  task, valutazioni AI, report pubblico) sono in uso reale da ITI. Debito tecnico noto ma non
  ancora sistematicamente tracciato (rimediato da questa adozione di metodo).
- **Fase successiva — ambiente locale riproducibile.** Sostituire l'attuale staging cloud
  (secondo progetto Supabase + Cloudflare Pages) con uno stack Supabase locale via Docker,
  ricostruibile da zero senza credenziali di produzione (vedi
  `docs/riferimento/ambiente_locale.md`).
- **Fase successiva — collaudo di sicurezza sistematico.** Script di collaudo RLS per ruolo,
  eseguito ad ogni modifica a schema/permessi.
- **Fase successiva — automazione minima.** CI che almeno esegue lint/build ad ogni PR (oggi
  assente).

## Riferimenti

- `docs/STATO.md` — fotografia dell'avanzamento reale.
- `docs/riferimento/ambiente_locale.md` — piano per l'ambiente Docker locale.
- `CLAUDE.md` (radice) — regole operative dettagliate per gli agenti, schema dati, RLS per
  tabella, stack tecnico.
