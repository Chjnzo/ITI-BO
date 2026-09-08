-- -----------------------------------------------------------------------------
-- immobile_alert (§3.6): promemoria manuali liberi su un immobile specifico,
-- creati da un agente (es. "aspettare planimetria aggiornata prima di
-- pubblicare"). Gli alert "standard" (stagnazione fase, documento mancante)
-- NON sono righe persistite qui: sono calcolati a runtime lato client
-- confrontando immobile_pipeline_stato.updated_at e documenti_catalogo contro
-- immobile_documenti (vedi docs/DECISIONI.md, voce 2026-08-21).
-- -----------------------------------------------------------------------------

CREATE TABLE public.immobile_alert (
    id           uuid NOT NULL DEFAULT gen_random_uuid(),
    immobile_id  uuid NOT NULL,
    messaggio    text NOT NULL,
    creato_da    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    risolto      boolean NOT NULL DEFAULT false,
    created_at   timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    risolto_at   timestamptz,
    CONSTRAINT immobile_alert_pkey PRIMARY KEY (id),
    CONSTRAINT immobile_alert_immobile_id_fkey FOREIGN KEY (immobile_id) REFERENCES public.immobili(id) ON DELETE CASCADE
);

CREATE INDEX idx_immobile_alert_immobile_id ON public.immobile_alert USING btree (immobile_id);
CREATE INDEX idx_immobile_alert_risolto ON public.immobile_alert USING btree (risolto);

ALTER TABLE public.immobile_alert ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Consenti accesso completo agli agenti autenticati" ON public.immobile_alert
    AS PERMISSIVE FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);
