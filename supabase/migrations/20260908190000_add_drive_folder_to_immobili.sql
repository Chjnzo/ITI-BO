-- Ogni immobile ha una propria cartella Drive: creata proattivamente all'ingresso
-- in gestione (creaImmobileDaPratica + PropertyWizard), non più lazy al primo
-- upload. drive_folder_id serve al backend/Apps Script per fare append di file
-- senza cercare per nome; drive_folder_url è il link umano da mostrare in UI.
ALTER TABLE public.immobili
  ADD COLUMN drive_folder_id  text,
  ADD COLUMN drive_folder_url text;

COMMENT ON COLUMN public.immobili.drive_folder_id IS
  'Id della cartella Drive di questo immobile. Popolato da drive-documenti/createFolder al momento della creazione.';
COMMENT ON COLUMN public.immobili.drive_folder_url IS
  'URL pubblico visibile all''agente per aprire la cartella dell''immobile. Non richiede autenticazione script.';
