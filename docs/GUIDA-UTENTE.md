# Guida Utente — Gestionale ITI

Tutorial pratico per l'uso quotidiano del gestionale. Ogni sezione spiega
**cosa si può fare** e **come farlo**, pagina per pagina.

Se sei nuovo, leggi in ordine: **Login → Dashboard → Contatti → Gestione**.
Le altre sezioni (Immobili, Agenda, Task, Valutazioni, Alert, Impostazioni)
puoi consultarle quando ti serve.

---

## Indice

1. [Login e primo accesso](#1-login-e-primo-accesso)
2. [Dashboard](#2-dashboard)
3. [Contatti](#3-contatti)
   - 3.1 [Proprietari](#31-proprietari)
   - 3.2 [Acquirenti](#32-acquirenti)
   - 3.3 [Collaboratori](#33-collaboratori)
4. [Gestione — le tre pipeline](#4-gestione--le-tre-pipeline)
   - 4.1 [Kanban Proprietari](#41-kanban-proprietari)
   - 4.2 [Kanban "In Vendita"](#42-kanban-in-vendita)
   - 4.3 [Kanban "Venduto"](#43-kanban-venduto)
5. [Immobili](#5-immobili)
6. [Agenda](#6-agenda)
7. [Task](#7-task)
8. [Valutazioni](#8-valutazioni)
9. [Alert](#9-alert)
10. [Impostazioni](#10-impostazioni)
11. [Glossario](#11-glossario)

---

## 1. Login e primo accesso

**A cosa serve**: entrare nel gestionale con la tua email di agente.

**Come si fa**:
1. Apri il browser sulla URL del gestionale.
2. Inserisci **email** e **password** (te le fornisce l'amministratore).
3. Clicca **Accedi**.

> **Attenzione**: dopo 5 tentativi errati in 15 minuti l'accesso viene
> bloccato temporaneamente. Se non ricordi la password, clicca
> **"Password dimenticata?"** e segui le istruzioni via email.

Al logout la cache viene svuotata: se ti risloghi con un altro utente non
vedrai dati residui del precedente.

---

## 2. Dashboard

**A cosa serve**: colpo d'occhio quotidiano su cosa succede e cosa devi fare.

**Cosa trovi**:
- **KPI cards** in alto: lead attivi, appuntamenti oggi, task in sospeso.
- **Grafico settimanale** dell'attività.
- **Appuntamenti di oggi**: elenco degli eventi in agenda per la giornata.
- **Task in scadenza**: quelli da chiudere entro oggi/domani.
- **Alert card**: righe compatte per ogni immobile con problemi aperti; a
  destra un badge rosso col numero di problemi (documenti mancanti +
  segnalazioni). Click → apre l'immobile in **Gestione**.
- **Quick actions**: bottoni per creare velocemente un contatto o un task.

Sui dispositivi mobili trovi un **FAB (bottone flottante)** in basso a destra
per le azioni rapide.

---

## 3. Contatti

**A cosa serve**: gestire tutte le persone con cui l'agenzia interagisce.

Cliccando **Contatti** in sidebar arrivi su un'unica pagina con **tre tab**
in alto:

- **Proprietari** — chi ha un immobile da vendere
- **Acquirenti** — chi cerca un immobile da comprare
- **Collaboratori** — professionisti esterni (notai, geometri, banche…)

In ogni tab hai la lista, i filtri (agente, "solo caldi", ecc.), la barra di
ricerca e il pulsante **"Nuovo …"** — tutto sulla stessa riga.

### 3.1 Proprietari

**Cosa puoi fare**:
- Vedere la lista dei proprietari con nome, telefono, professione e
  eventuale ultima pratica.
- Filtrare per **agente** responsabile o mostrare **solo i "caldi"**.
- Cercare per nome, telefono, email.
- **Aprire la scheda** cliccando sulla riga.
- Creare un nuovo proprietario col bottone **"Nuovo Proprietario"** (solo
  anagrafica: nome, cognome, email, telefono, professione).

**Nella scheda del proprietario** trovi cinque tab:

| Tab | Cosa contiene |
|---|---|
| **Anagrafica** | Dati base, agente abbinato, flag **caldo**, promemoria di scadenza |
| **Task** | Elenco task collegati; puoi crearne uno nuovo |
| **Note** | Note interne datate + storico automatico |
| **Documenti** | Link alla cartella Drive del contatto |
| **Valutazioni** | Storico valutazioni + bottone "Nuova valutazione" (apre il wizard con il proprietario già selezionato) |

**Il flag "caldo"** è il momento chiave del flow:
- Un proprietario appena creato è "freddo": resta solo nella lista, non
  entra nel kanban.
- Quando decidi di lavorarci sul serio, apri la scheda → tab Anagrafica →
  attiva **caldo** (icona fiamma arancione).
- A questo punto nella lista appare accanto a lui il bottone arancione
  **"Avvia pratica"**.

**Cliccando "Avvia pratica"** ti chiede via/tipologia/città e crea una
pratica in **Gestione → Kanban Proprietari → colonna "Incontro/Sopralluogo"**.
Da qui in poi lavori sul kanban.

**Tasto scadenza** (nella scheda): apre un popover per scrivere un
promemoria con data → crea automaticamente un task legato al proprietario.

### 3.2 Acquirenti

**Cosa puoi fare**:
- Vedere la lista con budget, zone e tipologia ricercata.
- Filtrare per agente + filtri avanzati (budget/zona/tipologia/stato).
- Aprire la scheda di un acquirente (master-detail sulla stessa pagina).

**Nella scheda dell'acquirente** trovi:
- **Anagrafica** + preferenze di ricerca (budget, zone, tipologie).
- **Immobili collegati**: quelli associati manualmente.
- **Match perfetto** (bordo verde): immobili che rispettano **tutti** i
  criteri di ricerca dell'acquirente (budget + tipologia + zona).
- **Potrebbero interessare** (bordo ambra): immobili che rispettano
  **almeno due** criteri ma non tutti.
- **Documenti**: link alla cartella Drive del contatto.
- **Note** e **Task** collegati.

Per collegare un immobile a un acquirente usa il bottone **"Collega"** sulla
card dell'immobile suggerito.

### 3.3 Collaboratori

Lista semplice di contatti esterni con anagrafica, ruolo e note. Puoi
aggiungere/modificare/eliminare col bottone **"Nuovo Collaboratore"**.

---

## 4. Gestione — le tre pipeline

**A cosa serve**: il cuore operativo. Tre kanban in un'unica pagina che
seguono l'immobile dalla prima acquisizione fino al rogito.

Sidebar → **Gestione**. In alto un pill switcher con tre voci: **Proprietari
/ In Vendita / Venduto**. Accanto una barra di ricerca comune.

### 4.1 Kanban Proprietari

**Colonne**: Incontro/Sopralluogo → Rivalutazione → Presa in carico.

**Come ci arriva una pratica**:
- Vai in **Contatti → Proprietari**, marca il proprietario "caldo",
  clicca **"Avvia pratica"** → la pratica compare in
  **Incontro/Sopralluogo**.

**Come si sposta**:
- Trascina la card da una colonna all'altra col mouse.

**Cosa succede automaticamente**:
- Se un evento in agenda ha tipologia **"Rivalutazione"** ed è collegato
  alla pratica, la pratica si sposta da sola in **Rivalutazione**.
- Quando la card entra in **"Presa in carico"**, il sistema crea
  automaticamente il corrispondente **immobile** in Kanban "In Vendita",
  saltando la creazione manuale.

**Card**: mostra via/tipologia/città, proprietario, agente responsabile,
progresso documenti della fase corrente.

### 4.2 Kanban "In Vendita"

**Colonne (sottofasi)**: Preparazione → Pubblicato → In trattativa.
La posizione della card racconta a che punto sei col processo di vendita:
sto ancora raccogliendo carte, ho pubblicato l'annuncio, ho una proposta in
corso.

| Sottofase | Cosa succede qui |
|---|---|
| **Preparazione** | Raccolta documenti del proprietario (APE, atto notarile, planimetria, spese, antiriciclaggio, richiesta atti) + foto e video per l'annuncio. |
| **Pubblicato** | Annuncio online su Getrix e sui portali, cartello vendita esposto, apertura appuntamenti coi candidati acquirenti. |
| **In trattativa** | È arrivata una proposta d'acquisto: si raccolgono i documenti dell'acquirente (CI/tessera sanitaria, deposito cauzionale, Allegato A provvigioni). |

**Come funziona**:
- La colonna in cui appare una card è **calcolata automaticamente** in base
  ai documenti completati (la prima sottofase che ha ancora doc "Da fare"
  attira la card). Non c'è drag-drop.
- Clicca la card per aprire la **scheda dettaglio** a destra.

**Nella scheda dettaglio**:
- **Alert** manuali dell'immobile con testo libero + bottone "Risolvi".
- Blocco **Date chiave** (data preliminare, data atto) in read-only con
  tasto Modifica.
- **Checklist documenti** raggruppata per sottofase. Ogni riga:
  - **📎 (paperclip)** carica il file su Drive.
  - **☑ (checkbox)** marca il documento come "Fatto" (attivo solo dopo
    l'upload).
- Bottone **"Sposta in Venduto"** in fondo — al momento sposta sempre,
  senza vincoli di completezza (il gate documenti sarà riattivato quando
  il processo entra in produzione stabile).

### 4.3 Kanban "Venduto"

**Colonne (sottofasi)**: Vincolo → Preliminare → Rogito → Archivio.

- Le prime tre sottofasi funzionano come "In Vendita" (posizione
  calcolata dai documenti).
- Un immobile finisce in **Archivio** automaticamente quando compili la
  **data atto** nella sheet (rogito notarile avvenuto).

---

## 5. Immobili

**A cosa serve**: lista di consultazione di tutti gli immobili (attivi e
venduti). Le operazioni di pipeline vivono in **Gestione**.

Sidebar → **Immobili**. Trovi:
- Pill **In Vendita / Venduti** per filtrare.
- Barra di ricerca (titolo, zona, indirizzo).
- Bottone **stellina** accanto alla ricerca → gestisce quali immobili
  compaiono "in evidenza" sul sito pubblico (max 3).
- Righe della tabella con azioni per immobile: gestione unità, open house,
  visibilità sito, evidenza, marca venduto, modifica scheda, elimina.

> **Nota**: gli immobili **non si creano più manualmente** dal gestionale.
> Nascono automaticamente quando una pratica proprietario raggiunge la fase
> "Presa in carico" nella Kanban Proprietari.

**Modifica scheda immobile**: click sull'icona matita in riga apre il
**Wizard immobile** (5 step: dati base, descrizione, foto, comfort, prezzi).

---

## 6. Agenda

Calendario drag-drop con eventi. Tipologie di evento: **Chiamata,
WhatsApp, Appuntamento, Rivalutazione**.

- Crea un evento cliccando sul calendario o sul bottone "+".
- Se colleghi l'evento a una **pratica proprietario** e usi tipologia
  **Rivalutazione**, la pratica si sposta automaticamente nella colonna
  Rivalutazione della Kanban Proprietari.
- Nella scheda di una **valutazione** un banner riepiloga gli eventi
  collegati.

---

## 7. Task

Lista/board dei task con filtri per data e agente. Stati: **Da fare / In
corso / Completata**.

- Crea un task da qualsiasi scheda (proprietario, acquirente, immobile) o
  direttamente dalla pagina Task.
- I task con scadenza oggi/domani appaiono anche nella Dashboard.

---

## 8. Valutazioni

Elenco di tutte le valutazioni AI emesse.

**Nuova valutazione**:
- Dalla pagina Valutazioni → bottone Nuova → wizard 4 step (Lead → Immobile
  → Comfort → Stima & AI).
- Oppure dalla **scheda del proprietario** → tab Valutazioni → "Nuova
  valutazione": il wizard parte con il proprietario già selezionato.

**Report pubblico**: ogni valutazione genera una URL condivisibile e un
PDF scaricabile. Entrambi riportano in fondo il disclaimer **"Valutazione
realizzata con l'ausilio di intelligenza artificiale e revisionata da Il
Tuo Immobiliare"** — obbligatorio per l'AI Act.

---

## 9. Alert

**A cosa serve**: vedere in un colpo d'occhio tutti gli immobili con
qualcosa da sistemare (documenti da caricare, fasi ferme, promemoria
manuali).

Sidebar → **Alert** (icona campanella; badge rosso col numero totale).

**Struttura**:
- Sezione **"Immobili con alert"**: una card per immobile con
  titolo/indirizzo, fase corrente, badge conteggio problemi. All'interno
  della card:
  - **Documenti da caricare** (lista puntata dei doc "Da fare").
  - **Documenti non ancora in checklist** (se il catalogo è stato
    aggiornato).
  - Eventuale messaggio di **stagnazione** (immobile fermo da X giorni).
  - Eventuali **alert manuali** con bottone "Risolvi".
  - Click sulla card → apre l'immobile in **Gestione**.
- Sezione **"Pratiche proprietari ferme"**: card separate per le pratiche
  che si sono fermate troppo a lungo in una fase.

Le soglie di stagnazione sono configurabili in **Impostazioni** (solo
Admin).

---

## 10. Impostazioni

**Solo Admin.**

Contiene:
- **Profilo agente** (sposato qui dalla Dashboard).
- **Report KPI** — statistiche di produzione per agente/periodo.
- **Regole di alert automatico** — soglie giorni di stagnazione per ogni
  fase di ogni pipeline (immobili + proprietari), con destinatario (tutti /
  solo agente responsabile) e switch attiva/disattiva.

---

## 11. Glossario

- **Pratica proprietario**: fascicolo di lavorazione di un proprietario
  "caldo" che ha un immobile da vendere; fasi Incontro/Sopralluogo →
  Rivalutazione → Presa in carico.
- **Caldo**: flag manuale per marcare un proprietario su cui vuoi
  lavorare adesso; solo i caldi possono avere una pratica.
- **Immobile in vendita**: immobile per cui l'agenzia ha ricevuto mandato
  e sta cercando un acquirente.
- **Preliminare**: contratto tra venditore e acquirente che impegna al
  rogito; segna il passaggio Kanban "In Vendita" → "Venduto".
- **Rogito / Atto**: firma notarile definitiva; segna l'arrivo in
  Archivio.
- **Match perfetto** / **Potrebbero interessare**: tier di suggerimento
  automatico immobili↔acquirenti (§3.2).
- **Gestione**: pagina che contiene le tre kanban del flusso operativo
  (Proprietari, In Vendita, Venduto).
