-- Rinomina la fase "Incontro/Sopralluogo" in "Valutazione" nella pipeline
-- proprietari. Solo un rename: stesso significato, stessa posizione, stesso
-- comportamento (prima fase della pipeline). Motivazione dell'utente: rendere
-- coerente il vocabolario con la tipologia appuntamento "Valutazione Vendita"
-- (in EventFormModal) e con la nuova regola per cui fissando un appuntamento
-- di valutazione in agenda la pratica avanza automaticamente a questa fase.
--
-- IMPORTANTE (bug fix 2026-09-14): i CHECK vanno droppati PRIMA degli UPDATE,
-- altrimenti la nuova stringa 'Valutazione' viene rifiutata dal constraint
-- ancora attivo. Ordine: 1) drop CHECK, 2) UPDATE, 3) re-ADD CHECK.

-- 1) Rilascio temporaneo dei CHECK sulle fasi (li ri-attivo alla fine con la
--    nuova lista di valori validi).
ALTER TABLE public.proprietari_pratiche
    DROP CONSTRAINT proprietari_pratiche_fase_check;

ALTER TABLE public.proprietari_pratica_documenti
    DROP CONSTRAINT proprietari_pratica_documenti_fase_check;

ALTER TABLE public.proprietari_documenti_catalogo
    DROP CONSTRAINT proprietari_documenti_catalogo_fase_check;

ALTER TABLE public.alert_regole
    DROP CONSTRAINT alert_regole_fase_valida;

-- 2) Sposto le righe esistenti al nuovo nome, in tutti i posti dove la fase
--    è persistita.
UPDATE public.proprietari_pratiche
SET fase = 'Valutazione'
WHERE fase = 'Incontro/Sopralluogo';

UPDATE public.proprietari_pratica_documenti
SET fase = 'Valutazione'
WHERE fase = 'Incontro/Sopralluogo';

UPDATE public.proprietari_documenti_catalogo
SET fase = 'Valutazione'
WHERE fase = 'Incontro/Sopralluogo';

UPDATE public.alert_regole
SET fase = 'Valutazione'
WHERE entita_tipo = 'proprietario' AND fase = 'Incontro/Sopralluogo';

-- 3) Ripristino i CHECK con la nuova lista di fasi valide. Cambio anche il
--    DEFAULT su proprietari_pratiche.fase.
ALTER TABLE public.proprietari_pratiche
    ADD CONSTRAINT proprietari_pratiche_fase_check
        CHECK (fase = ANY (ARRAY['Valutazione'::text, 'Rivalutazione'::text, 'Presa in carico'::text])),
    ALTER COLUMN fase SET DEFAULT 'Valutazione';

ALTER TABLE public.proprietari_pratica_documenti
    ADD CONSTRAINT proprietari_pratica_documenti_fase_check
        CHECK (fase = ANY (ARRAY['Valutazione'::text, 'Rivalutazione'::text, 'Presa in carico'::text]));

ALTER TABLE public.proprietari_documenti_catalogo
    ADD CONSTRAINT proprietari_documenti_catalogo_fase_check
        CHECK (fase = ANY (ARRAY['Valutazione'::text, 'Rivalutazione'::text, 'Presa in carico'::text]));

ALTER TABLE public.alert_regole
    ADD CONSTRAINT alert_regole_fase_valida CHECK (
        (entita_tipo = 'immobile' AND fase IN ('In Vendita', 'Venduto'))
        OR (entita_tipo = 'proprietario' AND fase IN ('Valutazione', 'Rivalutazione', 'Presa in carico'))
    );
