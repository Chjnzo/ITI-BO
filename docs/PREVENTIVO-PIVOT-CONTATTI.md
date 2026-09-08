# Pivot Proprietari/Compratori/Collaboratori — riepilogo per preventivo

> Documento pensato per essere condiviso con chi sta preparando il preventivo. Riassume cosa è
> già stato fatto e cosa resta da fare per il pivot in corso sul gestionale ITI-BO. Non è un
> documento tecnico di riferimento permanente — per quello vedi `docs/STATO.md` e
> `docs/DECISIONI.md` nel repository, che restano la fonte aggiornata.

## Contesto

**ITI-BO** è il CRM/Back Office di ITI (Il Tuo Immobiliare), agenzia immobiliare di Bergamo —
React 19 + Vite + TypeScript + Tailwind, database Supabase (Postgres). Un secondo progetto
sibling, **ITI2.0**, è il sito pubblico dell'agenzia (form di contatto, schede immobili, open
house) e condivide lo stesso database Supabase.

Oggi il gestionale ha un'unica tabella `leads` (con un campo che distingue Acquirente/
Proprietario/Ibrido) per gestire sia i potenziali compratori sia i proprietari che vogliono
vendere casa. Il cambiamento richiesto trasforma il modello: i proprietari diventano il **punto
focale** del gestionale, con una gestione dedicata (tipo kanban) fino alla firma della presa
d'incarico; da quel momento in poi nasce l'immobile da gestire nel modulo immobili esistente.

## Stato: 2026-08-21 — solo pianificazione, nessun codice scritto

Tutto il lavoro fatto finora è **design e allineamento sui requisiti**, nessuna riga di codice o
migration database applicata per questo pivot. Fatto fino ad oggi:

- Raccolta requisiti e chiarimento di tutti i punti aperti con il cliente (struttura dati, ruoli,
  automazioni, filtri).
- Scelte tecniche di architettura (come collegare in modo pulito task/note/appuntamenti a
  qualunque tipo di contatto; come gestire i contatti "ibridi" già esistenti; come non impattare
  il sito pubblico).
- Verifica che il sito pubblico ITI2.0 **non richiede modifiche di codice**: il modulo di
  contatto generico da homepage ha già il selettore "voglio comprare / voglio vendere" e lo invia
  già al backend — basta cambiare cosa succede lato database, non il sito.
- Piano di lavoro a 7 fasi condiviso e concordato con il cliente (elencato sotto).
- Documentazione interna aggiornata (roadmap, log decisioni).

**Nulla di quanto segue è ancora stato implementato.**

## Cosa resta da fare, a fasi

### Fase 1 — Fondamenta dati (schema database)
- Creare 3 nuove tabelle anagrafiche separate: **Proprietari**, **Compratori**, **Collaboratori**
  (quest'ultima per notai, certificatori, responsabili portali immobiliari, ecc. — tabella
  nuova, senza dati storici).
- Creare una tabella pipeline dedicata **Proprietari → Pratiche**: rappresenta il percorso di
  ogni immobile in acquisizione (4 fasi: Contatto, Incontro/Sopralluogo, Rivalutazione, Presa in
  carico), con via e tipologia dell'immobile raccolte lì (un proprietario può avere più immobili,
  quindi più pratiche).
- Scrivere lo script di migrazione dei dati esistenti dalla vecchia tabella `leads` verso le 3
  nuove tabelle (inclusa la gestione dei contatti "ibridi" — chi oggi è sia compratore che
  potenziale venditore viene duplicato in entrambe le nuove tabelle, e le sue task/note/
  appuntamenti storici vengono duplicati di conseguenza).
- Aggiornare le tabelle collegate oggi ai lead (task, note, appuntamenti, valutazioni, interesse
  su un immobile) per puntare alle nuove tabelle.
- **Rischio/complessità**: media-alta — tocca dati di produzione reali, richiede test approfonditi
  prima di applicare in produzione (ambiente locale di test già disponibile per questo).

