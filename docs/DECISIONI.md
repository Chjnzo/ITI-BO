# DECISIONI — ITI-BO

> Log cronologico delle decisioni prese e perché, comprese quelle sbagliate poi corrette. Si
> aggiorna ad ogni decisione non ovvia. Se un'informazione risponde "perché l'abbiamo fatto
> così", vive qui — non duplicarla in `OBIETTIVI.md` (cosa vogliamo), `STATO.md` (a che punto
> siamo) o `RUNBOOK.md` (come si fa).

Questo file nasce il 2026-08-21, in coda all'adozione del "metodo Serplay" (vedi
`ADOZIONE-METODO-ALTRO-PROGETTO.md`). Non ricostruisce in dettaglio la storia precedente al
2026-08-20 (161 commit, sviluppo per lo più diretto su `main` senza log decisionale) — solo una
voce riassuntiva "stato ereditato", poi si logga da qui in avanti.

## Stato ereditato al 2026-08-20

Prima dell'audit del 2026-08-20 il progetto era sviluppato con commit diretti frequenti (spesso
più volte al giorno, es. `Fix25/06`, `fix04/06`), nessun log decisionale, nessuna CI, nessun
ambiente locale riproducibile, schema dati gestito da migration incrementali non tutte
riproducibili tra loro. Il primo audit ha portato alla luce e corretto diversi problemi latenti
(vedi voci sotto) — non sono difetti introdotti dal metodo, sono ciò che il metodo ha reso
visibile.

## 2026-08-20 — Ambiente locale via Docker al posto dello staging cloud

**Decisione**: eliminare il precedente staging cloud (progetto Supabase `ipgvfyyxtdetysuegioe` +
Cloudflare Pages `iti-bo-staging`) e sostituirlo con lo stack Supabase CLI via Docker,
ricostruibile da zero in locale.

**Perché**: lo staging cloud richiedeva credenziali di un servizio esterno per chiunque volesse
lavorarci ed era una copia manuale, non riproducibile da una migration. Il metodo Serplay
richiede invece un ambiente che chiunque clona il repository possa avviare senza chiedere
accesso a nessun servizio esterno. Dettagli in `docs/riferimento/ambiente_locale.md`.

## 2026-08-20 — Migration pre-baseline archiviate, non cancellate

**Decisione**: le 11 migration incrementali datate 2026-04/2026-05, non riproducibili in
sequenza dopo la migration baseline introspetta da produzione (fallivano con errori di oggetto
duplicato), sono state spostate in `supabase/migrations-archivio/` invece che cancellate.

**Perché**: cancellarle avrebbe fatto perdere la storia di *come* si è arrivati allo schema
attuale; tenerle attive in `supabase/migrations/` rompeva `supabase db reset`. Archiviarle
preserva entrambe le cose — restano leggibili come riferimento storico, ma non vengono più
eseguite.

## 2026-08-20 — Colonna morta `valutazioni.status` droppata, non solo ignorata

**Decisione**: durante la revisione dei `TODO(review)` della baseline è emerso che
`valutazioni.status` era una colonna duplicata di `stato`, sempre al suo valore di default,
mai letta né scritta da alcun codice. È stata droppata con una migration, non lasciata come
debito silenzioso.

**Perché**: una colonna morta che sopravvive è un rischio per chi arriva dopo (può sembrare
significativa e non lo è); il costo di rimuoverla con una migration reversibile via git era
minimo rispetto al rischio di confusione futura.

## 2026-08-20 — Regressione live su `leads` INSERT durante il fix RLS, corretta lo stesso giorno

**Decisione/incidente**: il fix dei gap RLS su `tasks`/`lead_notes`/`profili_agenti`/
`appuntamenti` ha introdotto, nello stesso giorno, una regressione che bloccava l'INSERT su
`leads` in produzione. Individuata e corretta entro la stessa sessione (commit `903fa7b`).

**Perché è qui**: è l'esempio concreto, richiamato da `ADOZIONE-METODO-ALTRO-PROGETTO.md` §2
regola 10, del perché ogni modifica a permessi/RLS va ricollaudata per ruolo *dopo* la modifica,
non solo verificata sulla carta prima di applicarla — è già successo che un fix di sicurezza ne
introducesse un altro.

## 2026-08-20 — `collaudo-rls.mjs` limitato a sola lettura

**Decisione**: lo script di collaudo RLS (`scripts/collaudo-rls.mjs`) verifica solo le policy
SELECT contro produzione, non le policy di scrittura (INSERT/UPDATE/DELETE) per ruolo.

**Perché**: testare la scrittura richiede utenti di test con ruoli diversi e query che
scrivono davvero — farlo contro produzione sarebbe pericoloso. Le asserzioni di scrittura
restano un passo successivo, da fare quando serve davvero isolare un test di ruolo (oggi
comunque non ancora rilevante: l'enforcement per ruolo stesso è rimandato, vedi voce
2026-08-21 sotto).

## 2026-08-21 — Nessuna entità "persona" dedicata (§3.1 della spec property-centrica)

**Decisione**: l'anagrafica Proprietario/Acquirente resta sulla tabella `leads` esistente, con
`tipo_cliente` (Acquirente/Proprietario/Ibrido) e `immobili.proprietario_id` come foreign key
reale verso `leads`. Nessuna tabella "persona" separata viene introdotta.

**Perché**: `leads` copre già il caso d'uso (una persona può essere sia potenziale acquirente
che proprietario di un immobile in vendita) e introdurre un'entità parallela avrebbe richiesto
una migrazione dati non giustificata da un problema reale — confermato esplicitamente
dall'utente durante la revisione della spec, non solo dedotto dal codice.

## 2026-08-21 — Sottofase pipeline: selezione manuale, nessun auto-avanzamento

**Decisione**: `immobile_pipeline_stato.sottofase` viene impostata di default alla prima
sottofase quando un immobile entra in una fase macro, ma il cambio successivo è sempre manuale
da UI (`PipelineDetailSheet.tsx`) — non esiste auto-avanzamento automatico basato sul
completamento della checklist documenti.

