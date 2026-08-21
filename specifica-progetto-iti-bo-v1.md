# Specifica di Progetto — Evoluzione Gestionale ITI-BO

**Versione**: 1.0 — documento iniziale, da integrare
**Stato**: Bozza di lavoro. Alcune decisioni sono confermate, altre restano aperte fino al meeting del 20/21 settembre con l'agenzia — sono segnalate esplicitamente come tali.

> **Nota per chi legge questo documento (incluso Claude Code)**: questo è un documento di intenti e requisiti, scritto senza accesso diretto alla codebase. Descrive **cosa** deve esistere e **perché**, non **come** implementarlo nel dettaglio del codice esistente. Il primo compito è integrare questo documento con la conoscenza reale dello stack, delle convenzioni e della struttura del repository (vedi TRD di progetto), producendo una versione aggiornata che tenga conto di entrambi.

---

## 1. Obiettivo generale

ITI-BO è il CRM/gestionale back-office di un'agenzia immobiliare (Il Tuo Immobiliare, Bergamo), già sviluppato e in uso quotidiano dal team. L'obiettivo di questa fase è **far evolvere il sistema da un modello centrato sul contatto (lead-centrico) a un modello centrato sull'immobile (property-centrico)**, introducendo al contempo permessi differenziati per ruolo, una gestione documentale reale collegata a ogni pratica, e alcune automazioni operative.

Non è un rifacimento da zero: è un'evoluzione di un sistema che funziona, fatta senza interrompere l'uso quotidiano del team.

---

## 2. Contesto