### Fase 2 — Backend/automazione form pubblico
- Aggiornare la funzione database che riceve i contatti dal sito pubblico ITI2.0, perché scriva
  nelle nuove tabelle invece che nella vecchia `leads` (il sito pubblico stesso non cambia).
- **Rischio/complessità**: bassa — funzione isolata, comportamento visibile esternamente
  invariato.

### Fase 3 — Interfaccia sezione "Contatti"
- La sezione attuale "Lead" si divide in due viste separate: **Compratori** e **Collaboratori**
  (non esiste più una vista unica con tutti insieme).
- Nuova interfaccia di gestione (creazione/modifica/elenco) per i Collaboratori, che oggi non
  esiste in alcuna forma.
- **Rischio/complessità**: media — riuso di componenti esistenti ma con separazione della logica
  oggi unificata.

### Fase 4 — Nuovo modulo "Proprietari"
- Nuova pagina con vista kanban (4 colonne) e vista lista, con filtro per agente.
- Alla firma della presa d'incarico (spostamento nella colonna finale) si crea **in automatico**
  il nuovo immobile da gestire, con verifica che i dati minimi (via, tipologia) siano stati
  inseriti prima di poter procedere.
- **Rischio/complessità**: medio-alta — modulo nuovo, pattern già visto nel kanban immobili
  esistente ma da adattare.

### Fase 5 — Adeguamento gestione immobili
- Rimozione della fase "Acquisizione" dal percorso attuale degli immobili (ora gestita
  interamente dal nuovo modulo Proprietari).
- Da definire con il cliente in questa fase: quali nuovi documenti aggiungere al percorso
  immobile, e come trattare gli immobili oggi già in fase "Acquisizione" in produzione al momento
  del passaggio al nuovo sistema.
- **Rischio/complessità**: media — tocca un modulo già in produzione e usato quotidianamente.

### Fase 6 — Ruoli e permessi (Admin / Agente / Segreteria)
- Nuova schermata in Impostazioni per l'Admin, per assegnare il ruolo a ogni utente registrato.
- Definizione (con il cliente) di chi può fare cosa per ogni funzionalità, poi implementazione
  dei relativi controlli di sicurezza a livello di database.
- **Rischio/complessità**: medio-alta — richiede una sessione dedicata per definire la matrice dei
  permessi prima di implementare, più collaudo per ruolo dopo l'implementazione (prassi già
  seguita in passato su questo progetto per modifiche di sicurezza).

### Fase 7 — Motore di alert configurabile
- Oggi gli alert (es. "immobile fermo in una fase da troppo tempo") hanno soglie fisse scritte nel
  codice. Si passa a un sistema dove l'Admin può configurare da interfaccia, per ogni fase (sia
  dei Proprietari che degli Immobili), dopo quanti giorni scatta un alert e a chi va notificato
  (l'agente responsabile, tutti, o altro).
- Riscrittura della pagina Alert esistente per diventare questo pannello di configurazione, oltre
  a continuare a mostrare gli alert attivi.
- **Rischio/complessità**: media — generalizza una logica già esistente, ma cambia il modello da
  "regole fisse nel codice" a "regole a database".

## Moduli/pagine esistenti impattati (per stima di scala)

Il pivot non è un modulo isolato: toca superfici già in produzione e usate quotidianamente dagli
agenti — in particolare la pagina Lead (oggi ~2200 righe di codice, la più grande del progetto),
la finestra di creazione/modifica task, la Dashboard, l'agenda/appuntamenti, le valutazioni
immobiliari con AI, e l'intero modulo Kanban immobili (già di per sé un sistema con pipeline,
checklist documentale e alert automatici).

## Punti ancora aperti (potrebbero far cambiare la stima)

- Elenco esatto dei nuovi documenti da aggiungere al percorso immobili (Fase 5).
- Trattamento degli immobili oggi già "in Acquisizione" in produzione al momento del cutover
  (Fase 5).
- Matrice permessi concreta per i 3 ruoli, tabella per tabella (Fase 6) — da definire con il
  cliente prima di iniziare quella fase.