**Perché**: decisione esplicita dell'utente. Un auto-avanzamento legato ai documenti caricati
avrebbe accoppiato due concetti (completezza documentale e stato operativo della fase) che non
sempre coincidono nella pratica dell'agenzia — es. un immobile può passare di sottofase per un
evento (un incontro fatto, un sopralluogo svolto) prima ancora che il relativo documento sia
caricato.

## 2026-08-21 — Ruoli (Admin/Agente/Segreteria) solo a livello di schema/dati

**Decisione**: aggiunta la colonna `profili_agenti.ruolo` con backfill da `is_admin`, ma
**nessuna RLS e nessuna UI di assegnazione** usano ancora questo campo. `is_admin` resta il
campo effettivamente letto dal codice applicativo (es. filtro client-side in `Dashboard.tsx`).

**Perché**: decisione esplicita dell'utente di separare "modellare il dato" da "farlo valere" —
introdurre RLS per ruolo senza aver prima deciso e collaudato la matrice di permessi per ogni
tabella sarebbe stato un enforcement fatto a metà, rischioso quanto non averlo. L'enforcement
resta lavorazione futura separata (vedi `STATO.md`, punto 13 dei prossimi passi).

## 2026-08-21 — Controllo accessi documenti per ruolo rimandato, tolto dalla roadmap corrente

**Decisione**: il collegamento tra permessi documentali (§3.5 della spec) e ruoli (§3.4) è
esplicitamente rimandato a una lavorazione futura separata, non un prossimo passo della fase
corrente — rimosso anche dagli item aperti "da chiudere entro il meeting".

**Perché**: dipende dall'enforcement dei ruoli (voce sopra), che è a sua volta rimandato. Tenerlo
nella roadmap corrente come "da fare presto" sarebbe stato fuorviante rispetto al reale ordine
di dipendenza tra i due lavori.

## 2026-08-21 — Flag "urgente" sulle task, non un campo priorità multi-livello

**Decisione**: le task hanno un singolo booleano `urgente` (`supabase/migrations/
20260821100000_add_urgente_to_tasks.sql`), evidenziato in rosso ovunque una task compare
(creazione, lista/board, widget Dashboard, tab task del lead), non una scala di priorità a più
livelli (bassa/media/alta/urgente).

**Perché**: la richiesta esplicita era "un tasto che rende rossa e più visibile una task" — un
caso binario (urgente sì/no). Una scala multi-livello sarebbe stata complessità non richiesta;
si introduce se e quando emerge davvero il bisogno di distinguere più di due livelli.

## 2026-08-21 — Alert automatici (§3.6) calcolati a runtime, nessuna tabella né job schedulato

**Decisione**: gli alert "standard" (stagnazione fase, documento non generato in checklist) non
sono righe persistite: `src/hooks/useAlerts.ts` li calcola ad ogni fetch confrontando
`immobile_pipeline_stato.updated_at`/`documenti_catalogo`/`immobile_documenti` correnti. Solo gli
alert manuali (promemoria liberi per immobile) vivono in una tabella (`immobile_alert`).

**Perché**: l'utente ha approvato l'implementazione ("procedi") senza rispondere esplicitamente
alla domanda aperta runtime-vs-job lasciata nel design proposto. Al volume attuale di immobili
(decine/basse centinaia) una query aggiuntiva ad ogni caricamento della sidebar/pagina alert non
è un problema di performance misurato; introdurre un `pg_cron` che materializza alert in una
tabella avrebbe aggiunto infrastruttura (job, gestione stato "già segnalato", invalidazione) non
giustificata da un problema reale. Da rivalutare se il volume di immobili crescerà molto.

## 2026-08-21 — Soglie di stagnazione per fase diverse da "In Vendita" sono una stima, non da spec

**Decisione**: `SOGLIA_STAGNAZIONE_GIORNI` in `src/hooks/useAlerts.ts` usa 60gg per "In Vendita"
(valore esplicito della spec §3.6), ma anche 30gg per "Acquisizione" e 45gg per "Venduto"
(Archivio esente, è fuori dal cruscotto operativo).

**Perché**: la spec definisce la soglia solo per "In Vendita"; l'utente ha detto "procedi" senza
rispondere alla domanda esplicita sulle soglie per le altre fasi lasciata aperta nel design. Ho
scelto valori ragionevoli (fasi più brevi nella pratica dell'agenzia) piuttosto che non generare
l'alert per quelle fasi, così da avere un default utilizzabile subito — ma sono valori non
confermati dall'utente, da correggere se si rivelano sbagliati in pratica (non hardcoded altrove,
un solo posto da cambiare).

## 2026-08-21 — Alert "documento mancante" per presenza di riga, non per stato "Fatto"

**Decisione**: l'alert automatico confronta se esiste una riga in `immobile_documenti` per ogni
documento atteso da `documenti_catalogo` nella fase corrente — non se lo stato è "Fatto". Un
documento "Da fare" non genera questo alert (è già visibile nella checklist della pipeline).

**Perché**: `generaChecklistPerFase` crea automaticamente tutte le righe previste ad ogni cambio
fase, quindi "riga mancante" può accadere solo per un disallineamento reale (es. il catalogo è
stato aggiornato dopo che la checklist di un immobile era già stata generata) — un segnale utile
e non ridondante. Segnalare invece ogni documento "Da fare" avrebbe semplicemente duplicato
un'informazione già visibile nel Kanban/nella scheda pipeline, senza aggiungere valore.

## 2026-08-21 — Foto immobili restano su Supabase Storage, non spostate su Google Drive

**Decisione**: a differenza dei documenti (già spostati da Storage a Google Drive, vedi
`docs/STATO.md`), le foto degli immobili (`immobili.copertina_url`/`immagini_urls`) restano su
Supabase Storage. Nessuna modifica di codice.

