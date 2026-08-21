-- Adds the two fields the buyer-matching query (specifica-progetto-iti-bo-v1.md §3.6)
-- needs on immobili: a real zone link (mirrors valutazioni.zona_omi_id) instead of
-- matching on the free-text `citta`, and a tipologia field to compare against
-- lead_ricerca.tipologia_ricerca. Kept as plain text (no CHECK), same as
-- valutazioni.tipologia, since the frontend still has two divergent tipologia
-- lists (ValuationWizard.TIPOLOGIE vs UnitaSheet.TIPOLOGIE_UNITA) not yet
-- reconciled -- not a schema decision to force here.
ALTER TABLE public.immobili
    ADD COLUMN zona_omi_id  uuid REFERENCES public.zone_omi(id) ON DELETE SET NULL,
    ADD COLUMN tipologia    text;

CREATE INDEX idx_immobili_zona_omi_id ON public.immobili USING btree (zona_omi_id);
CREATE INDEX idx_immobili_tipologia ON public.immobili USING btree (tipologia);
