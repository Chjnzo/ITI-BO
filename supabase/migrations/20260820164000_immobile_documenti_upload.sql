-- Adds file-upload support to the pipeline checklist (immobile_documenti).
--
-- The project spec (specifica-progetto-iti-bo-v1.md §3.5/§4) describes each
-- checklist document eventually being uploaded to Google Drive via an Edge
-- Function that proxies to a Google Apps Script Web App. That Apps Script
-- backend does not exist yet (no URL/token configured anywhere in this repo
-- or its secrets) — building an upload button against it now would be a
-- non-functional placeholder.
--
-- Interim solution: store the uploaded file in Supabase Storage, which is
-- already part of this project (see the `immobili` bucket used for property
-- photos in PropertyWizard.tsx) and requires no new external service. Unlike
-- `immobili`, this bucket is PRIVATE — checklist documents (CI/CF, moduli
-- antiriciclaggio, ecc.) are internal/sensitive, not public listing assets —
-- so the frontend must request a signed URL to view/download them instead of
-- using a public URL. `file_path` on immobile_documenti stores the object
-- path within the bucket, not a public URL.
--
-- When the real Drive/Apps Script integration is built, this column and
-- bucket can be swapped out (or kept as a fallback) without changing the
-- immobile_documenti schema shape used by the frontend.
ALTER TABLE public.immobile_documenti ADD COLUMN file_path text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('immobile-documenti', 'immobile-documenti', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Consenti accesso completo agli agenti autenticati su immobile-documenti"
ON storage.objects
AS PERMISSIVE FOR ALL
TO authenticated
USING (bucket_id = 'immobile-documenti')
WITH CHECK (bucket_id = 'immobile-documenti');