**Perché**: l'utente ha chiesto di spostare anche le foto su Drive, nella stessa cartella
dell'immobile, con ITI2.0 (sito pubblico) che le legge da lì. A differenza dei documenti — letti
solo dal CRM autenticato via un round-trip base64 su richiesta — le foto devono essere servite
pubblicamente e in modo affidabile a un sito marketing, inclusi i meta tag OG/social. Google
Drive non è pensato per l'hotlinking da siti terzi: gli URL diretti (`uc?export=view` o
`thumbnail`) sono spesso rate-limitati/bloccati e non sempre seguiti correttamente dai crawler
social. Verificati i numeri in produzione prima di decidere (progetto `xzdazmzjltxsxyqokxdh`):
101 immobili (88 attivi), bucket Storage `immobili` a 278,8 MB su 1.699 file — volumi piccoli,
quindi non è un problema di scala che spinga verso Drive. Proposta un'alternativa (mirror in
sola scrittura verso Drive, lettura pubblica invariata da Storage) ma l'utente ha preferito non
toccare nulla: si resta sull'architettura attuale.

## 2026-08-21 — Checkbox documento checklist bloccato finché non c'è un file caricato

**Decisione**: in `PipelineDetailSheet.tsx`, il checkbox "Fatto" di un documento della checklist
è disabilitato finché quel documento non ha un `drive_file_id` (cioè un file caricato su Drive).
Si può comunque togliere la spunta a un documento già segnato "Fatto" in precedenza (anche se
privo di file, per non alterare dati esistenti pre-fix).

**Perché**: richiesta esplicita dell'utente, osservata da uno screenshot in cui due documenti
risultavano "Fatto" senza alcun file allegato — la checklist doveva garantire che "Fatto"
significhi davvero "documento caricato", non solo una spunta manuale.

## 2026-08-21 — Icona caricamento/visualizzazione file unificata, capacità di sostituzione rimossa

**Decisione**: il pulsante graffetta (carica file) e il pulsante spunta verde (visualizza file
già caricato) nella checklist documenti sono stati unificati in un solo pulsante: graffetta
quando manca il file, spunta verde quando è presente (clic → visualizza). Prima del cambio,
cliccare la graffetta anche a file già presente permetteva di **sostituirlo**; questa capacità
non è stata reintrodotta.

**Perché**: richiesta esplicita dell'utente di semplificare l'icona ("rendi la graffetta una
spunta quando viene collegato"). La perdita della sostituzione diretta è stata segnalata
esplicitamente all'utente in chat, non è ancora stato chiesto di reintrodurla — se serve, va
aggiunta con un'interazione dedicata (es. icona separata solo a file presente) per non
confondere di nuovo i due stati in un solo pulsante.

## 2026-08-21 — Pivot Proprietari/Compratori/Collaboratori: decisioni di design (pianificazione, nessun codice ancora)

**Decisione**: `leads` viene sostituita da tre tabelle separate — `proprietari` (con
`proprietari_pratiche` come pipeline/kanban per singolo immobile in acquisizione: Contatto →
Incontro/Sopralluogo → Rivalutazione → Presa in carico, **senza sottofasi**), `compratori`,
`collaboratori` (anagrafe/certificatori/notai/responsabili portali, tabella nuova senza dati
storici). Ogni tabella ha un campo `professione`. Un proprietario può avere più pratiche/immobili;
via e tipologia dell'immobile si raccolgono sulla pratica (non sull'anagrafica proprietario) e
diventano il nome annuncio; la pratica genera l'immobile in automatico solo alla "Presa in carico".

**Perché**: richiesta esplicita e diretta dell'utente — cambio di modello di business, i
proprietari diventano il punto focale del gestionale fino alla firma della presa d'incarico.
Sovrascrive la decisione precedente del 2026-08-21 ("nessuna entità persona dedicata, `leads`
unica fonte di verità") con un requisito di prodotto nuovo, non un errore della decisione
precedente.

**Collegamento generico da tasks/note/appuntamenti a "un contatto qualsiasi"**: tabella base
condivisa `contatti` (id, agente_id, created_at) a cui le 3 tabelle si appoggiano 1:1 sullo stesso
id, invece di 3 colonne FK nullable per tabella collegata. Scelta tecnica dell'assistente (Postgres
non supporta FK polimorfiche pulite verso tabelle diverse), l'utente si è affidato esplicitamente
("uso la soluzione migliore che ti aspetti").

**Ibridi esistenti**: quando un lead `Ibrido` viene splittato in una riga `proprietari` + una riga
`compratori` (non collegate tra loro), le task/note/appuntamenti storiche legate a quel lead
vengono **duplicate**, una copia per il nuovo compratore e una per il nuovo proprietario —
decisione esplicita dell'utente, non va scelto un solo lato.

**`upsert_lead` invariata per `ITI2.0`**: `ContactForm.tsx` nel repo sibling ha già il toggle
comprare/vendere (`p_tipo_interesse`) e lo passa già alla RPC; il pivot richiede solo di riscrivere
il corpo della funzione lato ITI-BO (stessa firma) per scrivere su `proprietari`/`compratori`
invece che su `leads` — **zero modifiche di codice richieste in `ITI2.0`**. Checklist di collaudo
post-cutover documentata in `ITI2.0/PIVOT-CONTATTI-ITI-BO.md`.

**Motore alert generalizzato**: la richiesta esplicita di poter configurare da UI dopo quanti
giorni scatta un alert (per fase del kanban proprietari, ma anche per le fasi della pipeline
immobili) sostituirà le soglie oggi hardcoded in `useAlerts.ts` (30/60/45gg) con una tabella di
regole configurabile dagli admin.

**Stato**: solo pianificazione/design in questa sessione, **nessuna migration o codice scritto
per questo pivot**. Piano a fasi (7 fasi) tracciato con `TaskCreate` nella sessione corrente;
punti ancora aperti da chiarire quando si arriva alla fase relativa: quali nuovi documenti
aggiungere alla pipeline immobili, come migrare gli immobili oggi già in fase "Acquisizione" in
produzione, matrice permessi RLS concreta per l'enforcement dei ruoli.

## 2026-08-21 — Nessun meccanismo di "silenziamento" alert in questo giro

