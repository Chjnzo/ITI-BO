-- Sostituisce lo storage interim (Supabase Storage) con l'integrazione Google
-- Drive definitiva prevista da specifica-progetto-iti-bo-v1.md §4/§5: il
-- pattern Frontend → Edge Function (drive-documenti) → Apps Script Web App →
-- Drive è ora implementato e verificato (vedi google-apps-script/README.md).
--
-- `drive_file_id` sostituisce `file_path`: non è un path in un bucket
-- Supabase ma l'id del file su Google Drive, restituito dall'Apps Script Web
-- App e usato dall'Edge Function per il download successivo.

ALTER TABLE public.immobile_documenti ADD COLUMN drive_file_id text;

ALTER TABLE public.immobile_documenti DROP COLUMN file_path;

DROP POLICY IF EXISTS "Consenti accesso completo agli agenti autenticati su immobile-documenti" ON storage.objects;

-- Il bucket 'immobile-documenti' resta orfano (vuoto, nessuna policy, nessuna
-- colonna lo referenzia più): storage.buckets ha un trigger
-- (protect_buckets_delete) che blocca DELETE dirette via SQL, la cancellazione
-- va fatta dalla dashboard Storage o via Storage API, non da una migration.
