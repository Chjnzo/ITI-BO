# Come cambiare la cartella Google Drive dei documenti immobili

> Dettaglio tecnico denso richiamato da `google-apps-script/README.md`. La cartella Drive usata
> oggi (`ROOT_FOLDER_ID` impostato nelle Proprietà script di `DocumentiDrive.gs`) è **una
> cartella di prova**, creata per sviluppare e collaudare l'integrazione. Quando l'agenzia avrà
> creato la cartella reale (dopo l'incontro col team), va sostituita seguendo questa guida.

## Cosa NON serve fare

Nessun file di questo repository contiene l'ID della cartella Drive. Non serve una PR, non
serve una migration, non serve toccare `PipelineDetailSheet.tsx`, l'Edge Function
`drive-documenti/`, né `DocumentiDrive.gs`. L'ID vive **solo** come proprietà del progetto
Apps Script (`ROOT_FOLDER_ID`, letta a runtime da `PropertiesService.getScriptProperties()` —
vedi `google-apps-script/DocumentiDrive.gs:126`), fuori da questo repository.

## Passi per il cambio

1. **Crea (o fatti creare) la cartella Drive definitiva** con l'account Google che esegue lo
   script Apps Script (lo stesso account con cui è stato fatto il deploy — vedi
   `google-apps-script/README.md` §Setup punto 2).
2. Apri la cartella su Google Drive, copia l'ID dalla URL:
   `https://drive.google.com/drive/folders/`**`QUESTO_È_L_ID`**.
3. Vai sul progetto Apps Script ([script.google.com](https://script.google.com)) →
   **Impostazioni progetto** (icona ingranaggio) → **Proprietà script**.
4. Modifica il valore di `ROOT_FOLDER_ID` con il nuovo ID copiato al punto 2. Salva.
5. **Non serve una nuova implementazione (deploy)** per questo cambio: `PropertiesService` viene
   letto ad ogni esecuzione, non è "congelato" nel deploy attivo come il codice dello script.
6. Verifica: carica un documento di test da `/immobili` → scheda pipeline di un immobile
   qualsiasi → conferma che appaia nella cartella nuova (`{immobileId} - {titolo}` sotto la
   nuova radice, vedi struttura in `google-apps-script/README.md`).
7. Sposta o elimina i file della cartella di prova, se non servono più — sono dati di sviluppo,
   non c'è nulla da migrare verso la cartella reale (i file "veri" nasceranno direttamente lì da
   quel momento in poi).

## Se invece cambia l'account Google che esegue lo script

Caso diverso dal semplice cambio cartella (es. l'agenzia vuole che sia un account aziendale
dedicato a possedere lo script, non l'account personale usato in sviluppo): in questo caso va
rifatto l'intero **Setup** di `google-apps-script/README.md` (nuovo progetto Apps Script sotto
il nuovo account, nuova implementazione Web App, nuovo `SHARED_TOKEN`, nuovo `ROOT_FOLDER_ID`),
e poi aggiornati due secret Supabase usati dall'Edge Function `drive-documenti/`:

```bash
supabase secrets set DRIVE_WEBAPP_URL="<nuovo URL .../exec>"
supabase secrets set SHARED_TOKEN="<nuovo token>"
```

(nomi esatti delle variabili da confermare leggendo `supabase/functions/drive-documenti/` al
momento del cambio — non irrigiditi qui perché potrebbero evolvere prima che questo scenario si
presenti davvero).

## Perché è così semplice

La cartella Drive non è mai stata un valore hardcoded nel codice applicativo proprio per
permettere questo tipo di cambio senza toccare il repository — è stata deliberatamente tenuta
come configurazione esterna (proprietà script), non come costante nel sorgente.