**Decisione**: un alert manuale può solo essere creato o risolto (`risolto = true`); un alert
automatico non può essere "silenziato" temporaneamente — resta visibile finché la condizione che
lo genera (fase ferma, documento mancante) non cambia.

**Perché**: era una delle domande esplicitamente lasciate aperte nel design proposto, non
risposta dall'utente. Un meccanismo di silenziamento per gli alert automatici (calcolati, non
persistiti) avrebbe richiesto comunque una tabella di stato dedicata solo per questo — complessità
non giustificata finché non emerge un caso d'uso reale in cui un alert automatico va ignorato a
lungo senza che la condizione sottostante cambi.

## 2026-08-27 — Pivot Proprietari/Compratori/Collaboratori: deroga temporanea alle regole di
## processo + Fase 1 (schema) implementata e verificata in locale

**Decisione**: per chiudere l'intero pivot a 7 fasi in tempi brevi, l'utente ha esplicitamente
derogato ai vincoli non negoziabili #5/#6 di `docs/OBIETTIVI.md` (stop per conferma umana ad ogni
fase schema/RLS, "non presumere" su ogni punto aperto) — solo per questo sforzo. Modalità
concreta: tutte le modifiche (schema, RLS, codice) solo contro lo stack Supabase locale via
Docker, senza gate di conferma per-fase; nessuna scrittura su produzione e nessun push/merge su
`main` finché il pivot non funziona per intero in locale. Restano comunque obbligatorie le
migration versionate e l'aggiornamento di `STATO.md`/`DECISIONI.md` — non sono un gate lento, sono
economiche e vengono mantenute.

**Perché**: richiesta diretta dell'utente ("Andremo a violare le regole e rendere il tutto molto
più flessibile"), motivata dall'obiettivo di completare il pivot in circa due giorni di lavoro.

**Fase 1 (schema) — fatto**: migration additiva
`20260827090000_add_contatti_proprietari_compratori_collaboratori.sql` (non tocca `leads` né
`lead_immobili`, frontend esistente resta funzionante) crea `contatti` (base condivisa, con
`lead_id_origine` come colonna temporanea di tracciabilità, da rimuovere al cutover finale),
`proprietari` + `proprietari_pratiche`, `compratori`, `collaboratori`, `compratori_immobili`, più
`valutazioni.proprietario_id` e `contatto_id`/`duplicato_da_id` su `tasks`/`lead_notes`/
`appuntamenti`. Segue le convenzioni già stabilite nel repo: RLS "accesso completo agli agenti
autenticati", nessun GRANT esplicito necessario (i default privileges sono già corretti da
`20260820163000`).

**Backfill — fatto**: `scripts/backfill-contatti-pivot.sql` (non una migration, idempotente,
pattern di `backfill-property-centric-model.sql`) popola le nuove tabelle da `leads`. Per i lead
`Ibrido` crea **due contatti separati e non collegati** (uno `proprietari`, uno `compratori`) e
**duplica** le task/note/appuntamenti storiche collegate — usa colonne self-referencing
`duplicato_da_id` per restare idempotente senza euristiche fragili di "già duplicato".

