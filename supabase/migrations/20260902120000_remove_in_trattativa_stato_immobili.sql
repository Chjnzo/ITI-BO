-- Rimuove 'In Trattativa' dai valori validi di immobili.stato: nessuna UI ha mai
-- permesso di impostarlo (solo seed.sql/dati storici), lo stato commerciale
-- dell'annuncio resta solo Disponibile/Venduto/Bozza. Non va confuso con
-- immobili_pipeline_stato.fase (In Vendita/Venduto/Archivio), un asse diverso.

UPDATE public.immobili
SET stato = 'Disponibile'
WHERE stato = 'In Trattativa';

ALTER TABLE public.immobili
    DROP CONSTRAINT stato_check;

ALTER TABLE public.immobili
    ADD CONSTRAINT stato_check CHECK (stato = ANY (ARRAY['Disponibile'::text, 'Venduto'::text, 'Bozza'::text]));
