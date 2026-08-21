# STATO — ITI-BO

> Fotografia dell'avanzamento reale: cosa è fatto, cosa è aperto, vulnerabilità note, debito
> tecnico, prossimi passi in ordine. Si aggiorna ad ogni sessione di lavoro rilevante. Se
> un'informazione risponde "a che punto siamo", vive qui — non duplicarla in `OBIETTIVI.md`
> (cosa vogliamo) o `DECISIONI.md` (perché l'abbiamo fatto così).

_Ultimo aggiornamento: 2026-08-21 — flag `urgente` sulle task (`supabase/migrations/
20260821100000_add_urgente_to_tasks.sql`), evidenziato in rosso su tutte e 4 le superfici che
mostrano task (`TaskModal.tsx`, `Tasks.tsx`, `Dashboard.tsx`, tab task + mini modale in
`Leads.tsx`); creati e popolati `docs/RUNBOOK.md` e `docs/DECISIONI.md` (ultimi due dei 4
documenti vivi del metodo Serplay). Lavoro su branch `nuovo-Gestionale`, non ancora su `main`.

_Ultimo aggiornamento precedente: 2026-08-21 — chiusura §3.1-§3.5 della `specifica-progetto-iti-bo-v1.md`
(evoluzione da CRM lead-centrico a property-centrico): popolazione e UI della sottofase Kanban,
ricerca nel Kanban, colonna `ruolo` su `profili_agenti` (solo schema, nessun enforcement), pulizia
roadmap documentale. Lavoro svolto su branch `nuovo-Gestionale`, **non ancora mergiato su `main`**
(vedi sezione dedicata sotto). Sessione precedente (stesso branch, non ancora annotata qui prima
d'ora): introdotto lo schema property-centrico (tabelle pipeline/documenti/ownership) e riscritta
la gestione documenti da Supabase Storage a Google Drive tramite Edge Function proxy._

_Ultimo aggiornamento precedente 2: 2026-08-20 — audit completo della codebase (struttura,
sicurezza, qualità) + creazione della migration baseline da introspezione produzione + pulizia
sistematica a basso rischio pre-major-change (file morti, dipendenza inutilizzata, fix lint, CI
minima, collaudo RLS di sola lettura) + fix gap RLS `tasks`/`lead_notes`/`profili_agenti`/
`appuntamenti` in produzione (con fix di una regressione live su `leads` INSERT causata da un fix
precedente nello stesso giorno) + stack Supabase locale via Docker avviato e verificato
riproducibile da zero + risolti tutti e 7 i `TODO(review)` della baseline, incluso un bug live in
produzione (`tasks.tipologia` inesistente, rompeva il caricamento della Dashboard) e una colonna
morta droppata (`valutazioni.status`).

## Evoluzione property-centrica (branch `nuovo-Gestionale`, non su `main`)

Lavoro guidato da `specifica-progetto-iti-bo-v1.md` (nuovo documento di specifica, non ancora
menzionato altrove in questo file). Tutto quanto segue è **su branch `nuovo-Gestionale`, non
ancora mergiato su `main`** — nessuna di queste modifiche è in produzione. Testato contro lo
stack Supabase locale Docker (`supabase db reset`), mai contro produzione.

**Gestione documenti spostata da Supabase Storage a Google Drive** (sessione precedente a questa,
qui documentata per la prima volta): `supabase/functions/drive-documenti/` — nuova Edge Function
proxy verso Google Apps Script (`google-apps-script/DocumentiDrive.gs`, deployato live); il
frontend (`PipelineDetailSheet.tsx`) non carica più file su Storage ma tramite questo proxy;
naming standardizzato dei file su Drive (`{documento} - {indirizzo}.ext`) con logica di
sostituzione basata su prefisso invece che su ID fisso, e struttura cartelle appiattita. Bucket
Storage `immobile-documenti` (locale) ora orfano — da rimuovere in una sessione futura, non
ancora fatto.

**§3.1 (modello dati anagrafica) — chiuso, solo documentazione**: confermato che non esiste e non
è mai esistita nel codice una tabella "persona" dedicata da rimuovere (verificato via grep
sull'intero repo). `leads` con `tipo_cliente` (Acquirente/Proprietario/Ibrido) resta l'unica fonte
di verità; `immobili.proprietario_id` è già una FK reale verso `leads.id`. `specifica-progetto-iti-bo-v1.md`
§3.1 riscritto per riflettere la decisione come chiusa.

**§3.2 (sottofase pipeline) — implementato**: `immobile_pipeline_stato.sottofase` era sempre
scritto `null`; ora viene popolato con la prima sottofase della fase macro (selezione manuale,
default alla prima sottofase quando l'immobile entra in una fase — nessun auto-avanzamento da
checklist, per decisione esplicita dell'utente). Mappa fase→sottofasi introdotta in
`src/lib/pipelineChecklist.ts` (`SOTTOFASI_PIPELINE`, ri-esportata da `useImmobiliPipeline.ts` per
evitare un import circolare): Acquisizione (Contatto→Incontro→Sopralluogo→Rivalutazione→Presa in
carico), In Vendita (Burocratiche→Marketing→Appuntamenti), Venduto (Vincolo→Preliminare→Rogito),
Archivio (nessuna). Nuovo `Select` in `PipelineDetailSheet.tsx` per la selezione manuale, nascosto
per Archivio. **Bug trovato e risolto durante la verifica live** (Playwright + query DB dirette):
la mutation `aggiornaSottofase` usava un `.update()` semplice, che su un immobile senza ancora una
riga in `immobile_pipeline_stato` (es. dati pre-pipeline, o creati da Wizard e mai spostati)
falliva silenziosamente (0 righe toccate, nessun errore, nessun toast) — cambiato a `.upsert(...,
{ onConflict: 'immobile_id' })`. Riverificato dopo il fix: persistenza confermata sia in DB sia
nella UI dopo reload.

**§3.3 (Kanban) — portato al 100%**: aggiunta una barra di ricerca sopra le colonne
(`KanbanBoard.tsx`, filtro client-side case-insensitive su titolo/indirizzo/città/proprietario,
stesso pattern visivo della vista lista) e un badge sottofase su ogni card (`KanbanCard.tsx`).
Ragionamento sulla scala per quando gli immobili saranno molti (richiesto esplicitamente
dall'utente, nessuna azione presa oltre alla ricerca): il fetch attuale (una query con join,
nessuna paginazione) resta adeguato per i volumi tipici di un'agenzia di Bergamo; paginazione o
virtualizzazione per-colonna e caricamento separato dell'Archivio sono note per una lavorazione
futura, non implementate ora per non introdurre complessità non richiesta.

**§3.4 (ruoli) — solo schema/dati, nessun enforcement**: nuova migration
`supabase/migrations/20260821090000_add_ruolo_profili_agenti.sql` — colonna `ruolo` (Admin/
Agente/Segreteria, default `Agente`) su `profili_agenti`, backfill `Admin` dove `is_admin = true`.
Additiva: `is_admin` resta invariato (ancora usato da `Dashboard.tsx` per il filtro client-side).
**Nessuna UI di assegnazione ruolo, nessuna policy RLS che lo usa** — enforcement esplicitamente
rimandato a una lavorazione futura separata, per decisione dell'utente. `AgentProfile` in
`src/types/index.ts` aggiornato con il campo `ruolo?`.

**§3.5 (controllo accessi documenti) — chiuso, solo pulizia roadmap**: confermato che non esiste
ancora nel codice alcuna logica di controllo accessi ai documenti basata su ruolo. Rimossi i
riferimenti a questo come "prossimo passo imminente": `specifica-progetto-iti-bo-v1.md` (§3.5
secondo paragrafo, §6) e `google-apps-script/README.md` ("Debito noto") ora dichiarano
esplicitamente che il collegamento permessi-documenti↔ruolo è fuori dal perimetro della fase
corrente, rimandato a una lavorazione futura separata — non più un item aperto da chiudere a
breve.

**§3.6 (automazioni: alert stagnazione 60gg, matching acquirente/immobile) — non iniziato**, per
esplicita richiesta dell'utente di tenerlo per dopo la chiusura di §3.1-§3.5.

Verifica eseguita: `npx tsc --noEmit -p .` pulito; `supabase db reset` locale applica tutte le
migration (incluse quelle di questa fase) senza errori; verifica end-to-end via Playwright sul
Kanban (login, cambio vista, selezione sottofase con persistenza confermata in DB, ricerca
funzionante su tutte le colonne).

### Flag "urgente" sulle task (2026-08-21, dopo la chiusura di §3.1-§3.5)

Prima richiesta esplicita per l'evoluzione oltre §3.1-§3.5: un modo per marcare una task come
urgente e renderla rossa/più visibile ovunque compaia. Implementato come singolo booleano
`urgente` (non una scala di priorità, vedi `DECISIONI.md`), con toggle in tutte e 4 le superfici:
- `TaskModal.tsx` — toggle alla creazione, stile pulsante coerente con lo swatch-picker colore
  già esistente.
- `Tasks.tsx` — bordo/sfondo rosso su `TaskCard`, badge "Urgente", toggle rapido nelle azioni
  della card (sempre visibile se attivo, altrimenti solo su hover).
- `Dashboard.tsx` — task urgenti ordinate per prime nel widget "Task in sospeso" (`.order('urgente',
  { ascending: false })` prima dell'ordinamento per data), riga evidenziata in rosso con icona.
- `Leads.tsx` — tab task del lead e relativa mini modale di dettaglio, stesso pattern visivo;
  colto e corretto in corsa un bug preesistente minore: la select del tab task non includeva mai
  `telefono` nonostante il tipo lo dichiarasse e la UI lo rendesse condizionalmente — ora incluso.

Verifica eseguita: `npx tsc --noEmit -p .` pulito su tutto il repo. Nessuna verifica browser
live in questa sessione (nessun tool di automazione browser disponibile nell'ambiente) — il
pattern replica esattamente `toggleComplete`/`cycleLeadTaskStato`, già in produzione e verificati
in precedenza.

### Sezione alert (§3.6) — design proposto, non implementato (2026-08-21)

Richiesta esplicita dell'utente di "iniziare a pensare" a una sezione che controlli gli alert,
oltre alle due automazioni già previste dalla spec (§3.6: alert stagnazione 60gg in "In
Vendita", matching acquirente/immobile). Proposta di design (in attesa di conferma prima di
implementare):

- **Alert manuali per immobile**: nuova tabella `immobile_alert` (`immobile_id`, `messaggio`,
  `creato_da`, `risolto boolean default false`, `created_at`) — un agente annota un promemoria
  libero su un immobile specifico (es. "aspettare planimetria aggiornata prima di pubblicare").
- **Alert standard automatici** (calcolati, non righe persistite): stagnazione fase (già in
  spec, generalizzabile oltre "In Vendita" a soglie per fase, non solo 60gg fissi) e documento
  mancante (confronto tra `documenti_catalogo` atteso per fase/sottofase e `immobile_documenti`
  presenti).
- **Superficie UI**: un contatore/badge sul menu laterale (`AdminLayout.tsx`) più una vista
  dedicata (nuova route, es. `/alert`, o un pannello dentro `/immobili`) che lista tutti gli
  alert attivi (manuali + automatici) ordinati per immobile, con link diretto alla scheda
  pipeline dell'immobile.
- **Non ancora deciso, da confermare con l'utente prima di procedere**: se gli alert automatici
  vanno calcolati a runtime (query, nessuna tabella) o materializzati da un job schedulato;
  soglie esatte per fase (60gg è solo per "In Vendita" nella spec); se un alert può essere
  "silenziato" temporaneamente senza risolverlo.

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
1. ~~`leads.zone_ricercate`/`tipologia_ricerca` sono array semplici, non la tabella
   `lead_zone_ricercate`...~~ **RISOLTO 2026-08-20 (richiesta esplicita dell'utente)**:
   confermato che la tabella è stata eliminata da `cleanup_zone_system` e che zero codice (né in
   questo repo né in `ITI2.0`) la referenzia più. `CLAUDE.md` corretto: rimossa la riga
   `lead_zone_ricercate` dallo schema e dalla tabella RLS, documentato che `zone_ricercate` e
   `tipologia_ricerca` (entrambi array su `leads`) sono l'unica fonte di verità.
2. ~~`tasks` **non ha una colonna `tipologia`**...~~ **RISOLTO 2026-08-20 (richiesta esplicita
   dell'utente, confermata rimozione intenzionale)**: non era solo un problema di
   documentazione — **bug live in produzione**. `src/pages/Dashboard.tsx` selezionava
   `tasks.tipologia` nella query dei task in sospeso; verificato via query diretta che la colonna
   non esiste (`42703`), quindi quella query falliva sempre, facendo scattare il ramo di errore
   combinato del `Promise.all` e mostrando **"Errore nel caricamento dei dati della dashboard"
   ad ogni caricamento della Dashboard, per ogni agente**. Stesso problema (silenzioso, nessun
   errore mostrato ma dati sempre vuoti) in due punti di `src/pages/Leads.tsx` (tab task del
   modale lead, e refresh dopo la creazione di una task). Fix: rimosso `tipologia` dalle 3
   query e dalle interfacce TypeScript (`PendingTask` in `Dashboard.tsx`, `LeadTaskItem` in
   `Leads.tsx`) — verificato che il campo non era mai renderizzato in nessuna UI (dead field).
   `CLAUDE.md` corretto: `tasks` non ha `tipologia`; `appuntamenti` sì, tabella diversa, non
   confondere. Verificato `npx tsc --noEmit` e `npm run build` puliti dopo il fix (nessuna
   regressione, solo errori pre-esistenti non correlati).
3. ~~`valutazioni` ha sia `stato` (legacy) sia `status`...~~ **RISOLTO 2026-08-20 (richiesta
   esplicita dell'utente)**: verificato che **zero codice** (repo `ITI-BO` o `ITI2.0`) legge o
   scrive mai `status` — solo `stato` è usato in `ValuationWizard.tsx`, `Valutazioni.tsx`,
   `ValuazioneReport.tsx`. Confermato via dato live: tutte le 51 righe erano ferme al default di
   colonna `'draft'`, prova che non è mai stata aggiornata da nessun percorso applicativo (residuo
   di un rename incompleto, non un campo parallelo con dati reali). Droppata in produzione
   (`apply_migration drop_dead_status_column_on_valutazioni`, che ha anche rimosso il vincolo
   `valutazioni_status_check` dipendente) + migration versionata
   `supabase/migrations/20260820150000_drop_dead_status_column_on_valutazioni.sql`.
   `supabase/seed.sql` aggiornato (rimosso `status` dall'insert di test). Verificato con
   `supabase db reset` locale: tutte le migration si applicano ancora pulite da zero.
4. ~~**Rilevanza sicurezza**: la policy `"Public can insert leads"` su `leads`...~~ **RISOLTO
   2026-08-20**: policy rimossa in produzione (`apply_migration
   fix_leads_insert_bypass_and_drop_dead_function`, richiesta esplicita dell'utente) +
   migration versionata `supabase/migrations/20260820120000_fix_leads_insert_bypass_and_drop_dead_function.sql`.
   `leads` ora non ha più alcuna policy INSERT diretta: solo `upsert_lead` (SECURITY DEFINER,
   owner `postgres` = owner tabella, `relforcerowsecurity=false` → bypassa RLS) può inserire.
   Verificato via `get_advisors` post-fix: nessun advisor residuo su questa policy.
   **⚠️ REGRESSIONE causata da questo fix, RISOLTA 2026-08-20 (stesso giorno)**: il DROP ha
   lasciato `leads` **senza alcuna policy INSERT**, anche per `authenticated` —
   `src/pages/Leads.tsx:605` crea un nuovo contatto con un `.insert()` diretto (non passa dalla
   RPC), quindi gli agenti hanno iniziato a ricevere `403 Forbidden` in produzione (segnalato
   dall'utente come "i clienti mi hanno segnalato questo errore"). Fix: aggiunta policy
   `"Authenticated can insert leads"` (`FOR INSERT TO authenticated WITH CHECK (true)`) —
   `anon` resta senza percorso diretto (deve passare da `upsert_lead`), gli agenti tornano
   operativi. Lezione: un DROP di una policy `roles={public}` va sempre verificato anche per
   `authenticated`, non solo per `anon` — `public` in Postgres include entrambi i ruoli.
5. ~~`tasks` ha sia una policy permissiva `ALL`/`public` sia policy più strette per
   `authenticated`...~~ **RISOLTO 2026-08-20**: policy `"Team_Può_Fare_Tutto"` (roles=`public`,
   quindi incluso `anon`) droppata in produzione (`apply_migration
   drop_public_all_policy_on_tasks`, richiesta esplicita dell'utente) + migration versionata
   `supabase/migrations/20260820123500_drop_public_all_policy_on_tasks.sql`. Restano solo le 4
   policy `authenticated`-only (select/insert/update/delete), coerenti con `CLAUDE.md`.
   Verificato via query diretta su `pg_policies` post-fix e `get_advisors`: nessun nuovo advisor,
   nessuna policy INSERT/SELECT/UPDATE/DELETE residua per `anon` su `tasks`.
6. ~~`process_lead(...)` — **funzione rotta**...~~ **RISOLTO 2026-08-20**: funzione droppata in
   produzione nella stessa migration del punto 4 (zero riferimenti nel repo, confermato prima
   di droppare).
7. ~~`trigger_zone_omi_sync` è probabilmente invocata da un job `pg_cron`, non ancora
   ispezionato...~~ **ISPEZIONATO 2026-08-20 (richiesta esplicita dell'utente, sola lettura —
   nessuna modifica allo schema valutazioni/zone_omi)**: `select * from cron.job` conferma
   `sync-zone-omi-monthly` (1° del mese, 07:00, `SELECT public.trigger_zone_omi_sync()`), come
   documentato. **Trovato anche un secondo job non documentato**: `pulizia-task-bimensile`
   (1° e 14° del mese, 00:00, `DELETE FROM public.tasks WHERE stato = 'Completata'`) — spiega
   perché le task completate spariscono periodicamente, comportamento non menzionato in nessun
   file del repo prima d'ora. Aggiunto a `CLAUDE.md` (nuova sezione "Cron jobs"). Nessuna azione
   presa, solo ispezione e documentazione.

8. ~~**Gap RLS trovato 2026-08-20**: `lead_notes`, `profili_agenti`, `appuntamenti` protette da
   un'unica policy catch-all (`ALL`/`roles=public`/`qual=true`), senza policy
   `authenticated`-only di riserva...~~ **RISOLTO 2026-08-20 (richiesta esplicita dell'utente)**:
   `apply_migration restore_leads_insert_and_scope_catchall_policies` + migration versionata
   `supabase/migrations/20260820140000_restore_leads_insert_and_scope_catchall_policies.sql`.
   Le tre policy permissive (`"Permetti tutto su lead_notes"`, `"Permetti tutto su
   profili_agenti"`, `"Team_Può_Fare_Tutto_Agenda"`) sono state **sostituite** (non solo
   droppate) con policy `FOR ALL TO authenticated USING (true) WITH CHECK (true)` — verificato
   prima via grep sul repo `ITI2.0` (sito pubblico sibling) che nessuna delle tre tabelle è
   letta da codice anonimo/pubblico. Verificato post-fix via `pg_policies` diretto: `anon` non ha
   più alcuna policy su queste tre tabelle; `get_advisors` non mostra nuovi warning (solo quelli
   preesistenti e attesi: `upsert_lead` chiamabile da `anon`/`authenticated` per design, password
   compromesse non ancora attivato).

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

**Tutti e 7 i punti `TODO(review)` sono stati confermati/risolti dall'utente il 2026-08-20**
(vedi elenco sopra) — la revisione umana della baseline richiesta qui non è più un blocco per
il resto della roadmap.

## Debito tecnico noto

- ~~**Nessun test automatico e nessuna CI**~~ **RISOLTO 2026-08-20**: creato
  `.github/workflows/ci.yml` (checkout, Node 22 LTS, `npm ci`, `npm run lint`, `npm run build`).
  **Primo run confermato rosso** (GitHub Actions run `32350146194`, fallito sullo step
  `npm run lint`) con 83 errori `no-explicit-any`. Tutti e 83 risolti in una sessione successiva
  (inclusi i 57 in `Leads.tsx`, vedi sotto) — `npx eslint .` ora riporta **0 errori, 12 warning**
  su tutto il repo; la CI è attesa verde dal prossimo run.
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
- ~~**Nessun ambiente locale containerizzato**~~ **RISOLTO 2026-08-20**: stack Supabase locale
  via Docker avviato e verificato riproducibile da zero — vedi
  `docs/riferimento/ambiente_locale.md` per dettagli/comandi. Riepilogo: `supabase init` +
  porte remappate su blocco `544xx` (`supabase/config.toml`) per non collidere con altri stack
  locali; le 11 migration pre-baseline si sono rivelate **non riproducibili** dopo
  `00000000000000_baseline.sql` (`supabase db reset` falliva con `42710`, oggetti duplicati) e
  sono state archiviate in `supabase/migrations-archivio/` (non cancellate); `supabase/seed.sql`
  nuovo con 2 utenti di test (`admin@locale.test`/`agente@locale.test`, password `locale123`) +
  dati fittizi (immobili, leads, tasks, agenda, open house, valutazioni); `.env.development.local`
  (gitignored) punta `npm run dev` allo stack locale senza toccare `.env.local` (produzione);
  `scripts/stop-locale.sh` per uno stop che preserva il volume. Verificato con login reale
  (JWT valido) e dev server servito su `localhost:8080` contro lo stack locale.
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
- ~~**139 errori + 26 warning ESLint**~~ **RISOLTO 2026-08-20**: fix `tailwind.config.ts:98`
  (`require()` → `import` ESM statico) — errore count confermato da CI (run `32350146194`): 83
  errori + 12 warning. Il numero locale inizialmente riportato (138) era gonfiato da un worktree
  Git residuo (`.claude/worktrees/sweet-ritchie-a9c8c2`, già `.gitignore`d) che conteneva una
  copia stantia di `src/` letta per errore da `npx eslint .`; rimosso il worktree. I restanti 83
  `no-explicit-any` (57 in `src/pages/Leads.tsx`, 26 sparsi su altri 11 file) sono stati risolti
  in una sessione dedicata: tipizzazione esplicita delle query Supabase (nuove interfacce
  `LeadRecord`, `PropertyRef`, `LeadTaskItem`, `LeadEventItem`, `LeadNote`, ecc. in `Leads.tsx`),
  rimozione dei cast `as any` non necessari, generic su `applyTipoFilter` per l'helper di
  filtro Supabase. Verificato anche con `tsc --noEmit` (più stringente di quanto richiesto dalla
  CI): pulito a parte un bug pre-esistente e non correlato (`setFilterAgente` non definito,
  riga ~1073 di `Leads.tsx`, presente ancor prima di questa sessione) lasciato intenzionalmente
  intatto perché fuori scope per un fix di lint. `npx eslint .` → **0 errori, 12 warning
  invariati**; `npm run build` invariato.
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

**Nessun ambiente di staging/pre-produzione esiste al momento**, ma lo stack Docker locale
(`docs/riferimento/ambiente_locale.md`, eseguito e verificato 2026-08-20) ora permette di
collaudare migration/modifiche riproducibilmente da zero prima di applicarle in produzione —
resta comunque solo un sostituto parziale di uno staging condiviso vero e proprio.

## Dati sensibili

Dati personali reali di lead/clienti (nome, telefono, email, budget). Nessun dato di minori o
sanitario. RLS restringe lettura/scrittura alle tabelle CRM ad `authenticated`.

## Prossimi passi in ordine

1. ~~**Revisione umana della baseline**...~~ **FATTO 2026-08-20**: tutti e 7 i punti
   `TODO(review)` confermati/risolti dall'utente (vedi elenco sopra), incluso un bug live
   scoperto nel farlo (query rotta su `tasks.tipologia` in `Dashboard.tsx`/`Leads.tsx`).
2. ~~In base alla revisione, decidere se/come riorganizzare `supabase/migrations/`...~~ **FATTO
   2026-08-20**: le 11 migration incrementali pre-baseline si sono dimostrate empiricamente non
   riproducibili dopo la baseline (`supabase db reset` falliva) e sono state archiviate in
   `supabase/migrations-archivio/`.
3. ~~Impostare lo stack Supabase locale via Docker...~~ **FATTO 2026-08-20**: vedi debito tecnico
   sopra e `docs/riferimento/ambiente_locale.md`. Resta aperto: sbloccare le asserzioni di
   scrittura/cancellazione per ruolo in `scripts/collaudo-rls.mjs` (oggi solo sola lettura) ora
   che lo stack locale esiste.
4. ~~Pulizia a basso rischio dalla codebase...~~ **FATTO 2026-08-20**: vedi debito tecnico sopra
   per l'elenco completo (file morti eliminati, dipendenza rimossa, fix lint, costanti
   consolidate, error handling aggiunto).
5. ~~Introdurre uno script di collaudo RLS per ruolo.~~ **FATTO 2026-08-20 (fondamenta)**:
   `scripts/collaudo-rls.mjs`, solo sola lettura — vedi punto 3 per il seguito.
6. ~~CI minima (lint + build) su ogni PR.~~ **FATTO 2026-08-20**: `.github/workflows/ci.yml`,
   primo run (`32350146194`) confermato rosso come atteso, con 83 errori `any` residui.
7. ~~Risolvere gli 83 errori `no-explicit-any` residui (concentrati in `Leads.tsx`).~~ **FATTO
   2026-08-20**: vedi debito tecnico sopra — `npx eslint .` → 0 errori. Prossimo push dovrebbe
   rendere verde la CI (da confermare osservando il run effettivo).
8. ~~`docs/RUNBOOK.md` e `docs/DECISIONI.md`...~~ **FATTO 2026-08-21**: entrambi creati e
   popolati — `RUNBOOK.md` con l'ambiente locale, il ciclo di lavoro, la checklist pre-PR e le
   migration/deploy; `DECISIONI.md` con una voce "stato ereditato al 2026-08-20" più il log
   puntuale delle decisioni non ovvie da lì in avanti (staging→Docker, migration archiviate,
   colonna morta droppata, regressione RLS del 2026-08-20, sottofase manuale, ruoli
   schema-only, flag urgente).
9. Cartella `supabase/migrations-proposte/` per modifiche a schema/RLS scritte da agenti ma non
   ancora validate da un umano.
10. ~~Ambiente locale Docker/Supabase...~~ **FATTO 2026-08-20**: vedi punto 3 e debito tecnico
    sopra.
11. ~~Decidere come risolvere il gap RLS su `lead_notes`/`profili_agenti`/`appuntamenti`...~~
    **FATTO 2026-08-20**: vedi punto 8 sopra.
12. §3.6 della `specifica-progetto-iti-bo-v1.md`: automazioni (alert stagnazione 60gg su
    immobili fermi in una fase, matching acquirente/immobile) — tenuto per dopo la chiusura di
    §3.1-§3.5 (fatta il 2026-08-21), per richiesta esplicita dell'utente.
13. Enforcement effettivo dei ruoli (Admin/Agente/Segreteria) introdotti il 2026-08-21: oggi solo
    schema/dati, nessuna RLS li usa. Da valutare come lavorazione futura separata (include anche
    il controllo accessi documenti per ruolo rimandato dal §3.5).
14. Decidere quando e come mergiare `nuovo-Gestionale` su `main` — tutto il lavoro property-centrico
    (schema, Drive, pipeline/Kanban, ruoli) è oggi solo su questo branch, mai in produzione.
15. Rimuovere il bucket Storage locale `immobile-documenti`, orfano da quando la gestione
    documenti è passata a Google Drive. **Spiegato come farlo 2026-08-21**: va tolto a mano da
    Supabase Studio → Storage (bloccato da un trigger `protect_buckets_delete` per DELETE via
    SQL/migration) — non ancora eseguito.
16. ~~Guida al cambio cartella Google Drive (test → reale)~~ **FATTO 2026-08-21**:
    `docs/riferimento/cambio_cartella_drive.md`, richiamata da `google-apps-script/README.md`.
17. Flag `urgente` sulle task: **FATTO 2026-08-21** (vedi sezione dedicata sopra).
18. §3.6/alert: design proposto 2026-08-21 (vedi sezione dedicata sopra), non ancora
    implementato — in attesa di conferma dell'utente prima di procedere.
19. Hardening `OpenHouseBooking.tsx` in `ITI2.0` (repo sibling, fuori da questo repository):
    nessun rate-limit/regex email lato client a differenza di `ContactForm.tsx`, errori
    silenziosi in console invece che tramite `logger.error`/Sentry, dipendenze con
    vulnerabilità note (`react-router-dom`, `ws` via `@supabase/realtime-js`) — segnalato
    2026-08-21, da pianificare come lavoro separato su quel repository.
