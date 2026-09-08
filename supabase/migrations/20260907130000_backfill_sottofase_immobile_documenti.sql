-- Backfill difensivo: propaga sottofase dal catalogo alle righe
-- immobile_documenti che l'hanno NULL. La migration precedente
-- 20260906120000_kanban2_sottofase_data_preliminare_atto.sql lo aveva già
-- fatto una volta, ma nel frattempo generaChecklistPerFase (aggiornato solo
-- ora in src/lib/pipelineChecklist.ts) ha inserito nuove righe senza la
-- colonna, e per quelle la card cadeva sempre nell'ultima sottofase perché
-- derivaSottofase non trovava match.
UPDATE public.immobile_documenti d
SET sottofase = dc.sottofase
FROM public.documenti_catalogo dc
WHERE dc.fase = d.fase
  AND dc.documento = d.documento
  AND d.sottofase IS NULL;
