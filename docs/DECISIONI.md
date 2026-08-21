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

## 2026-08-21 — Nessun meccanismo di "silenziamento" alert in questo giro

**Decisione**: un alert manuale può solo essere creato o risolto (`risolto = true`); un alert
automatico non può essere "silenziato" temporaneamente — resta visibile finché la condizione che
lo genera (fase ferma, documento mancante) non cambia.

**Perché**: era una delle domande esplicitamente lasciate aperte nel design proposto, non
risposta dall'utente. Un meccanismo di silenziamento per gli alert automatici (calcolati, non
persistiti) avrebbe richiesto comunque una tabella di stato dedicata solo per questo — complessità
non giustificata finché non emerge un caso d'uso reale in cui un alert automatico va ignorato a
lungo senza che la condizione sottostante cambi.
