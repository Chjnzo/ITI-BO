-- Task origin marker: identifica se la task è stata creata dall'area Contatti
-- (schede proprietario/acquirente/collaboratore, dashboard, pagina Task) o
-- dall'area Gestione (kanban proprietari, pratiche, kanban immobili).
--
-- La segretaria vuole poter capire a colpo d'occhio da dove viene una task
-- (badge sulla card) e filtrare per area. Default 'contatti' perché oggi
-- TUTTE le task esistenti nascono dal lato Contatti — la Gestione non ha
-- ancora punti di creazione task. I futuri punti di creazione in Gestione
-- dovranno passare 'gestione' esplicitamente.
ALTER TABLE public.tasks
    ADD COLUMN origine text NOT NULL DEFAULT 'contatti'
    CHECK (origine IN ('contatti', 'gestione'));

CREATE INDEX idx_tasks_origine ON public.tasks USING btree (origine);

COMMENT ON COLUMN public.tasks.origine IS
    'Area applicativa da cui la task e'' stata creata: ''contatti'' (schede contatti, dashboard, pagina Task) o ''gestione'' (kanban proprietari/immobili, schede pratica).';