**Verifica in locale**: `supabase db reset` applica la migration senza errori; esecuzione dello
script contro il container Docker locale produce conteggi coerenti con i dati di seed noti (7
contatti = 3 proprietari + 4 compratori; 2 proprietari_pratiche, solo per i lead con immobile
collegato; 2/3 valutazioni linkate, la terza resta orfana come da seed; 2 compratori_immobili =
lead_immobili originali). La logica di duplicazione Ibrido non è esercitata dal seed di default
(il lead Ibrido non ha task/note/appuntamenti in seed) — testata a mano inserendo un task di prova
sul lead Ibrido e rieseguendo lo script: risultato corretto (UPDATE in-place lato proprietario +
INSERT duplicato lato compratore con `duplicato_da_id` verso l'originale), poi il DB locale è
stato resettato per tornare allo stato pulito. `tsc --noEmit` pulito (nessun codice frontend
toccato in questa fase).

**Fase 2 (RPC) — fatto**: `20260827110000_rewrite_upsert_lead_to_contatti.sql` riscrive
`upsert_lead` (solo l'overload a 8 argomenti con `p_tipo_interesse`, l'unico realmente chiamato
da `ContactForm.tsx`; l'overload a 7 argomenti è stato droppato in quanto dead code) per scrivere
su `contatti`+`proprietari` o `contatti`+`compratori`+`compratori_immobili` a seconda di
`p_tipo_interesse`, mantenendo identica la logica di rate-limit 15', dedup-guard 24h e validazione
email (ora scoped alla tabella di destinazione). Nessuna modifica richiesta in `ITI2.0`, firma
RPC invariata. Verificato in locale con `psql` diretto (incluso `SET ROLE anon` per l'execute
grant) su entrambi i rami acquirente/venditore, rate-limit, dedup, email malformata.

**Prossimo passo**: Fase 3, split UI Contatti in tab Compratori/Collaboratori.

## 2026-08-27 — Fase 3 (UI Contatti) implementata e verificata in locale

**Decisione**: `src/pages/Leads.tsx` eliminata e sostituita da `src/pages/Contatti.tsx`
(container con tab shadcn Compratori/Collaboratori) montata sulla stessa route `/leads`
(nome UI provvisorio invariato, come da decisione di design del 2026-08-21). Tutta la logica
venditore (stato_venditore, valutazione_stimata, scadenza_esclusiva, motivazione_vendita,
zona_venditore, card "Dati di Vendita", filtro tipo_cliente, fonte/"Dal sito",
immobile_primo_contatto) è stata rimossa senza sostituzione: `compratori` non ha queste colonne
per definizione, e la gestione venditore vivrà nel futuro modulo Proprietari dedicato (Fase 4),
non in questa vista. La card "Esigenze di Acquisto" è ora incondizionata. `CompratoriView.tsx`
inserisce i nuovi contatti in due passi lato client (`INSERT contatti` poi `INSERT compratori`
sullo stesso id, nessuna RPC transazionale dedicata) e collega task/note/appuntamenti via
`contatto_id` invece di `lead_id`; mantiene la stessa concorrenza ottimistica su `_version` già
usata da `leads`. `CollaboratoriView.tsx` è CRUD semplice, senza pipeline/stato/tab (la tabella
`collaboratori` non ha `_version`). `TaskModal.tsx`/`EventFormModal.tsx` sono stati estesi in
modo additivo (`defaultContattoId`/`defaultContattoName`) senza toccare il comportamento dei
chiamanti esistenti.

**Bug di schema scoperto e corretto in collaudo**: `lead_notes.lead_id` era rimasta `NOT NULL`
nella migration di Fase 1, a differenza di `tasks.lead_id`/`appuntamenti.lead_id` (già nullable
da prima del pivot) — bloccava l'inserimento di note su contatti collegati solo via
`contatto_id`. Corretto con una migration additiva separata,
`20260827130000_lead_notes_lead_id_nullable.sql` (`DROP NOT NULL`), invece di modificare la
migration di Fase 1 già applicata.

**Perché**: prosecuzione diretta del piano a 7 fasi già concordato, sotto la stessa deroga
temporanea ai gate di conferma. Il fix di `lead_notes.lead_id` è stato scelto come nuova
migration piuttosto che un'edit retroattiva della Fase 1 per non riscrivere la storia di una
migration già eseguita, anche in locale.

Collaudo: inserimento in due passi, task/nota/appuntamento via `contatto_id`, `collaboratori`,
link `compratori_immobili`, soft delete — tutti via `psql` diretto sul container Docker (in una
transazione con `ROLLBACK` finale). RLS invariata (`ALL` per `authenticated`). `tsc --noEmit -p
tsconfig.app.json`: 0 nuovi errori rispetto al baseline noto. `npm run build`: OK. Nessuna
verifica in browser (nessun tool di automazione browser disponibile in questo ambiente).

**Prossimo passo**: Fase 4, modulo Proprietari (kanban + lista + auto-creazione immobile su
"Presa in carico").

## 2026-08-27 — Bugfix UI Fase 3 (Contatti) trovati in collaudo manuale dall'utente

**Decisione**: 4 fix mirati, tutti in locale, nessuna migration coinvolta:
1. `src/pages/Contatti.tsx`: aggiunta la variante Tailwind `data-[state=inactive]:hidden` a
   entrambi i `TabsContent` (Compratori/Collaboratori).
2. `CompratoriView.tsx`/`CollaboratoriView.tsx`: `autoComplete="off"` + `name` dedicato
   sull'input di ricerca.
3. Stessi due file: `pt-2` sulla riga header che contiene la barra di ricerca.
4. Stessi due file: rimossi i placeholder fittizi "Mario"/"Rossi" dai campi Nome/Cognome dei
   form di creazione/modifica.

**Perché**:
1. Radix `TabsContent` non smonta mai il pannello del tab inattivo — lo nasconde solo tramite
   l'attributo HTML nativo `hidden` (confermato leggendo il sorgente di `@radix-ui/react-tabs` e
   `@radix-ui/react-presence` in `node_modules`: `TabsContent` passa sempre una funzione come
   `children`, il che forza `Presence` a montare comunque entrambi i pannelli). Le classi
   Tailwind `flex`/`flex-col` che avevamo messo sullo stesso elemento impostano `display` da
   foglio di stile "author", che ha precedenza di cascata sulla regola `[hidden]{display:none}`
   dello user-agent — quindi il pannello inattivo restava visibile e i due pannelli si
   spartivano lo spazio flex disponibile, schiacciando la tabella attiva.
2. Il placeholder della barra di ricerca contiene la parola "email"; Chrome la usa come euristica
   per proporre il proprio menu di autocompletamento indirizzi/email anche su un campo di testo
   generico, sovrapponendosi visivamente alla tabella sottostante.
3. L'anello di focus di shadcn (`ring-2 ring-offset-2`, ~4px oltre il bordo) sporge sopra il
   riquadro dell'input; essendo la barra di ricerca il primissimo figlio di un contenitore con
   `overflow-hidden` e zero padding superiore, quei 4px collidono col bordo del contenitore e
   vengono tagliati. `Properties.tsx` non ha questo problema perché la sua barra di ricerca è una
   riga successiva a un blocco titolo con `mb-6`, che fa da cuscinetto entro lo stesso
   `overflow-hidden`.
4. Richiesta esplicita dell'utente — i valori "Mario"/"Rossi" nei placeholder venivano scambiati
   per dati già inseriti.

Nessuna verifica automatica in browser (nessun tool di automazione disponibile in questo
ambiente) — fix confermati dall'utente via screenshot manuali durante il collaudo.

## 2026-08-27 — Fase 4 pivot: Modulo Proprietari (kanban + lista + auto-creazione immobile)

**Decisione**: l'immobile creato automaticamente quando una pratica proprietario raggiunge
"Presa in carico" entra direttamente nella fase pipeline immobili "In Vendita", saltando
"Acquisizione". Non viene impostato `immobili.proprietario_id` (la FK punta ancora a `leads`, non
a `proprietari` — gap noto, rimandato). Non viene impostato esplicitamente `immobili.visibile`
(resta il default `true`). Il modulo Proprietari espone sia una vista Kanban (solo pratiche) sia
una vista Lista (tutti i proprietari, con o senza pratica).

**Perché**:
1. L'acquisizione è appena avvenuta nella pipeline proprietari (contatto → sopralluogo →
   rivalutazione → presa in carico): rifare "Acquisizione" anche nella pipeline immobili sarebbe
   uno step duplicato senza valore informativo aggiuntivo.
2. `immobili.proprietario_id` referenzia `leads(id)` in produzione (confermato via ispezione
   diretta dello schema col container Docker) — cambiare quella FK è un lavoro di migrazione a sé
   (Fase 5, insieme alla migrazione degli immobili esistenti), fuori scope qui. Il collegamento
   proprietario↔immobile per ora vive solo nell'altro verso, tramite
   `proprietari_pratiche.immobile_id` (già presente nello schema di Fase 1).
