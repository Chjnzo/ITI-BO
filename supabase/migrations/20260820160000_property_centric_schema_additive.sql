-- Property-centric model, phase 1: additive-only schema changes.
-- Nothing here drops or renames existing columns (leads.zona_venditore,
-- leads.motivazione_vendita, leads.scadenza_esclusiva, leads.budget,
-- leads.zone_ricercate, leads.tipologia_ricerca, leads.via_immobile stay in
-- place for now). The old columns get backfilled into the new structures by
-- a follow-up data-migration script, and only dropped in a later migration
-- once the new tables are verified end-to-end in local. This lets the old
-- frontend keep working against `leads` unmodified while the new tables are
-- built out on the side.

-- -----------------------------------------------------------------------------
-- immobili: owner FK (replaces free-text `proprietario` going forward),
-- seller-journey fields that move here from `leads`, and a completeness flag
-- for "scheda pubblicabile sul sito" independent of pipeline stato.
-- -----------------------------------------------------------------------------
ALTER TABLE public.immobili
    ADD COLUMN proprietario_id   uuid REFERENCES public.leads(id) ON DELETE SET NULL,
    ADD COLUMN zona_venditore    text,
    ADD COLUMN motivazione_vendita text,
    ADD COLUMN scadenza_esclusiva date,
    ADD COLUMN scheda_completa   boolean NOT NULL DEFAULT false,
    ADD COLUMN venduto           boolean NOT NULL DEFAULT false;

CREATE INDEX idx_immobili_proprietario_id ON public.immobili USING btree (proprietario_id);

COMMENT ON COLUMN public.immobili.proprietario_id IS 'FK to leads(id) acting as owner registry. Old text column `proprietario` kept until backfilled and frontend migrated.';
COMMENT ON COLUMN public.immobili.scheda_completa IS 'True once PropertyWizard full data entry (photos/description/etc.) is done — independent of Kanban pipeline stato.';
COMMENT ON COLUMN public.immobili.venduto IS 'Simplified public-facing sold flag for ITI2.0, independent of internal pipeline stato (which must never be exposed publicly, see specifica-progetto-iti-bo-v1.md §5).';

-- -----------------------------------------------------------------------------
-- valutazioni: link to the immobile it was produced for, instead of relying
-- solely on lead_id + a duplicated `valutazione_stimata` on leads.
-- -----------------------------------------------------------------------------
ALTER TABLE public.valutazioni
    ADD COLUMN immobile_id uuid REFERENCES public.immobili(id) ON DELETE SET NULL;

CREATE INDEX idx_valutazioni_immobile_id ON public.valutazioni USING btree (immobile_id);

-- -----------------------------------------------------------------------------
-- lead_ricerca: buyer search criteria, split out of `leads` so the person
-- registry stays pure identity/contact data. One row per lead for now
-- (mirrors the array-column shape already used on leads.zone_ricercate /
-- leads.tipologia_ricerca), can be relaxed to many-per-lead later if needed.
-- -----------------------------------------------------------------------------
CREATE TABLE public.lead_ricerca (
    id                 uuid NOT NULL DEFAULT gen_random_uuid(),
    lead_id            uuid NOT NULL,
    budget             numeric,
    zone_ricercate     text[],
    tipologia_ricerca  text[],
    created_at         timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at         timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT lead_ricerca_pkey PRIMARY KEY (id),
    CONSTRAINT lead_ricerca_lead_id_key UNIQUE (lead_id),
    CONSTRAINT lead_ricerca_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE
);

CREATE INDEX idx_lead_ricerca_lead_id ON public.lead_ricerca USING btree (lead_id);

ALTER TABLE public.lead_ricerca ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Consenti accesso completo agli agenti autenticati" ON public.lead_ricerca
    AS PERMISSIVE FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- documenti_catalogo: fixed reference list of fase/sottofase/documento from
-- specifica-progetto-iti-bo-v1.md §3.2. Single source of truth the frontend
-- reads to know which checklist rows an immobile should have per fase,
-- instead of hardcoding the list in components.
-- -----------------------------------------------------------------------------
CREATE TABLE public.documenti_catalogo (
    id          uuid NOT NULL DEFAULT gen_random_uuid(),
    fase        text NOT NULL CHECK (fase = ANY (ARRAY['Acquisizione'::text, 'In Vendita'::text, 'Venduto'::text, 'Archivio'::text])),
    sottofase   text,
    documento   text NOT NULL,
    ordine      integer NOT NULL DEFAULT 0,
    CONSTRAINT documenti_catalogo_pkey PRIMARY KEY (id),
    CONSTRAINT documenti_catalogo_fase_documento_key UNIQUE (fase, documento)
);

ALTER TABLE public.documenti_catalogo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Consenti accesso completo agli agenti autenticati" ON public.documenti_catalogo
    AS PERMISSIVE FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

