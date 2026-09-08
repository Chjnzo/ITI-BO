-- Rimuove la colonna sottofase: era solo un'etichetta manuale scelta a mano
-- in Kanban (es. "Burocratiche/Marketing/Appuntamenti" per In Vendita), non
-- collegata alla checklist documenti né a nessuna automazione. Generava
-- confusione con la vera checklist e con immobili.stato. La pipeline
-- proprietari (proprietari_pratiche) non ha mai avuto un concetto analogo.

ALTER TABLE public.immobile_pipeline_stato
    DROP COLUMN sottofase;

ALTER TABLE public.documenti_catalogo
    DROP COLUMN sottofase;