- Il gestionale gira su un'architettura serverless (frontend React, database Supabase/Postgres, hosting Netlify)
- Il team è già operativo sul database in produzione, ogni giorno — qualunque modifica strutturale va sviluppata e verificata prima altrove, mai direttamente in produzione
- Esiste un sito pubblico collegato (ITI2.0) che legge dati dal medesimo progetto Supabase — qualsiasi cambiamento a dati esposti pubblicamente (es. stato dell'immobile) deve tenerne conto
- Lo sviluppo è svolto da un solo sviluppatore, con l'ausilio di Claude Code — le scelte architetturali tengono conto di questo (preferenza per soluzioni gestibili da una persona sola, non per pattern pensati per team grandi)
- Il progetto procede a fasi con budget e tempistiche concordati per fase, non un unico grande rilascio

---

## 3. Cosa deve necessariamente esserci

### 3.1 Modello dati centrato sull'immobile

- L'immobile è l'entità centrale del sistema: proprietario, acquirenti interessati, documenti, stato della pratica sono tutti collegati all'immobile, non il contrario
- Decisione presa e chiusa: non viene introdotta una tabella "persona"/anagrafica dedicata separata. L'anagrafica **Proprietario** e quella **Acquirente** restano sulla tabella `leads` già esistente; il ruolo è distinto tramite il campo `tipo_cliente` ('Acquirente'/'Proprietario'/'Ibrido'), non da un'entità a parte
- Il collegamento immobile → proprietario è una foreign key reale, non più un campo testo libero: `immobili.proprietario_id` referenzia `leads.id`, vincolo già in vigore nel database attuale
- Gli **Acquirenti** restano concettualmente distinti dai Proprietari per ruolo, pur condividendo la stessa tabella `leads`: la stessa persona può assumere entrambi i ruoli in momenti diversi, ed è per questo che il ruolo è modellato come attributo (`tipo_cliente`) legato alla transazione, non come identità di tabelle separate

### 3.2 Pipeline a 4 fasi macro, con sotto-fasi e checklist documentale

Confermato dal meeting con l'agenzia — questa è la struttura di riferimento, non ipotetica:

| Fase | Cosa succede | Sotto-fasi operative | Documenti da tracciare |
|---|---|---|---|
| **1 — Immobile da prendere** (Acquisizione) | Dal primo contatto all'acquisizione dell'incarico | Contatto → Incontro → Sopralluogo → Rivalutazione → Presa in carico | Doc Valutazione, Privacy proprietario firmata, Incarico di mediazione firmato, CI/CF proprietario |
| **2 — In vendita** (Marketing e trattativa) | Materiale pubblico, gestione visite fino all'offerta | Burocratiche (recupero documenti), Marketing (foto/video/annuncio), Appuntamenti (visite) | Atto notarile di provenienza, Planimetria e visure, APE, Modulo antiriciclaggio proprietario, Spese condominiali/verbale assemblea, Richiesta accesso agli atti — poi, alla proposta: documento proposta d'acquisto, documenti acquirente (CI/tessera sanitaria), copia assegno/deposito cauzionale, Allegato A provvigioni |
| **3 — Venduti** (Post-vendita e rogito) | Offerta accettata, iter notarile | Vincolo (mutuo/perizia), Preliminare, Rogito/Atto notarile | Doc Preliminare, Fattura agenzia, Versamento caparra, Modulo antiriciclaggio acquirente, Liberatoria condominiale, Verifica stati civili, IBAN saldo/mutuo, Atto di provenienza |
| **4 — Archivio** | L'immobile esce dal cruscotto operativo | — | Copia Atto Notarile definitivo |

Ogni sotto-fase/documento ha uno stato (fatto/da fare) e, dove sensato, un responsabile assegnato — questo è il meccanismo che sostituisce il "le informazioni vivono nella testa dei soci".

### 3.3 Interfaccia principale a Kanban

Dashboard a colonne (una per le 4 fasi macro), che dà visione immediata dello stato di ogni immobile. Deve essere possibile vedere, per ogni card immobile, un indicatore sintetico di avanzamento (es. quante sotto-fasi/documenti completati su totale) senza dover aprire la scheda.

### 3.4 Permessi differenziati su tre livelli

- **Titolari (Admin)**: visione totale su tutti gli immobili, i relativi dati economici (provvigioni, fatturato) e tutti gli agenti
- **Agenti**: visione limitata esclusivamente agli immobili a loro assegnati e ai relativi clienti — non devono poter vedere né modificare pratiche non proprie
- **Segreteria/Amministrazione**: accesso documentale e organizzativo (smistamento lead, caricamento pratiche), **esplicitamente esclusa** dalla visualizzazione di informazioni riservate su provvigioni/fatturato, salvo autorizzazione esplicita

Questo va implementato come controllo reale (a livello di RLS/backend), non solo come restrizione visiva nell'interfaccia.

### 3.5 Gestione documentale su Google Drive

Decisione presa: i file restano su Google Drive (non su Supabase Storage), ma con un'integrazione reale — non semplici link condivisi a una cartella generica. Ogni immobile ha una propria sottostruttura di cartelle su Drive, organizzata per fase/tipo documento secondo la tabella al punto 3.2, con upload e consultazione possibili direttamente dalla scheda immobile nel gestionale.

Il collegamento tra il controllo di accesso ai documenti (in particolare quelli riservati, come l'Allegato A provvigioni) e i permessi differenziati per ruolo del punto 3.4 è escluso dal perimetro di questa fase: è rimandato esplicitamente a una lavorazione futura separata, non pianificata. La gestione documentale di questa fase si basa solo sull'autenticazione dell'utente (qualunque utente autenticato può caricare/consultare i documenti), non su un controllo differenziato per ruolo.

### 3.6 Automazioni operative

Due automazioni richieste esplicitamente dall'agenzia:

- **Alert di ribasso**: se un immobile resta nella fase "In Vendita" per più di 60 giorni senza passare a "Venduto", il sistema genera un avviso visibile all'agente responsabile, suggerendo di contattare il proprietario per valutare un ribasso
- **Incrocio dati / matching**: confrontare la lista di potenziali acquirenti (appuntamenti papabili, lead con ricerca attiva) con gli immobili disponibili per zona/budget, per suggerire automaticamente abbinamenti

### 3.7 Ambiente di sviluppo isolato

Ambiente locale via Docker (Supabase CLI), usato dall'unico sviluppatore per scrivere e verificare ogni modifica strutturale prima di applicarla in produzione. Non è previsto un secondo progetto Supabase cloud dedicato allo staging.

---

## 4. Soluzioni architetturali già scelte

Queste non sono da rimettere in discussione, sono decisioni prese:

- **Staging**: locale via Docker/Supabase CLI, non un secondo progetto Supabase cloud
- **Storage documenti**: Google Drive, tramite pattern Frontend → Edge Function (proxy autorizzato) → Google Apps Script Web App → Drive. Nessuna libreria/SDK Google (`googleapis`, OAuth2, service account) nel repository — le credenziali Google restano confinate dentro l'Apps Script, gestito fuori dal repo. Frontend ed Edge Function comunicano solo tramite un token condiviso verso l'URL `/exec` del Web App
- **Apps Script Web App**: scritto da zero per questo progetto (non riuso diretto di script da altri progetti, anche se il pattern architetturale è preso da un progetto precedente con dominio diverso)
- **Modello stati**: 4 fasi macro con sotto-fasi/checklist annidate (non un unico campo enum con 9 valori piatti, ipotesi precedente ormai superata da quanto emerso in riunione)
- **Hosting**: invariato, resta su Netlify

---

## 5. Cosa evitare esplicitamente

- **Non toccare la logica di valutazione AI esistente** (Edge Function `generate-evaluation` e le altre collegate a servizi esterni) in questa fase — restano come sono, non vanno modificate né usate come riferimento per il nuovo lavoro
- **Non introdurre Supabase Storage** per i documenti — è stato scartato a favore di Drive, non va riproposto
- **Non replicare 1:1 pattern da altri progetti**: eventuali riferimenti architetturali (es. il pattern Edge Function → Apps Script) vanno adattati al dominio e ai vincoli di ITI-BO, non copiati meccanicamente — in particolare la granularità dei permessi qui richiesta (agente limitato ai propri immobili) è più stringente di quanto visto altrove
- **Non esporre dati interni sensibili sul sito pubblico ITI2.0**: qualunque cambiamento allo stato/fase dell'immobile deve mantenere una distinzione netta tra cosa è visibile pubblicamente e cosa resta solo interno (es. una pratica "in attesa di rogito" non deve necessariamente comparire come tale sul sito pubblico)
- **Non applicare modifiche strutturali direttamente in produzione**: tutto passa prima dall'ambiente Docker locale
- **Non hardcodare mai segreti** (token Drive, chiavi di servizio) nel codice o nei file committati — solo come variabili d'ambiente/secret
- **Non dare per scontato l'accesso completo ai dati economici**: qualsiasi nuova vista, report o export deve rispettare i tre livelli di permesso fin dalla progettazione, non aggiungerli dopo
- **Non ampliare lo scope oltre quanto concordato per fase**: automazioni, matching, e le altre funzionalità elencate sono nel perimetro concordato — nuove richieste emerse in corsa vanno segnalate come extra, non assorbite silenziosamente nel lavoro in corso
- **Non assumere che il modello a 9 stati (ipotesi precedente) sia ancora valido**: è stato superato dal modello a 4 fasi + sotto-fasi confermato in riunione

---

## 6. Decisioni ancora aperte (da chiudere entro il meeting del 20/21 settembre)

- Livello esatto di dettaglio della struttura cartelle su Drive (una cartella per immobile con sottocartelle per fase, come da ipotesi corrente — da confermare col team)
- Dettaglio esatto della logica di matching (criteri di zona/budget, soglie di somiglianza) per l'automazione di incrocio dati
- Perimetro economico: il documento di riunione stima ~1.200€ per la prima fase e ~2.000€ per il progetto completo — quest'ultima cifra sembra sottostimata rispetto a quanto qui descritto (permessi granulari, due automazioni, gestione documentale reale, provvigioni) e va rivista esplicitamente con l'agenzia prima di procedere oltre la prima fase

---

## 7. Riferimenti

- TRD di progetto (struttura repo, stack tecnico, convenzioni di sviluppo, schema dati attuale) — da consultare e integrare con questo documento
- Documento di riunione con l'agenzia (11/09, sintesi del flusso di lavoro a 4 fasi, permessi, automazioni)
- Documento di riferimento per il pattern storage Drive (da altro progetto — solo come riferimento architetturale, non da copiare)
