# STATO — ITI-BO

> Fotografia dell'avanzamento reale: cosa è fatto, cosa è aperto, vulnerabilità note, debito
> tecnico, prossimi passi in ordine. Si aggiorna ad ogni sessione di lavoro rilevante. Se
> un'informazione risponde "a che punto siamo", vive qui — non duplicarla in `OBIETTIVI.md`
> (cosa vogliamo) o `DECISIONI.md` (perché l'abbiamo fatto così).

_Ultimo aggiornamento: 2026-08-20 — audit completo della codebase (struttura, sicurezza, qualità)
+ creazione della migration baseline da introspezione produzione + pulizia sistematica a basso
rischio pre-major-change (file morti, dipendenza inutilizzata, fix lint, CI minima, collaudo
RLS di sola lettura)._

## Cosa funziona

- 10 route applicative dietro `ProtectedRoute` (Dashboard, Immobili, Leads, Tasks, Agenda,
  Valutazioni) + 1 route pubblica (`/report/:slug`) + auth (login/reset password).
- **11 migration versionate** in `supabase/migrations/`, ma coprono solo una parte dello schema
  — vedi gap critico sotto, la policy "un solo punto di verità" **non è ancora rispettata al
  100%**.
- RLS attiva e documentata per tabella/operazione/ruolo (vedi `CLAUDE.md` sezione Security) —
  verificato che copre correttamente `leads`, `appuntamenti`, `tasks`, `valutazioni`,
  `lead_notes`, `lead_immobili`, `lead_zone_ricercate`, `zone_omi`, `transazioni_chiuse`,
  `valutazione_comparabili`.
- RPC `upsert_lead` (SECURITY DEFINER) con hardening: regex email, dedup su email/telefono nelle
  24h, `search_path` fissato.
- 5 Edge Function attive: `generate-evaluation`, `generate-pdf`, `notify-new-lead`,
  `geocode-address`, `find-location-data`. Audit di sicurezza (2026-08-20): nessun secret
  hardcoded, SERVICE_ROLE_KEY usata solo dove necessario, input validati, errori non espongono
  dettagli interni. Tutte usano CORS `*` senza credenziali (accettabile oggi, da restringere a
  dominio se in futuro si aggiunge autenticazione cross-origin).
- Import Supabase e toast **100% conformi** alla convenzione (`src/lib/supabase.ts`,
  `src/utils/toast.ts`) — zero violazioni trovate su tutto `src/` e `supabase/functions/`.
  `src/integrations/supabase/client.ts` non è referenziato da nessuna parte: rimovibile.
- Zero segreti hardcoded nel codice sorgente versionato.
- Tutte le 74 dipendenze di `package.json` risultano usate, **tranne una** (vedi debito sotto).

## ✅ Baseline creata — gap era più esteso del previsto

`supabase/migrations/00000000000000_baseline.sql` (1209 righe) è stato generato il 2026-08-20
via introspezione **sola lettura** (`information_schema`/`pg_catalog`/`pg_policies`/`pg_proc`)
del progetto Supabase di produzione (`xzdazmzjltxsxyqokxdh`). **Nessuna scrittura è stata fatta
su produzione.** Non è ancora stato riletto/confermato da un umano — vedi "Da fare" sotto.

Verificando la cronologia migration reale (`list_migrations` via MCP) contro le 11 migration
locali, il gap era più grave di quanto documentato in precedenza:

- **La cronologia remota tracciata da Supabase ha 33 voci**; solo 6 corrispondono per nome a un
  file locale (con timestamp/versione diversi — segno che i file sono stati rinominati dopo
  l'applicazione, rompendo il matching per versione della CLI). **27 migration applicate in
  produzione non hanno alcun file corrispondente nel repo**, incluse quelle che hanno creato
  `audit_log`, `immobile_unita`, `tipologie_appuntamenti` e che hanno **eliminato** la tabella
  `lead_zone_ricercate` (`cleanup_zone_system`) — tabella ancora documentata in `CLAUDE.md` e in
  un file di migration locale come se esistesse.
- **5 file locali non hanno alcuna corrispondenza nella cronologia remota** (incluse le due
  migration "fondanti" `20260412_initial_valuation_schema.sql` e
  `20260420000000_enable_rls_and_policies.sql`) — probabilmente applicate a mano via SQL editor,
  mai tracciate da `supabase_migrations.schema_migrations`.
- Confermato via query diretta: **17 tabelle** in `public` (non le 9-13 stimate prima), tutte con
  RLS attiva, **42 policy**, **7 funzioni custom** (inclusi 2 overload live di `upsert_lead`,
  7-arg e 8-arg — non chiaro quale chiami davvero ITI2.0, vedi TODO nel file), **5 trigger**.

**Scoperte che richiedono conferma umana prima di qualunque azione** (marcate `TODO(review)`
nel file baseline, righe indicate):
1. `leads.zone_ricercate`/`tipologia_ricerca` sono array semplici, non la tabella
   `lead_zone_ricercate` — confermato eliminata da `cleanup_zone_system`. `CLAUDE.md` va
   corretto.
2. `tasks` **non ha una colonna `tipologia`** in produzione, in contraddizione con `CLAUDE.md`.
3. `valutazioni` ha sia `stato` (legacy) sia `status` — non chiaro se intenzionale o residuo.
4. ~~**Rilevanza sicurezza**: la policy `"Public can insert leads"` su `leads`...~~ **RISOLTO
   2026-08-20**: policy rimossa in produzione (`apply_migration
   fix_leads_insert_bypass_and_drop_dead_function`, richiesta esplicita dell'utente) +
   migration versionata `supabase/migrations/20260820120000_fix_leads_insert_bypass_and_drop_dead_function.sql`.
   `leads` ora non ha più alcuna policy INSERT diretta: solo `upsert_lead` (SECURITY DEFINER,
   owner `postgres` = owner tabella, `relforcerowsecurity=false` → bypassa RLS) può inserire.
   Verificato via `get_advisors` post-fix: nessun advisor residuo su questa policy.
5. `tasks` ha sia una policy permissiva `ALL`/`public` sia policy più strette per
   `authenticated` — le seconde sono di fatto inerti per semantica OR delle RLS policy. Non
   ancora affrontato.
6. ~~`process_lead(...)` — **funzione rotta**...~~ **RISOLTO 2026-08-20**: funzione droppata in
   produzione nella stessa migration del punto 4 (zero riferimenti nel repo, confermato prima
   di droppare).
7. `trigger_zone_omi_sync` è probabilmente invocata da un job `pg_cron`, non ancora ispezionato
   (`cron.job` fuori perimetro di questa sessione).

**Nuovi finding emersi da `get_advisors` dopo il fix**:
- ~~`search_path` non fissato su 3 funzioni: `comparabili_vicini`, `update_valutazioni_timestamp`,
  `nearest_zona_omi`~~ **RISOLTO 2026-08-20**: `ALTER FUNCTION ... SET search_path` applicato in
  produzione (`apply_migration fix_search_path_on_remaining_functions`, richiesta esplicita) +
  migration versionata
  `supabase/migrations/20260820121500_fix_search_path_on_remaining_functions.sql`. Per
  `comparabili_vicini`/`nearest_zona_omi` impostato `public, extensions` (non solo `public`)
  perché chiamano funzioni PostGIS (`ST_Distance`, `ST_DWithin`, ...) installate nello schema
  `extensions` — verificato con chiamata di prova post-fix (`comparabili_vicini` e
  `nearest_zona_omi` restituiscono ancora risultati corretti, nessuna regressione). Advisor
  `function_search_path_mutable` non più presente su queste 3 funzioni.
- ~~`log_changes()` e `trigger_zone_omi_sync()` sono `SECURITY DEFINER` e risultano chiamabili via
  RPC pubblico...~~ **RISOLTO 2026-08-20**: `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated`
  applicato in produzione (`apply_migration revoke_public_execute_on_internal_functions`,
  richiesta esplicita) + migration versionata
  `supabase/migrations/20260820122500_revoke_public_execute_on_internal_functions.sql`.
  Verificato prima di applicare: `log_changes` è chiamata solo da 4 trigger (`immobili_audit`,
  `leads_audit`, `tasks_audit`, `valutazioni_audit` — il firing di un trigger non richiede
  EXECUTE sul ruolo che esegue la DML, quindi l'audit continua a funzionare); `trigger_zone_omi_sync`
  è invocata solo dal job `pg_cron` `sync-zone-omi-monthly`, eseguito come ruolo `postgres`
  (owner della funzione, bypassa sempre i controlli ACL). Advisor risolto per entrambe.
- Protezione password compromesse (HaveIBeenPwned) disattivata in Supabase Auth. Non ancora
  affrontato (nessuna richiesta esplicita).

Conseguenze pratiche:
- **Lo schema di produzione ora è riproducibile** da questo file baseline (previa revisione
  umana) — sblocca il piano di ambiente locale Docker (`docs/riferimento/ambiente_locale.md`).
- Le migration incrementali esistenti in `supabase/migrations/` restano nel repo per storia, ma
  **non vanno più considerate affidabili come sequenza applicabile da zero** — usare la baseline
  come punto di partenza per un futuro reset della cartella migration (da decidere con l'utente,
  non fatto in questa sessione).

**Prossimo passo consigliato**: un umano rilegge `00000000000000_baseline.sql` riga per riga
(o almeno le sezioni con `TODO(review)`), conferma o corregge i 7 punti sopra, poi si decide se
e come riorganizzare `supabase/migrations/` attorno a questa baseline.

## Debito tecnico noto

- ~~**Nessun test automatico e nessuna CI**~~ **RISOLTO 2026-08-20 (parziale)**: creato
  `.github/workflows/ci.yml` (checkout, Node 22 LTS, `npm ci`, `npm run lint`, `npm run build`).
  **Il primo run è atteso rosso**: i 138 errori lint `no-explicit-any` residui (vedi sotto) non
  sono stati risolti in questa sessione (vivono soprattutto in `Leads.tsx`, file grande escluso
  dallo scope). Risolvere quel debito è il prossimo passo per rendere la CI verde, non un
  problema di setup del workflow.
- ~~**Nessuno script di collaudo RLS per ruolo**~~ **RISOLTO 2026-08-20 (fondamenta)**: creato
  `scripts/collaudo-rls.mjs` (`npm run collaudo:rls`) — verifica con client `anon` che le tabelle
  pubbliche (`immobili`, `open_houses`, `prenotazioni_oh`, `zone_omi`) siano leggibili e che le
  tabelle interne (`leads`, `tasks`, `valutazioni`, `lead_notes`, `lead_immobili`,
  `lead_zone_ricercate`) non restituiscano righe ad `anon`. **Solo asserzioni di sola lettura**:
  le asserzioni di scrittura/cancellazione per ruolo restano rimandate allo stack Docker locale
  (`docs/riferimento/ambiente_locale.md`, non ancora eseguito) per non rischiare dati reali.
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
- ~~**Pagine/componenti orfani**: `src/pages/Index.tsx`...~~ **RISOLTO 2026-08-20**: eliminato
  (zero import reali confermati via grep prima di cancellare). `OpenHouses.tsx` resta orfano
  (nessuna route in `App.tsx`) — non toccato, richiede conferma esplicita per `CLAUDE.md`.
- ~~**Duplicazione file**: `src/components/openhouse/AttendeesSheet.tsx`...~~ **RISOLTO
  2026-08-20**: eliminato (confermato zero import; l'unico `AttendeesSheet` in uso resta
  `src/components/properties/AttendeesSheet.tsx`).
- ~~**Dipendenza inutilizzata**: `@hello-pangea/dnd`...~~ **RISOLTO 2026-08-20**: rimossa da
  `package.json` via `npm uninstall` (zero occorrenze confermate in `src/` prima di rimuovere).
- ~~**~1.400 righe di componenti UI shadcn mai importati**~~ **RISOLTO 2026-08-20**: eliminati
  tutti e 10 (`carousel.tsx`, `chart.tsx`, `context-menu.tsx`, `menubar.tsx`,
  `navigation-menu.tsx`, `aspect-ratio.tsx`, `hover-card.tsx`, `resizable.tsx`,
  `toggle-group.tsx`, `input-otp.tsx`), zero import confermati via grep prima di cancellare.
- **Nuovo file morto trovato ed eliminato nella stessa sessione**:
  `src/components/ui/ImageUploader.tsx` (Cloudinary-based, limite 5MB) — zero import in tutto il
  repo, non era ancora in questo elenco.
- ~~**Costanti duplicate**: lista feature immobile...~~ **RISOLTO 2026-08-20**: estratta
  `PREDEFINED_FEATURES` (12 voci, canonica) in `src/lib/constants.ts`, importata da
  `PropertyWizard.tsx`. `ValuationForm.tsx` (deprecato) ora importa `VALUATION_FORM_FEATURES`,
  un sottoinsieme filtrato dalla lista canonica invece di una copia indipendente — se una voce
  canonica cambia nome, il sottoinsieme deprecato non può più andare silenziosamente fuori sync.
- ~~**139 errori + 26 warning ESLint**~~ **PARZIALMENTE RISOLTO 2026-08-20**: fix
  `tailwind.config.ts:98` (`require()` → `import` ESM statico) — errore count atteso 138.
  I 138 `no-explicit-any` residui restano fuori scope: concentrati in `src/pages/Leads.tsx`
  (57 errori, confermati riga per riga con `npx eslint src/pages/Leads.tsx`), il file più grande
  e più modificato del repo — nessun refactor di file grandi in questa sessione per esplicita
  richiesta dell'utente.
- **Correzione a una nota precedente di questo documento**: il causale "tsconfig root permissivo
  → 139 errori `any`" scritto sopra in versioni precedenti **era impreciso**. Letto
  `eslint.config.js` per intero: non c'è alcun collegamento type-aware (`parserOptions.project`/
  `projectService`) né a `tsconfig.json` né a `tsconfig.app.json` — `no-explicit-any` è una
  regola puramente sintattica, indipendente dalla strictness del type-checking. Il vero motivo
  per cui questi errori non bloccano nulla oggi è **l'assenza di CI fino a questa sessione**, non
  la configurazione TypeScript. Il contrasto `tsconfig.json` permissivo vs `tsconfig.app.json`
  strict resta un fatto vero e un debito a sé, ma è disaccoppiato da questo specifico problema.
- **Bundle**: chunk `app-*.js` da 605 kB (sopra la soglia di warning di Rollup). Le pagine sono
  già correttamente lazy-loaded; il grosso del chunk principale è React/Radix/React Query core,
  non ancora scomposto ulteriormente.
- ~~**Error handling incoerente tra pagine**: `Dashboard.tsx` non ha alcuna chiamata a
  `showError()`...~~ **RISOLTO 2026-08-20**: aggiunto `showError()` sulle query non guardate in
  `Dashboard.tsx` (profilo agente + le 6 query in `Promise.all`) e sul fallback silenzioso in
  `Leads.tsx` `fetchLeadDetail` (errore della query di dettaglio ora notificato all'utente).
  Fix mirati, non un refactor dei due file.
- **Styling incoerente**: 34 occorrenze di `rounded-[Xrem]` con valori arbitrari diversi tra
  loro, a fronte della convenzione `CLAUDE.md` (`rounded-[2rem]`/`rounded-[2.5rem]` per le card).

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

1. **Revisione umana della baseline** (`00000000000000_baseline.sql`) e dei 7 punti
   `TODO(review)` elencati sopra — blocca tutto il resto perché decide cosa è "vero" schema.
2. In base alla revisione, decidere se/come riorganizzare `supabase/migrations/` attorno alla
   baseline (es. archiviare le 11 migration incrementali non più affidabili come sequenza).
3. Impostare lo stack Supabase locale via Docker (`docs/riferimento/ambiente_locale.md`), ora
   sbloccato dalla baseline. Sblocca anche le asserzioni di scrittura/cancellazione per ruolo
   in `scripts/collaudo-rls.mjs` (oggi solo sola lettura, vedi sopra).
4. ~~Pulizia a basso rischio dalla codebase...~~ **FATTO 2026-08-20**: vedi debito tecnico sopra
   per l'elenco completo (file morti eliminati, dipendenza rimossa, fix lint, costanti
   consolidate, error handling aggiunto).
5. ~~Introdurre uno script di collaudo RLS per ruolo.~~ **FATTO 2026-08-20 (fondamenta)**:
   `scripts/collaudo-rls.mjs`, solo sola lettura — vedi punto 3 per il seguito.
6. ~~CI minima (lint + build) su ogni PR.~~ **FATTO 2026-08-20**: `.github/workflows/ci.yml`,
   primo run atteso rosso finché non si risolvono i 138 errori `any` residui (vedi debito
   tecnico sopra) — **prossimo passo concreto per sbloccare una CI verde**.
7. Risolvere i 138 errori `no-explicit-any` residui (concentrati in `Leads.tsx`) per rendere
   verde la CI appena introdotta — richiede toccare file grandi, quindi rimandato a una sessione
   dedicata con conferma esplicita dell'utente (fuori scope per questa pulizia a basso rischio).
8. `docs/RUNBOOK.md` e `docs/DECISIONI.md` (rimandati da questa sessione).
9. Cartella `supabase/migrations-proposte/` per modifiche a schema/RLS scritte da agenti ma non
   ancora validate da un umano.
