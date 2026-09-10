-- §1 Sottofase persistita su immobile_pipeline_stato
-- Prima era derivata dai documenti (funzione derivaSottofase in
-- useImmobiliPipeline). L'utente vuole poter spostare manualmente le card
-- tra sottofasi via drag&drop senza vincoli di checklist, quindi la
-- sottofase diventa un campo esplicito e persistito.
ALTER TABLE public.immobile_pipeline_stato
  ADD COLUMN IF NOT EXISTS sottofase text NULL;

WITH ordini AS (
  SELECT unnest(ARRAY['Preparazione','Pubblicato','In trattativa']) AS sottofase, generate_series(1,3) AS ord, 'In Vendita' AS fase
  UNION ALL
  SELECT unnest(ARRAY['Vincolo','Preliminare','Rogito','Archivio']), generate_series(1,4), 'Venduto'
),
counts AS (
  SELECT s.immobile_id, s.fase, o.sottofase, o.ord,
    COUNT(d.id) FILTER (WHERE d.stato = 'Da fare') AS da_fare
  FROM public.immobile_pipeline_stato s
  JOIN ordini o ON o.fase = s.fase
  LEFT JOIN public.immobile_documenti d
    ON d.immobile_id = s.immobile_id AND d.fase = o.fase AND d.sottofase = o.sottofase
  GROUP BY s.immobile_id, s.fase, o.sottofase, o.ord
),
prime_da_fare AS (
  SELECT immobile_id, fase,
    (ARRAY_AGG(sottofase ORDER BY ord) FILTER (WHERE da_fare > 0))[1] AS prima,
    (ARRAY_AGG(sottofase ORDER BY ord DESC))[1] AS ultima
  FROM counts
  GROUP BY immobile_id, fase
)
UPDATE public.immobile_pipeline_stato s
SET sottofase = COALESCE(p.prima, p.ultima, CASE s.fase WHEN 'In Vendita' THEN 'Preparazione' ELSE 'Vincolo' END)
FROM prime_da_fare p
WHERE s.immobile_id = p.immobile_id AND s.fase = p.fase
  AND s.sottofase IS NULL;

ALTER TABLE public.immobile_pipeline_stato
  ALTER COLUMN sottofase SET NOT NULL,
  ALTER COLUMN sottofase SET DEFAULT 'Preparazione';

ALTER TABLE public.immobile_pipeline_stato
  DROP CONSTRAINT IF EXISTS immobile_pipeline_stato_sottofase_valida;
ALTER TABLE public.immobile_pipeline_stato
  ADD CONSTRAINT immobile_pipeline_stato_sottofase_valida CHECK (
    (fase = 'In Vendita' AND sottofase IN ('Preparazione','Pubblicato','In trattativa'))
    OR (fase = 'Venduto' AND sottofase IN ('Vincolo','Preliminare','Rogito','Archivio'))
  );


-- §2 Colonna pubblicato_sito su immobili + RLS pubblica ristretta
-- Backfill: gli immobili già in stato "Disponibile" restano visibili subito.
ALTER TABLE public.immobili
  ADD COLUMN IF NOT EXISTS pubblicato_sito boolean NOT NULL DEFAULT false;

UPDATE public.immobili
SET pubblicato_sito = true
WHERE pubblicato_sito = false
  AND is_deleted = false
  AND stato = 'Disponibile';

DROP POLICY IF EXISTS "Public properties are viewable by everyone" ON public.immobili;
CREATE POLICY "Anon can view published properties"
  ON public.immobili
  FOR SELECT
  TO anon
  USING (pubblicato_sito = true AND is_deleted = false);
CREATE POLICY "Authenticated can view all properties"
  ON public.immobili
  FOR SELECT
  TO authenticated
  USING (true);


-- §3 Scadenze per fase (opzione B: storico per fase, editabile sempre).
CREATE TABLE IF NOT EXISTS public.pipeline_scadenze (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  immobile_id uuid NULL REFERENCES public.immobili(id) ON DELETE CASCADE,
  pratica_id uuid NULL REFERENCES public.proprietari_pratiche(id) ON DELETE CASCADE,
  fase text NOT NULL,
  sottofase text NULL,
  descrizione text NULL,
  scadenza date NOT NULL,
  completata boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT pipeline_scadenze_target_check CHECK (
    (immobile_id IS NOT NULL AND pratica_id IS NULL)
    OR (immobile_id IS NULL AND pratica_id IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_pipeline_scadenze_immobile ON public.pipeline_scadenze(immobile_id) WHERE immobile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pipeline_scadenze_pratica  ON public.pipeline_scadenze(pratica_id)  WHERE pratica_id  IS NOT NULL;

ALTER TABLE public.pipeline_scadenze ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated all scadenze" ON public.pipeline_scadenze;
CREATE POLICY "Authenticated all scadenze"
  ON public.pipeline_scadenze
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pipeline_scadenze TO authenticated;


-- §4 Drive folder id su contatti (per creare cartella proprietari alla stessa
-- maniera di immobili, senza lookup lazy).
ALTER TABLE public.contatti
  ADD COLUMN IF NOT EXISTS drive_folder_id text NULL;


-- §5 drive_file_id su proprietari_pratica_documenti (upload allegati nella
-- checklist Presa in carico).
ALTER TABLE public.proprietari_pratica_documenti
  ADD COLUMN IF NOT EXISTS drive_file_id text NULL;