3. `PropertyWizard.tsx` non imposta mai esplicitamente `visibile` alla creazione (nemmeno per le
   bozze `stato: 'Bozza'`) — è una convenzione già esistente in tutta l'app; introdurre un
   comportamento diverso solo per gli immobili nati da una pratica sarebbe un'inconsistenza senza
   beneficio pratico, anche se in teoria una bozza appena creata potrebbe risultare pubblicamente
   visibile prima che l'agente la completi (limite preesistente dell'intera app, non specifico di
   questa funzionalità).
4. La RPC pubblica `upsert_lead` (Fase 2) crea un proprietario SENZA pratica quando arriva dal
   form "vendere" del sito pubblico (via/tipologia/città li deve raccogliere l'agente). Una vista
   Kanban da sola nasconderebbe questi proprietari finché non viene avviata una pratica — da qui
   la necessità di una vista Lista separata che li mostri comunque, con un'azione "Avvia pratica".

Collaudo via `psql` diretto (transazione con `ROLLBACK`): contatto → proprietario → pratica →
cambio fase a "Presa in carico" → creazione immobile — verificato end-to-end. `npx tsc --noEmit -p
tsconfig.app.json`: 0 nuovi errori.

## 2026-08-27 — Fase 5 pivot: rimozione fase "Acquisizione" dal Kanban immobili, documenti
## spostati sulla pipeline proprietari

**Decisione**: `FasePipeline` immobili passa da 4 a 3 valori (`'In Vendita' | 'Venduto' |
'Archivio'`); i 4 documenti che vivevano su `documenti_catalogo`/`immobile_documenti` fase
"Acquisizione" (Doc Valutazione; Privacy proprietario firmata, Incarico di mediazione firmato,
CI/CF proprietario) si spostano su nuove tabelle `proprietari_documenti_catalogo`/
`proprietari_pratica_documenti`, distribuiti sulle fasi "Contatto" (1 doc) e "Presa in carico" (3
doc) della pipeline proprietari — senza integrazione Drive, solo toggle Da fare/Fatto. La
migrazione dati (spostamento documenti esistenti + immobili ancora in "Acquisizione" verso "In
Vendita") è inclusa nella stessa migration di schema, non in uno script backfill separato.
`immobili.proprietario_id` **non** viene toccato in questa fase: resta puntato a `leads` (gap già
noto da Fase 4), rimandato a una fase successiva insieme alla migrazione dei dati storici — "Fase
5" nel piano originale ne parlava insieme, ma qui si è scelto di isolare la sola rimozione della
fase pipeline per tenere la migration piccola e verificabile.

**Perché**:
1. I 4 documenti "Acquisizione" sono concettualmente lato proprietario (privacy, incarico,
   CI/CF, valutazione), non lato immobile: nel nuovo modello l'acquisizione avviene nella
   pipeline proprietari, quindi è lì che questi documenti hanno senso — non sono nuovi documenti
   inventati, solo lo stesso set trasferito alla sua collocazione logica. "In Vendita"/"Venduto"
   hanno già checklist complete e indipendenti dall'acquisizione: nessuna aggiunta necessaria
   lì.
2. Nessun upload Drive per i documenti proprietario: la pipeline proprietari è stata già decisa
   più semplice di quella immobili (niente sottofase, Fase 4); estendere anche l'integrazione
   Drive qui sarebbe stato lavoro non richiesto per completare il pivot. Resta un possibile
   follow-up separato se emerge un bisogno reale.
3. Migrazione dati nella stessa migration (a differenza del backfill leads→contatti, che è uno
   script a parte): tocca tabelle popolate solo da migration/codice applicativo, mai da `leads`,
   quindi è un no-op sicuro su `db reset` locale pulito. In produzione va applicata dopo
   `scripts/backfill-contatti-pivot.sql` per non perdere lo stato "Fatto" storico dei documenti
   (altrimenti i documenti "Acquisizione" restano orfani, nessuna pratica a cui agganciarli, e
   vengono comunque eliminati senza errore ma senza preservare lo storico).

Collaudo: migration testata via `psql` diretto (transazione con `ROLLBACK`, dati sintetici in fase
"Acquisizione" trasformati correttamente, poi verificato che un INSERT con fase "Acquisizione"
viene rigettato dal CHECK stretto), poi applicata per davvero con `npx supabase db reset`. Flusso
applicativo (generazione checklist su nuova pratica, cambio fase, toggle, cascade delete) testato
via `psql` diretto separato (transazione con `ROLLBACK`). `npx tsc --noEmit -p tsconfig.app.json`:
0 nuovi errori. `npm run build`: OK.

**Prossimo passo**: Fase 6.

## 2026-08-27 — Fase 6 pivot: enforcement ruoli limitato a `profili_agenti`, non matrice di permessi CRM-wide

**Decisione**: la Fase 6 ("Ruoli: UI assegnazione Admin/Agente/Segreteria + enforcement RLS") è
stata implementata con uno scope volutamente ristretto — chi può leggere/modificare la colonna
`profili_agenti.ruolo` e una UI Admin-only (`/impostazioni`) per assegnarlo — **non** una matrice
di permessi differenziata per Agente/Segreteria sulle altre tabelle del CRM (leads/contatti/
immobili/tasks/...), che restano `authenticated ALL` come da `CLAUDE.md`.

Migration `20260827170000_ruoli_admin_enforcement.sql`:
1. `is_admin()` — funzione `SECURITY DEFINER` che verifica `ruolo = 'Admin'` per `auth.uid()`
   corrente, usata sia dalle policy sotto sia da futuri controlli.
2. `sync_is_admin_from_ruolo()` (trigger `BEFORE INSERT OR UPDATE`) — mantiene la colonna legacy
   `is_admin` sincronizzata con `ruolo`, invece di riscrivere ogni lettura esistente (trovato un
   solo uso, `Dashboard.tsx`, ma tenere `is_admin` derivato evita di doverli cercare tutti).
3. `enforce_ruolo_change_admin_only()` (trigger `BEFORE UPDATE`) — solo un Admin può cambiare
   `ruolo` (proprio o altrui); condizionato a `auth.uid() IS NOT NULL` per non bloccare contesti
   diretti (migration/seed/service_role) che non hanno un JWT.
4. `handle_new_agente_profile()` (trigger `AFTER INSERT ON auth.users`) — auto-provisioning:
   ogni nuovo utente creato in `auth.users` genera automaticamente una riga `profili_agenti` con
   ruolo di default `'Agente'`, altrimenti la nuova UI Admin non vedrebbe mai un utente appena
   creato finché qualcuno non aggiunge la riga a mano.
5. RLS: sostituita la vecchia policy permissiva `"Authenticated can manage profili_agenti"`
   (`FOR ALL USING true WITH CHECK true`, ereditata dal baseline) con SELECT aperto a tutti gli
   `authenticated` (i profili servono ovunque: dropdown assegnazione, colori calendario, filtri)
   e UPDATE ristretto a "la propria riga, oppure qualunque riga se sei Admin".

**Perché scope ristretto**: la voce "2026-08-21 — Ruoli solo a livello di schema/dati" aveva già
deliberatamente separato "modellare il campo ruolo" da "farlo rispettare", proprio per evitare un
enforcement presunto/a metà senza una richiesta esplicita su quali differenze di accesso servono
per Agente vs Segreteria sulle altre tabelle. Costruire oggi quella matrice sarebbe lo stesso
rischio già scartato allora. Qui si chiude solo il gap concreto e non ambiguo: prima di questa
migration qualsiasi agente autenticato poteva riassegnarsi da solo il ruolo Admin via client
Supabase diretto.

**Perché trigger invece di RLS pura per il controllo "solo Admin cambia ruolo"**: un self-update
di `ruolo` va bloccato anche se la policy UPDATE permette `id = auth.uid()` per tutti gli altri
campi del proprio profilo (nome, colore, avatar) — un controllo a livello di singola colonna con
confronto OLD/NEW è più semplice ed esplicito in un trigger che con condizioni RLS annidate.

**Fix emersi durante il collaudo**: il trigger di auto-provisioning (punto 4) causava un conflitto
di PK in `seed.sql`, che inserisce esplicitamente le stesse righe già create dal trigger — risolto
con `ON CONFLICT (id) DO UPDATE SET ...` e scrivendo `ruolo` invece di `is_admin` (ormai derivato).
Il trigger di enforcement (punto 3), nella prima versione senza il controllo `auth.uid() IS NOT
NULL`, rigettava anche l'`UPDATE` di `seed.sql` stesso (eseguito via psql/superuser, senza sessione
JWT, quindi `is_admin()` risultava `false`) — risolto aggiungendo quel controllo, così l'enforcement
si applica solo alle sessioni PostgREST autenticate reali, non ai contesti diretti già esenti per
convenzione (stesso principio delle tabelle "ALL TO service_role" in `CLAUDE.md`).

Frontend: `src/hooks/useCurrentProfile.ts` (profilo dell'utente loggato, con `ruolo`) e
`src/hooks/useAgentRoles.ts` (lista completa agenti + mutation `aggiornaRuolo`, Admin-only per via
di RLS/trigger — non serve un controllo lato client aggiuntivo). `src/pages/Impostazioni.tsx`
(nuova pagina, tabella agenti con `Select` per ruolo, conferma `window.confirm` se un Admin sta per
rimuovere il proprio ruolo Admin). Route `/impostazioni` in `App.tsx` protetta da `ProtectedRoute
adminOnly` (nuovo prop, redirige a `/` se `ruolo !== 'Admin'`). Voce sidebar "Impostazioni"
(icona `Settings`) in `AdminLayout.tsx`, visibile solo se `useCurrentProfile().ruolo === 'Admin'`.

Collaudo: migration testata via `psql` diretto (transazione con `ROLLBACK`), incluse simulazioni di
sessione RLS con `SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = '<uuid>'` per
verificare sia il path Admin sia il path non-Admin sulla UPDATE di `ruolo`; poi applicata per
davvero con `npx supabase db reset` (superato al primo tentativo dopo i due fix sopra). `npx tsc
--noEmit -p tsconfig.app.json`: 0 nuovi errori rispetto al baseline noto. `npm run build`: OK.
Nessuna verifica UI in browser (nessun tool di automazione browser disponibile in questo ambiente)
— solo collaudo DB diretto + type-check + build.

**Prossimo passo**: Fase 7.

## 2026-08-27 — Fase 7 pivot: motore di alert configurabile (tabella `alert_regole`), chiude il pivot Proprietari/Compratori/Collaboratori

**Decisione**: sostituire le soglie di stagnazione hardcoded in `useAlerts.ts` (solo immobili, tre
costanti fisse nel codice) con una tabella `alert_regole` gestibile dall'Admin via UI, estendendo il
calcolo automatico anche alla pipeline proprietari — chiudendo così l'ultima voce pianificata del
pivot ("Pagina Alert riprogettata... motore di regole configurabile dagli admin... deve coprire
almeno le fasi del kanban proprietari", nota del 2026-08-21).

**Perché combinazioni fisse invece di CRUD libero**: le fasi valide sono un enum chiuso già
vincolato dai CHECK di `immobile_pipeline_stato`/`proprietari_pratiche` (3 fasi immobili, 4 fasi
proprietari). Un "aggiungi regola" libero avrebbe permesso di creare righe per combinazioni
`entita_tipo`/`fase` inesistenti, orfane, senza nulla a cui applicarsi. La tabella `alert_regole` è
quindi pre-seedata con esattamente 7 righe (una per combinazione valida, `UNIQUE(entita_tipo, fase)`
+ CHECK che vincola quali fasi sono ammesse per quale entità), e l'Admin le modifica sul posto
(`giorni_soglia`, `destinatario`, `attiva`) invece di inserirne/rimuoverne. Questo ha anche
semplificato la UI in `Impostazioni.tsx` a una tabella editabile, senza un form di creazione.

**Perché "documento mancante" resta fuori dal motore**: quell'alert confronta la presenza di righe
in `immobile_documenti` contro il catalogo per la fase corrente — non è un pattern "N giorni fermo
in fase X", quindi non è un buon fit per `alert_regole`. Tenuto con la logica esistente in
`useAlerts.ts`, non forzato dentro un'astrazione che non gli si applica.

**Perché la risoluzione dell'agente responsabile per gli immobili passa da `proprietari_pratiche`
e non da `immobili.proprietario_id`**: `immobili.proprietario_id` punta ancora alla vecchia tabella
`leads` (gap noto e volutamente non toccato, vedi voce Fase 5 sopra). Il collegamento affidabile
all'agente è invece via la pratica proprietari che ha generato l'immobile (`creaImmobileDaPratica`
in `useProprietariPipeline.ts`): reverse-embed
`pratiche:proprietari_pratiche(proprietario:proprietari(contatti(agente_id)))` nella query di
`immobiliBase`. Per immobili senza pratica collegata (creati direttamente da `PropertyWizard`) non
c'è modo di risolvere un responsabile — gestito dal fallback sotto, non da un errore.

**Perché fallback a "visibile a tutti" se l'agente responsabile non è risolvibile**: l'alternativa
(nascondere l'alert finché non c'è un responsabile chiaro) rischia di far sparire in silenzio un
alert reale. Il nuovo helper `visibileAUtente` in `useAlerts.ts` applica il filtro
`agente_responsabile` solo quando un `agente_id` è effettivamente risolvibile; altrimenti, o se
l'utente è Admin, mostra comunque l'alert (stessa logica "tutti i leads" vs "i miei" già usata in
`Dashboard.tsx`).

**Perché `fetchAlertRegole` estratta come funzione condivisa**: `useAlertRegole.ts` (gestione Admin)
e `useAlerts.ts` (motore di calcolo per qualunque utente loggato) leggono la stessa tabella. Con la
stessa query key (`ALERT_REGOLE_QUERY_KEY`) e la stessa funzione di fetch, react-query dedupe la
richiesta di rete tra i due invece di duplicarla.

Migration `20260827190000_alert_regole.sql`: tabella `alert_regole` (`entita_tipo`, `fase`,
`giorni_soglia`, `destinatario` default `'tutti'`, `attiva` default `true`), CHECK di combinazione
valida, `UNIQUE(entita_tipo, fase)`, seed di 7 righe (soglie immobili identiche ai valori hardcoded
rimossi da `useAlerts.ts` — nessuna regressione di comportamento; soglie proprietari sono una stima
ragionevole non confermata dall'utente, "Archivio" e "Presa in carico" seedate `attiva = false`
perché fasi terminali). RLS: SELECT aperto a tutti gli `authenticated`, UPDATE ristretto ad Admin
via `is_admin()` (riuso diretto della funzione introdotta in Fase 6, nessuna logica duplicata).

Frontend: `src/hooks/useAlertRegole.ts` (query + mutation `aggiornaRegola`, Admin-only per via di
RLS). `useAlerts.ts` riscritto: `AlertAutomatico` generalizzato (`entita`/`entitaId` invece di campi
immobili-only), nuova query `proprietariBase`, due loop di calcolo stagnazione (immobili e
proprietari) basati su una `Map` delle regole attive per fase invece delle vecchie costanti.
`Impostazioni.tsx` esteso con sezione "Regole di alert automatico" (due gruppi, immobili e
proprietari; per riga: input numerico giorni con commit `onBlur`, `Select` destinatario, `Switch`
attiva). `Alerts.tsx`: nuovo `apriAutomatico` che instrada verso `/immobili` o `/proprietari` a
seconda di `alert.entita` (deep-link via `location.state`, stesso pattern già in uso per gli
immobili). `KanbanBoard.tsx` proprietari e `Proprietari.tsx` estesi con `autoOpenId`/
`location.state.openPraticaId`, analogo al kanban immobili.

**Collaudo**: schema/RLS/CHECK testati via `psql` diretto (transazione con `ROLLBACK`) —
combinazione duplicata rigettata da `UNIQUE`, combinazione non valida rigettata dal CHECK, SELECT
libero per qualunque `authenticated`, UPDATE riuscita solo in sessione Admin simulata (`SET LOCAL
ROLE authenticated; SET LOCAL request.jwt.claim.sub = '<uuid>'`), bloccata per Agente (`UPDATE 0`).
Un primo tentativo di collaudo della logica applicativa contro il seed locale esistente ha dato
risultati vuoti (`UPDATE 0`, join senza righe) — non un bug, il seed locale non popola
`proprietari`/`proprietari_pratiche`/`immobile_pipeline_stato`/`contatti` (verificato con `SELECT
count(*)`, tutti a zero tranne 5 `immobili` senza pipeline). Rifatto con dati sintetici inseriti
dentro la stessa transazione di test: join di stagnazione verificato per un immobile fermo 90gg in
"In Vendita" (soglia 60, match) e una pratica ferma 20gg in "Contatto" (soglia 7, match);
risoluzione `agente_responsabile` verificata via il reverse-embed pratica→proprietario→contatti.
Migration applicata per davvero con `npx supabase db reset`. `npx tsc --noEmit -p
tsconfig.app.json`: 0 nuovi errori rispetto al baseline noto (`feedback_tsc_check.md`). `npm run
build`: OK. Verificato che nessun altro consumer nel codebase usasse i vecchi campi flat di
`AlertAutomatico` (`immobileId`/`immobileTitolo`/... — le uniche altre occorrenze di quei nomi in
grep sono variabili locali non correlate, es. il payload della Edge Function `drive-documenti` in
`PipelineDetailSheet.tsx`). Nessuna verifica UI in browser (nessun tool di automazione browser
disponibile in questo ambiente) — solo collaudo DB diretto + type-check + build.

**Esito**: pivot Proprietari/Compratori/Collaboratori concluso, 7 fasi su 7 completate e verificate
in locale. Nessuna fase successiva pianificata.
