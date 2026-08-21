# Google Apps Script — gestione documentale su Drive

Sorgente di riferimento per il Web App Apps Script usato dal pattern
`Frontend → Edge Function Supabase → questo Web App → Drive`
(vedi `specifica-progetto-iti-bo-v1.md` §3.5, §4).

Questo script **non viene deployato da questo repository**: vive solo su
[script.google.com](https://script.google.com). Il file `.gs` qui dentro è
versionato solo come sorgente di riferimento, da copiare manualmente
nell'editor Apps Script (o sincronizzare con `clasp` se preferito in futuro).

## Struttura cartelle (decisa 2026-08-20 — da riconfermare comunque col team)

```
ROOT_FOLDER_ID
  └── {immobileId} - {titolo}             # una cartella per immobile, tutte le fasi insieme
        └── {documento} - {indirizzo}.ext  # es. "APE - Via Colle Aperto 12.pdf"
```

Ogni documento della checklist ha nome univoco per immobile (vincolo DB
`immobile_documenti_immobile_id_documento_key`), quindi un'unica cartella per
immobile senza sottocartelle per fase non crea collisioni. La fase viene comunque
inviata e salvata come descrizione del file su Drive (`Fase: In Vendita`), utile
per consultazione manuale.

Un nuovo upload per lo stesso documento **sostituisce** il file precedente,
anche se nel frattempo l'indirizzo dell'immobile (e quindi il nome file) è
cambiato: la ricerca del file da sostituire avviene per prefisso
(`{documento} - `), non per nome file esatto.

## Setup

1. Crea un progetto Apps Script standalone su script.google.com, incolla il
   contenuto di `DocumentiDrive.gs`.
2. Crea su Google Drive una cartella dedicata (es. "ITI-BO Documenti
   Immobili") con l'account Google che eseguirà lo script; copiane l'ID dalla URL.
3. In **Impostazioni progetto → Proprietà script**, aggiungi:
   - `ROOT_FOLDER_ID` — l'id della cartella del punto 2
   - `SHARED_TOKEN` — un token segreto lungo e casuale (es. `openssl rand -hex 32`).
     Non va mai scritto nel codice né nel repository.
4. **Distribuisci → Nuova implementazione**:
   - Tipo: **Applicazione web**
   - Esegui come: **Me**
   - Chi ha accesso: **Chiunque abbia il link** (il controllo di accesso reale
     è il `SHARED_TOKEN` verificato ad ogni richiesta — i file su Drive restano
     privati, non vengono mai condivisi via link pubblico)
5. Copia l'URL `.../exec` generato: servirà come variabile d'ambiente
   dell'Edge Function proxy (non ancora creata), es. `DRIVE_WEBAPP_URL`.
   Il `SHARED_TOKEN` va salvato come secret Supabase (`supabase secrets set`),
   mai committato.

## Azioni esposte

Richieste `POST` con body JSON `{ "token": "...", "action": "...", ... }`.
Risposta sempre `200` con `{ ok: true|false, ... }` — Apps Script non permette
status HTTP diversi da 200 per i Web App, quindi il chiamante (Edge Function)
deve controllare il campo `ok`.

### `upload`
```json
{
  "token": "...",
  "action": "upload",
  "immobileId": "uuid",
  "immobileTitolo": "Trilocale in Città Alta",
  "immobileIndirizzo": "Via Colle Aperto 12",
  "fase": "Acquisizione",
  "documento": "Doc Valutazione",
  "fileName": "valutazione.pdf",
  "mimeType": "application/pdf",
  "fileBase64": "..."
}
```
→ `{ "ok": true, "fileId": "...", "fileName": "Doc Valutazione.pdf" }`

### `getDownload`
```json
{ "token": "...", "action": "getDownload", "fileId": "..." }
```
→ `{ "ok": true, "fileName": "...", "mimeType": "...", "fileBase64": "..." }`

Il download restituisce i byte del file (non un link Drive): il controllo
permessi (§3.4 — ruoli agente/segreteria/admin, documenti riservati come
l'Allegato A provvigioni) resta interamente nell'Edge Function, che decide se
autorizzare la richiesta prima di inoltrarla qui.

## Test manuale rapido

```bash
curl -s -X POST "$DRIVE_WEBAPP_URL" \
  -H "Content-Type: application/json" \
  -d '{"token":"IL_TUO_TOKEN","action":"upload","immobileId":"test-123","immobileTitolo":"Prova","immobileIndirizzo":"Via di Prova 1","fase":"Acquisizione","documento":"Test Doc","fileName":"test.txt","mimeType":"text/plain","fileBase64":"'"$(echo -n 'ciao' | base64)"'"}'
```

## Debito noto / prossimi passi

- L'Edge Function proxy (`supabase/functions/drive-documenti/`) e il rewiring
  di `PipelineDetailSheet.tsx` sono completi e testati end-to-end (locale +
  Drive reale) — Supabase Storage non è più usato per i documenti.
- Nessuna azione di cancellazione file esposta (fuori scope per ora).
- Struttura cartelle e naming file decisi il 2026-08-20, da riconfermare
  comunque col team entro il meeting del 20/21 settembre (vedi
  `specifica-progetto-iti-bo-v1.md` §6).
- `profili_agenti` ha ora un campo `ruolo` (Admin/Agente/Segreteria), ma il
  controllo d'accesso ai documenti su base ruolo (segreteria senza accesso ai
  documenti riservati, spec §3.4) resta esplicitamente fuori dal perimetro di
  questa fase: l'Edge Function continua a controllare solo che l'utente sia
  autenticato. Il collegamento ruolo → permessi documentali è rimandato a una
  lavorazione futura separata, non è un debito/TODO imminente.
