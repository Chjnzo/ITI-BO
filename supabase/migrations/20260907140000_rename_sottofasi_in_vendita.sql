-- Rinomina le sottofasi della fase "In Vendita" da un raggruppamento per
-- TIPO di documento (Burocratiche/Marketing/Appuntamenti) a una vera
-- progressione temporale del lavoro sull'immobile:
--
--   Preparazione  → raccolgo documenti proprietario + preparo l'annuncio
--                    (APE, atto, planimetria, spese, antiriciclaggio, foto)
--   Pubblicato    → annuncio online, apertura appuntamenti
--                    (pubblicazione Getrix, portali, cartello)
--   In trattativa → ho ricevuto una proposta d'acquisto, la sto chiudendo
--                    (proposta, CI acquirente, deposito, allegato A)
--
-- Alla firma della proposta d'acquisto la card lascia la Kanban "In Vendita"
-- e passa alla Kanban "Venduto" (colonna Vincolo). Motivazione: la vecchia
-- suddivisione Burocratiche/Marketing/Appuntamenti raggruppava lavori che
-- spesso girano in parallelo — la posizione della card non diceva niente
-- sull'avanzamento reale del processo di vendita.

-- 1) Rinomina le sottofasi già a catalogo (Burocratiche→Preparazione,
--    Appuntamenti→In trattativa). "Marketing" non era mai stata popolata,
--    quindi non serve toccarla.
UPDATE public.documenti_catalogo
   SET sottofase = 'Preparazione'
 WHERE fase = 'In Vendita' AND sottofase = 'Burocratiche';

UPDATE public.documenti_catalogo
   SET sottofase = 'In trattativa'
 WHERE fase = 'In Vendita' AND sottofase = 'Appuntamenti';

-- 2) Aggiungi documenti "Preparazione" e "Pubblicato" mancanti a catalogo
--    (la spec email cita foto professionali per la preparazione, e per la
--    fase pubblicato l'annuncio Getrix + portali + cartello vendita).
INSERT INTO public.documenti_catalogo (fase, sottofase, documento, ordine) VALUES
  ('In Vendita', 'Preparazione', 'Foto e video professionali',       7),
  ('In Vendita', 'Pubblicato',   'Annuncio pubblicato su Getrix',    8),
  ('In Vendita', 'Pubblicato',   'Annuncio pubblicato sui portali',  9),
  ('In Vendita', 'Pubblicato',   'Cartello vendita esposto',        10)
ON CONFLICT (fase, documento) DO NOTHING;

-- 3) Propaga la rinomina alle istanze già create in immobile_documenti.
UPDATE public.immobile_documenti
   SET sottofase = 'Preparazione'
 WHERE fase = 'In Vendita' AND sottofase = 'Burocratiche';

UPDATE public.immobile_documenti
   SET sottofase = 'In trattativa'
 WHERE fase = 'In Vendita' AND sottofase = 'Appuntamenti';