INSERT INTO public.documenti_catalogo (fase, sottofase, documento, ordine) VALUES
    ('Acquisizione', 'Contatto',        'Doc Valutazione', 1),
    ('Acquisizione', 'Presa in carico', 'Privacy proprietario firmata', 2),
    ('Acquisizione', 'Presa in carico', 'Incarico di mediazione firmato', 3),
    ('Acquisizione', 'Presa in carico', 'CI/CF proprietario', 4),
    ('In Vendita',   'Burocratiche',    'Atto notarile di provenienza', 1),
    ('In Vendita',   'Burocratiche',    'Planimetria e visure', 2),
    ('In Vendita',   'Burocratiche',    'APE', 3),
    ('In Vendita',   'Burocratiche',    'Modulo antiriciclaggio proprietario', 4),
    ('In Vendita',   'Burocratiche',    'Spese condominiali/verbale assemblea', 5),
    ('In Vendita',   'Burocratiche',    'Richiesta accesso agli atti', 6),
    ('In Vendita',   'Appuntamenti',    'Documento proposta d''acquisto', 7),
    ('In Vendita',   'Appuntamenti',    'Documenti acquirente (CI/tessera sanitaria)', 8),
    ('In Vendita',   'Appuntamenti',    'Copia assegno/deposito cauzionale', 9),
    ('In Vendita',   'Appuntamenti',    'Allegato A provvigioni', 10),
    ('Venduto',      'Vincolo',         'Doc Preliminare', 1),
    ('Venduto',      'Preliminare',     'Fattura agenzia', 2),
    ('Venduto',      'Preliminare',     'Versamento caparra', 3),
    ('Venduto',      'Preliminare',     'Modulo antiriciclaggio acquirente', 4),
    ('Venduto',      'Rogito',          'Liberatoria condominiale', 5),
    ('Venduto',      'Rogito',          'Verifica stati civili', 6),
    ('Venduto',      'Rogito',          'IBAN saldo/mutuo', 7),
    ('Venduto',      'Rogito',          'Atto di provenienza', 8),
    ('Archivio',     NULL,              'Copia Atto Notarile definitivo', 1);

-- -----------------------------------------------------------------------------
-- immobile_pipeline_stato: current Kanban position, one row per immobile.
-- -----------------------------------------------------------------------------
CREATE TABLE public.immobile_pipeline_stato (
    id           uuid NOT NULL DEFAULT gen_random_uuid(),
    immobile_id  uuid NOT NULL,
    fase         text NOT NULL DEFAULT 'Acquisizione' CHECK (fase = ANY (ARRAY['Acquisizione'::text, 'In Vendita'::text, 'Venduto'::text, 'Archivio'::text])),
    sottofase    text,
    updated_at   timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT immobile_pipeline_stato_pkey PRIMARY KEY (id),
    CONSTRAINT immobile_pipeline_stato_immobile_id_key UNIQUE (immobile_id),
    CONSTRAINT immobile_pipeline_stato_immobile_id_fkey FOREIGN KEY (immobile_id) REFERENCES public.immobili(id) ON DELETE CASCADE
);

CREATE INDEX idx_immobile_pipeline_stato_fase ON public.immobile_pipeline_stato USING btree (fase);

ALTER TABLE public.immobile_pipeline_stato ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Consenti accesso completo agli agenti autenticati" ON public.immobile_pipeline_stato
    AS PERMISSIVE FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- immobile_documenti: per-document checklist state, many rows per immobile.
-- Rows are created on demand (app/edge-function logic reads documenti_catalogo
-- for the immobile's current fase and inserts missing rows) rather than via a
-- DB trigger, to keep this first pass simple.
-- -----------------------------------------------------------------------------
CREATE TABLE public.immobile_documenti (
    id               uuid NOT NULL DEFAULT gen_random_uuid(),
    immobile_id      uuid NOT NULL,
    fase             text NOT NULL CHECK (fase = ANY (ARRAY['Acquisizione'::text, 'In Vendita'::text, 'Venduto'::text, 'Archivio'::text])),
    documento        text NOT NULL,
    stato            text NOT NULL DEFAULT 'Da fare' CHECK (stato = ANY (ARRAY['Da fare'::text, 'Fatto'::text])),
    responsabile_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    completato_at    timestamptz,
    created_at       timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT immobile_documenti_pkey PRIMARY KEY (id),
    CONSTRAINT immobile_documenti_immobile_id_documento_key UNIQUE (immobile_id, documento),
    CONSTRAINT immobile_documenti_immobile_id_fkey FOREIGN KEY (immobile_id) REFERENCES public.immobili(id) ON DELETE CASCADE
);

CREATE INDEX idx_immobile_documenti_immobile_id ON public.immobile_documenti USING btree (immobile_id);

ALTER TABLE public.immobile_documenti ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Consenti accesso completo agli agenti autenticati" ON public.immobile_documenti
    AS PERMISSIVE FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);
