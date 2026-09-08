/**
 * ITI-BO — Web App Apps Script per la gestione documentale su Google Drive.
 *
 * Pattern (vedi specifica-progetto-iti-bo-v1.md §4):
 *   Frontend → Edge Function Supabase (proxy autorizzato) → questo Web App → Drive
 *
 * Questo script vive SOLO su script.google.com (Apps Script), non viene deployato
 * da questo repository: è versionato qui solo come sorgente di riferimento.
 * Le credenziali Google restano confinate qui dentro via Script Properties — non
 * finiscono mai nel repository, nel frontend o nell'Edge Function.
 *
 * Script Properties richieste (Impostazioni progetto → Proprietà script):
 *   - SHARED_TOKEN   token segreto condiviso con l'Edge Function (stringa lunga
 *                    generata a caso, es. `openssl rand -hex 32`)
 *   - ROOT_FOLDER_ID id della cartella Drive radice sotto cui vivono tutte le
 *                    sottocartelle per immobile (creare una cartella dedicata,
 *                    es. "ITI-BO Documenti Immobili", e incollarne l'id qui)
 *
 * Struttura cartelle (2026-09-08):
 *   ROOT_FOLDER_ID
 *     └── {titolo}                                        (una cartella per immobile,
 *                                                          creata proattivamente
 *                                                          all'ingresso in gestione;
 *                                                          nome = solo titolo, no UUID)
 *           └── {documento} - {indirizzo}.ext             (nome file standardizzato,
 *                                                          es. "APE - Via Colle Aperto 12.pdf")
 *
 * Deploy: Distribuisci → Nuova implementazione → Tipo "Applicazione web".
 *   - Esegui come: Me (proprietario dello script)
 *   - Chi ha accesso: Chiunque abbia il link (il controllo accessi reale è il
 *     token condiviso verificato in ogni richiesta, non i permessi di condivisione
 *     Drive — i file restano privati, non vengono mai resi pubblici o condivisi
 *     via link)
 */

const FASI_VALIDE = ['In Vendita', 'Venduto'];

