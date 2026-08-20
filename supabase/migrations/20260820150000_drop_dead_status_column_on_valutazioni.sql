-- valutazioni had both `stato` (text, default 'Bozza', values Bozza/Completata) and
-- `status` (text, default 'draft', check constrained to draft/published/archived).
-- Verified: zero code in ITI-BO or the ITI2.0 sibling repo ever reads or writes
-- `status` (only `stato` is used throughout ValuationWizard/Valutazioni/ValuazioneReport).
-- Confirmed via live data: all 51 rows sit at the column default 'draft', proving
-- it was never actually updated by any code path -- dead weight from an
-- incomplete rename, not a parallel field with real data. Drops the dependent
-- check constraint (valutazioni_status_check) automatically.
ALTER TABLE public.valutazioni DROP COLUMN status;
