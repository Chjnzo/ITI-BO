-- Rimuove la fase 'Contatto' dalla pipeline proprietari. Il nuovo flow è:
--
--   proprietario creato ─(anagrafica)─▶ resta nella LISTA proprietari,
--   fuori dal kanban, finché l'agente non lo marca "caldo" manualmente.
--   Solo allora appare il tasto "Avvia pratica" nella lista, che crea la
--   pratica direttamente in 'Incontro/Sopralluogo' (prima fase reale del
--   kanban).
--
-- Motivazione: la fase 'Contatto' era una fase-parcheggio che coincideva
-- col primo momento di contatto e non aggiungeva valore rispetto al flag
-- caldo. Toglierla semplifica il flow (la fase la si "guadagna" solo dopo
-- una decisione esplicita dell'agente) e riduce a 3 le colonne del kanban.

-- -----------------------------------------------------------------------------
-- 1) Sposta pratiche esistenti da 'Contatto' a 'Incontro/Sopralluogo'.
--    Aggiorno updated_at per coerenza col resto del pivot (il timestamp è
--    letto dagli alert di stagnazione — non vogliamo che una pratica
--    appena migrata risulti già ferma da X giorni nella nuova fase).
-- -----------------------------------------------------------------------------
UPDATE public.proprietari_pratiche
SET fase = 'Incontro/Sopralluogo',
    updated_at = timezone('utc'::text, now())
WHERE fase = 'Contatto';

-- -----------------------------------------------------------------------------
-- 2) Rimuove documenti di catalogo/istanze legati alla fase 'Contatto'. La
--    'Doc Valutazione' non è più tracciata lato pratica proprietario: la
--    valutazione ha il proprio sistema (tabella valutazioni + wizard).
-- -----------------------------------------------------------------------------
DELETE FROM public.proprietari_pratica_documenti WHERE fase = 'Contatto';
DELETE FROM public.proprietari_documenti_catalogo WHERE fase = 'Contatto';

-- -----------------------------------------------------------------------------
-- 3) Rimuove la regola alert 'proprietario/Contatto'. Anche 'immobile/Archivio'
--    perché il CHECK di alert_regole era rimasto disallineato dal CHECK di
--    immobile_pipeline_stato dopo 20260906120000 (Archivio è passato a
--    sottofase di Venduto): questa è l'occasione buona per riallinearli.
-- -----------------------------------------------------------------------------
DELETE FROM public.alert_regole
WHERE (entita_tipo = 'proprietario' AND fase = 'Contatto')
   OR (entita_tipo = 'immobile' AND fase = 'Archivio');

-- -----------------------------------------------------------------------------
-- 4) Restringe i CHECK sui 3 posti in cui vive la lista fasi proprietari
--    + il CHECK di alert_regole (che ora riflette anche l'aggiornamento
--    fasi immobili della migration precedente).
-- -----------------------------------------------------------------------------
ALTER TABLE public.proprietari_pratiche
    DROP CONSTRAINT proprietari_pratiche_fase_check,
    ADD CONSTRAINT proprietari_pratiche_fase_check
        CHECK (fase = ANY (ARRAY['Incontro/Sopralluogo'::text, 'Rivalutazione'::text, 'Presa in carico'::text])),
    ALTER COLUMN fase SET DEFAULT 'Incontro/Sopralluogo';

ALTER TABLE public.proprietari_pratica_documenti
    DROP CONSTRAINT proprietari_pratica_documenti_fase_check,
    ADD CONSTRAINT proprietari_pratica_documenti_fase_check
        CHECK (fase = ANY (ARRAY['Incontro/Sopralluogo'::text, 'Rivalutazione'::text, 'Presa in carico'::text]));

ALTER TABLE public.proprietari_documenti_catalogo
    DROP CONSTRAINT proprietari_documenti_catalogo_fase_check,
    ADD CONSTRAINT proprietari_documenti_catalogo_fase_check
        CHECK (fase = ANY (ARRAY['Incontro/Sopralluogo'::text, 'Rivalutazione'::text, 'Presa in carico'::text]));

ALTER TABLE public.alert_regole
    DROP CONSTRAINT alert_regole_fase_valida,
    ADD CONSTRAINT alert_regole_fase_valida CHECK (
        (entita_tipo = 'immobile' AND fase IN ('In Vendita', 'Venduto'))
        OR (entita_tipo = 'proprietario' AND fase IN ('Incontro/Sopralluogo', 'Rivalutazione', 'Presa in carico'))
    );