function doPost(e) {
  let payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return risposta_({ ok: false, error: 'Body non è JSON valido.' });
  }

  if (!verificaToken_(payload.token)) {
    return risposta_({ ok: false, error: 'Token non valido.' });
  }

  try {
    switch (payload.action) {
      case 'createFolder':
        return risposta_(azioneCreateFolder_(payload));
      case 'upload':
        return risposta_(azioneUpload_(payload));
      case 'getDownload':
        return risposta_(azioneGetDownload_(payload));
      default:
        return risposta_({ ok: false, error: `Azione sconosciuta: ${payload.action}` });
    }
  } catch (err) {
    return risposta_({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  const token = e.parameter.token;
  if (!verificaToken_(token)) {
    return risposta_({ ok: false, error: 'Token non valido.' });
  }
  return risposta_({ ok: true, status: 'up' });
}

// --- Azioni ---------------------------------------------------------------

/**
 * Crea (o riusa se già esiste per lo stesso immobileId) la cartella Drive
 * dell'immobile e ritorna id + URL "human friendly" (webViewLink) per essere
 * mostrato in UI.
 *
 * Idempotente:
 * 1) Se `existingFolderId` è passato ed è ancora valido, ritorna quello.
 * 2) Altrimenti se esiste già una cartella con lo stesso nome sotto ROOT, la
 *    riusa (retro-compatibilità coi vecchi nomi `{immobileId} - {titolo}`).
 * 3) Altrimenti crea la cartella nuova col nome `{titolo}` (nessun UUID).
 */
function azioneCreateFolder_(payload) {
  const { immobileTitolo, existingFolderId } = payload;
  validaCampiObbligatori_({ immobileTitolo });

  if (existingFolderId) {
    try {
      const cartella = DriveApp.getFolderById(existingFolderId);
      return {
        ok: true,
        folderId: cartella.getId(),
        folderUrl: cartella.getUrl(),
        riutilizzata: true,
      };
    } catch (_ignored) {
      // Fall through: id passato ma cartella non più valida (cestinata,
      // rimossa a mano). Creiamo una nuova cartella.
    }
  }

  const root = DriveApp.getFolderById(
    PropertiesService.getScriptProperties().getProperty('ROOT_FOLDER_ID'),
  );
  const nome = sanitizzaNome_(immobileTitolo);
  const cartella = trovaOCreaSottocartella_(root, nome);

  return {
    ok: true,
    folderId: cartella.getId(),
    folderUrl: cartella.getUrl(),
    riutilizzata: false,
  };
}

function azioneUpload_(payload) {
  const { immobileId, immobileTitolo, immobileIndirizzo, driveFolderId, fase, documento, fileName, mimeType, fileBase64 } = payload;
  validaCampiObbligatori_({ immobileTitolo, immobileIndirizzo, fase, documento, fileName, mimeType, fileBase64 });
  validaFase_(fase);

  // Preferenza a driveFolderId (l'id della cartella già creata all'ingresso in
  // gestione): salta il lookup per nome. Fallback: cerca/crea per nome per
  // immobili storici che non hanno ancora la cartella.
  let cartellaImmobile;
  if (driveFolderId) {
    try {
      cartellaImmobile = DriveApp.getFolderById(driveFolderId);
    } catch (_ignored) {
      cartellaImmobile = null;
    }
  }
  if (!cartellaImmobile) {
    const root = DriveApp.getFolderById(
      PropertiesService.getScriptProperties().getProperty('ROOT_FOLDER_ID'),
    );
    // Retro-compat: primo tentativo col nuovo nome (solo titolo), secondo
    // tentativo col vecchio nome `{immobileId} - {titolo}`.
    cartellaImmobile = trovaOCreaSottocartella_(root, sanitizzaNome_(immobileTitolo));
    if (immobileId) {
      const legacyName = sanitizzaNome_(`${immobileId} - ${immobileTitolo}`);
      const legacy = root.getFoldersByName(legacyName);
      // Se la cartella legacy esiste e non è la stessa nuova, migra i file
      // dentro la nuova e cestina la legacy (best-effort, non blocca l'upload).
      if (legacy.hasNext()) {
        const legacyFolder = legacy.next();
        if (legacyFolder.getId() !== cartellaImmobile.getId()) {
          const legacyFiles = legacyFolder.getFiles();
          while (legacyFiles.hasNext()) {
            const f = legacyFiles.next();
            f.moveTo(cartellaImmobile);
          }
          legacyFolder.setTrashed(true);
        }
      }
    }
  }

  // Sostituzione: se esiste già un file per lo stesso "documento" (a prescindere
  // dall'indirizzo con cui era stato nominato in precedenza, che potrebbe essere
  // cambiato nel frattempo), lo sposta nel cestino prima di caricare la nuova
  // versione — stessa semantica "upload = sostituisci" già usata per la
  // checklist nel gestionale.
  const prefissoDocumento = `${sanitizzaNome_(documento)} - `;
  const filesEsistenti = cartellaImmobile.getFiles();
  while (filesEsistenti.hasNext()) {
    const f = filesEsistenti.next();
    if (f.getName().indexOf(prefissoDocumento) === 0) f.setTrashed(true);
  }

  const nomeFileFinale = sanitizzaNome_(`${documento} - ${immobileIndirizzo}`) + estensioneDa_(fileName);
  const bytes = Utilities.base64Decode(fileBase64);
  const blob = Utilities.newBlob(bytes, mimeType, nomeFileFinale);
  const file = cartellaImmobile.createFile(blob);
  file.setDescription(`Fase: ${fase}`);

  return {
    ok: true,
    fileId: file.getId(),
    fileName: file.getName(),
    folderId: cartellaImmobile.getId(),
    folderUrl: cartellaImmobile.getUrl(),
  };
}

function azioneGetDownload_(payload) {
  const { fileId } = payload;
  validaCampiObbligatori_({ fileId });

  const file = DriveApp.getFileById(fileId);
  const blob = file.getBlob();

  return {
    ok: true,
    fileName: file.getName(),
    mimeType: blob.getContentType(),
    fileBase64: Utilities.base64Encode(blob.getBytes()),
  };
}

// --- Helper -----------------------------------------------------------------

function trovaOCreaSottocartella_(cartellaGenitore, nome) {
  const esistenti = cartellaGenitore.getFoldersByName(nome);
  if (esistenti.hasNext()) return esistenti.next();
  return cartellaGenitore.createFolder(nome);
}

function sanitizzaNome_(nome) {
  return nome.replace(/[\\/:*?"<>|]/g, '-').trim().slice(0, 150);
}

function estensioneDa_(fileName) {
  const match = /\.[^.]+$/.exec(fileName || '');
  return match ? match[0] : '';
}

function validaFase_(fase) {
  if (!FASI_VALIDE.includes(fase)) {
    throw new Error(`Fase non valida: ${fase}`);
  }
}

function validaCampiObbligatori_(campi) {
  for (const chiave in campi) {
    if (campi[chiave] === undefined || campi[chiave] === null || campi[chiave] === '') {
      throw new Error(`Campo obbligatorio mancante: ${chiave}`);
    }
  }
}

function verificaToken_(token) {
  const atteso = PropertiesService.getScriptProperties().getProperty('SHARED_TOKEN');
  return !!atteso && !!token && token === atteso;
}

function risposta_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
