-- =============================================================================
-- BASELINE SNAPSHOT — production schema `xzdazmzjltxsxyqokxdh`
-- =============================================================================
-- Generated: 2026-08-20, via read-only introspection of the production
-- Supabase project (information_schema / pg_catalog / pg_policies / pg_proc).
--
-- This file is a faithful reconstruction of the CURRENT production `public`
-- schema. It is NOT yet reviewed/confirmed by a human as authoritative — see
-- docs/STATO.md. The previously-existing 11 migration files in this folder
-- did not reflect production reality: 22+ tracked migrations (per
-- `list_migrations`) had no corresponding local file, and 16 core tables had
-- no CREATE TABLE anywhere in the repo (created directly on the Supabase
-- dashboard before migrations were adopted here).
--
-- Do NOT treat this file as a "migration to re-run" against production — it
-- is a snapshot for local/dev environments and future diffing purposes. Items
-- that look inconsistent or risky are flagged inline with `-- TODO(review):`
-- rather than silently fixed or omitted.
-- =============================================================================


-- =============================================================================
-- 1. EXTENSIONS
-- =============================================================================
-- Only extensions with a non-null `installed_version` in production (per
-- `list_extensions`) are included below. Dozens of others are merely
-- *available* on the Postgres image and are NOT installed — they are
-- intentionally omitted (e.g. pg_trgm, unaccent, vector, pgjwt, etc).

CREATE EXTENSION IF NOT EXISTS "uuid-ossp"        WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto"         WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pg_net"           WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "postgis"          WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pg_cron"          WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS "supabase_vault"   WITH SCHEMA vault;


-- =============================================================================
-- 2. TABLES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 2.1 zone_omi — OMI official zone reference with price bands per comune/fascia
-- -----------------------------------------------------------------------------
CREATE TABLE public.zone_omi (
    id               uuid NOT NULL DEFAULT gen_random_uuid(),
    codice_zona      text NOT NULL,
    comune           text NOT NULL,
    provincia        text NOT NULL,
    fascia           text NOT NULL,
    zona             text,
    link_istituzionale text,
    prezzo_mq_min    numeric(10,2),
    prezzo_mq_max    numeric(10,2),
    prezzo_mq_medio  numeric(10,2) GENERATED ALWAYS AS ((prezzo_mq_min + prezzo_mq_max) / 2::numeric) STORED,
    geom             extensions.geometry(Point, 4326),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT zone_omi_pkey PRIMARY KEY (id)
);

COMMENT ON TABLE public.zone_omi IS 'OMI official zone reference with price bands per comune/fascia.';
COMMENT ON COLUMN public.zone_omi.geom IS 'WGS 84 centroid (SRID 4326). Cast to ::geography for ST_Distance in metres.';
COMMENT ON COLUMN public.zone_omi.prezzo_mq_medio IS 'Computed midpoint; always in sync via GENERATED ALWAYS.';

CREATE INDEX zone_omi_comune_idx ON public.zone_omi USING btree (comune, provincia);
CREATE INDEX zone_omi_geom_idx ON public.zone_omi USING gist (geom);


-- -----------------------------------------------------------------------------
-- 2.2 immobili — property listings
-- -----------------------------------------------------------------------------
CREATE TABLE public.immobili (
    id                  uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
    created_at          timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    titolo              text,
    prezzo              numeric,
    mq                  integer,
    locali              text,
    bagni               integer,
    piano               text,
    indirizzo           text,
    descrizione         text,
    classe_energetica   text,
    garage              boolean DEFAULT false,
    stato               text DEFAULT 'Disponibile'::text,
    copertina_url       text,
    immagini_urls       text[],
    slug                text,
    stanze              integer,
    giardino            boolean DEFAULT false,
    balcone             boolean DEFAULT false,
    in_evidenza         boolean DEFAULT false,
    link_immobiliare    text,
    spese_condominiali  numeric DEFAULT 0,
    stato_immobile      text,
    anno_costruzione    integer,
    caratteristiche     text[] DEFAULT '{}'::text[],
    proprietario        text,
    citta               text,
    is_deleted          boolean NOT NULL DEFAULT false,
    deleted_at          timestamptz,
    _version            integer NOT NULL DEFAULT 1,
    visibile            boolean NOT NULL DEFAULT true,
    CONSTRAINT immobili_pkey PRIMARY KEY (id),
    CONSTRAINT immobili_slug_key UNIQUE (slug),
    CONSTRAINT stato_check CHECK (stato = ANY (ARRAY['Disponibile'::text, 'In Trattativa'::text, 'Venduto'::text, 'Bozza'::text]))
);


-- -----------------------------------------------------------------------------
-- 2.3 leads
-- -----------------------------------------------------------------------------
CREATE TABLE public.leads (
    id                    uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
    created_at            timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    nome                  text NOT NULL,
    email                 text,
    telefono              text,
    messaggio             text,
    immobile_interesse    text,
    stato                 text DEFAULT 'nuovo'::text,
    immobile_id           uuid,
    cognome               text,
    budget                numeric,
    tipologia_ricerca     text[],
    note_interne          text,
    tipo_cliente          text DEFAULT 'Acquirente'::text,
    valutazione_stimata   numeric,
    scadenza_esclusiva    date,
    motivazione_vendita   text,
    zona_venditore        text,
    stato_venditore       text DEFAULT 'Nuovo'::text,
    is_deleted            boolean NOT NULL DEFAULT false,
    deleted_at            timestamptz,
    _version              integer NOT NULL DEFAULT 1,
    zone_ricercate        text[],
    telefono_fisso        text,
    via_immobile          text,
    assegnato_a           text,
    fonte                 text NOT NULL DEFAULT 'manuale'::text,
    telefono_clean        text GENERATED ALWAYS AS (regexp_replace(COALESCE(telefono, ''::text), '[\s\-\.\+\(\)]'::text, ''::text, 'g'::text)) STORED,
    budget_text           text GENERATED ALWAYS AS (
        CASE
            WHEN (budget IS NULL) THEN NULL::text
            ELSE ((floor(budget))::bigint)::text
        END
    ) STORED,
    CONSTRAINT leads_pkey PRIMARY KEY (id),
    CONSTRAINT leads_immobile_id_fkey FOREIGN KEY (immobile_id) REFERENCES public.immobili(id) ON DELETE SET NULL,
    CONSTRAINT leads_stato_venditore_check CHECK (stato_venditore = ANY (ARRAY['Nuovo'::text, 'Valutazione fatta'::text, 'Chiuso'::text]))
);
-- NOTE: `zone_ricercate` (text[], column) coexists with the junction table
-- `lead_zone_ricercate` referenced by CLAUDE.md, which production's migration
-- history shows was DROPPED by `cleanup_zone_system`. CLAUDE.md is stale on
-- this point — the live schema keeps search zones as plain array columns
-- (`zone_ricercate` here, `tipologia_ricerca` also array) rather than a
-- junction table.
-- TODO(review): confirm with a human whether `zone_ricercate` (array) is the
-- single source of truth going forward, or whether reintroducing a junction
-- table is planned — CLAUDE.md still documents `lead_zone_ricercate` as if it
-- exists.

CREATE INDEX idx_leads_immobile_id ON public.leads USING btree (immobile_id);
CREATE INDEX leads_budget_text_idx ON public.leads USING btree (budget_text);
CREATE INDEX leads_telefono_clean_idx ON public.leads USING btree (telefono_clean);


-- -----------------------------------------------------------------------------
-- 2.4 open_houses
-- -----------------------------------------------------------------------------
CREATE TABLE public.open_houses (
    id             uuid NOT NULL DEFAULT gen_random_uuid(),
    immobile_id    uuid,
    data_evento    date NOT NULL,
    ora_inizio     time without time zone NOT NULL,
    ora_fine       time without time zone NOT NULL,
    posti_totali   integer DEFAULT 15,
    created_at     timestamptz DEFAULT timezone('utc'::text, now()),
    CONSTRAINT open_houses_pkey PRIMARY KEY (id),
    CONSTRAINT open_houses_immobile_id_fkey FOREIGN KEY (immobile_id) REFERENCES public.immobili(id) ON DELETE CASCADE
);


-- -----------------------------------------------------------------------------
-- 2.5 prenotazioni_oh
-- -----------------------------------------------------------------------------
CREATE TABLE public.prenotazioni_oh (
    id             uuid NOT NULL DEFAULT gen_random_uuid(),
    open_house_id  uuid,
    nome           text NOT NULL,
    email          text NOT NULL,
    telefono       text,
    orario_scelto  time without time zone,
    created_at     timestamptz DEFAULT timezone('utc'::text, now()),
    CONSTRAINT prenotazioni_oh_pkey PRIMARY KEY (id),
    CONSTRAINT prenotazioni_oh_open_house_email_unique UNIQUE (open_house_id, email),
    CONSTRAINT prenotazioni_oh_open_house_id_fkey FOREIGN KEY (open_house_id) REFERENCES public.open_houses(id) ON DELETE CASCADE
);


-- -----------------------------------------------------------------------------
-- 2.6 lead_immobili — junction leads <-> immobili
-- -----------------------------------------------------------------------------
CREATE TABLE public.lead_immobili (
    id               uuid NOT NULL DEFAULT gen_random_uuid(),
    lead_id          uuid,
    immobile_id      uuid,
    stato_interesse  text DEFAULT 'Richiesta dal Web'::text,
    note             text,
    created_at       timestamptz DEFAULT now(),
    CONSTRAINT lead_immobili_pkey PRIMARY KEY (id),
    CONSTRAINT lead_immobili_lead_id_immobile_id_key UNIQUE (lead_id, immobile_id),
    CONSTRAINT lead_immobili_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE,
    CONSTRAINT lead_immobili_immobile_id_fkey FOREIGN KEY (immobile_id) REFERENCES public.immobili(id) ON DELETE CASCADE
);


-- -----------------------------------------------------------------------------
-- 2.7 lead_notes — timestamped notes on leads (also used by auditLogger)
-- -----------------------------------------------------------------------------
CREATE TABLE public.lead_notes (
    id          uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
    created_at  timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    lead_id     uuid NOT NULL,
    testo       text NOT NULL,
    autore      text DEFAULT 'Agente'::text,
    CONSTRAINT lead_notes_pkey PRIMARY KEY (id),
    CONSTRAINT lead_notes_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE
);

CREATE INDEX idx_lead_notes_lead_id ON public.lead_notes USING btree (lead_id);


-- -----------------------------------------------------------------------------
-- 2.8 profili_agenti — agent profiles (1:1 with auth.users)
-- -----------------------------------------------------------------------------
CREATE TABLE public.profili_agenti (
    id                  uuid NOT NULL,
    nome_completo       text NOT NULL,
    colore_calendario   text DEFAULT '#3b82f6'::text,
    avatar_url          text,
    is_admin            boolean NOT NULL DEFAULT false,
    CONSTRAINT profili_agenti_pkey PRIMARY KEY (id),
    CONSTRAINT profili_agenti_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
);


-- -----------------------------------------------------------------------------
-- 2.9 tasks
-- -----------------------------------------------------------------------------
CREATE TABLE public.tasks (
    id          uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
    created_at  timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    lead_id     uuid,
    agente_id   uuid NOT NULL,
    nota        text,
    data        date NOT NULL,
    ora         time without time zone,
    stato       text NOT NULL DEFAULT 'Da fare'::text,
    titolo      text,
    is_deleted  boolean NOT NULL DEFAULT false,
    deleted_at  timestamptz,
    telefono    text,
    colore      text,
    CONSTRAINT tasks_pkey PRIMARY KEY (id),
    CONSTRAINT tasks_agente_id_fkey FOREIGN KEY (agente_id) REFERENCES auth.users(id) ON DELETE CASCADE,
    CONSTRAINT tasks_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE,
    CONSTRAINT tasks_stato_check CHECK (stato = ANY (ARRAY['Da fare'::text, 'Completata'::text]))
);
-- NOTE: `tasks.tipologia` (Chiamata/WhatsApp/Appuntamento per CLAUDE.md) is NOT
-- a column in production — TIPOLOGIA_CONFIG in TaskModal.tsx apparently keys
-- off `titolo` and/or `colore` instead. Kept as-is (faithful to production);
-- flagging for awareness since CLAUDE.md documents a `tipologia` column here.

CREATE INDEX idx_tasks_agente_id ON public.tasks USING btree (agente_id);
CREATE INDEX idx_tasks_data ON public.tasks USING btree (data);
CREATE INDEX idx_tasks_lead_id ON public.tasks USING btree (lead_id);
CREATE INDEX idx_tasks_stato ON public.tasks USING btree (stato);


-- -----------------------------------------------------------------------------
-- 2.10 appuntamenti — agenda calendar events
-- -----------------------------------------------------------------------------
CREATE TABLE public.appuntamenti (
    id                       uuid NOT NULL DEFAULT gen_random_uuid(),
    agente_id                uuid,
    lead_id                  uuid,
    immobile_id              uuid,
    tipologia                text NOT NULL,
    data                     date NOT NULL,
    ora_inizio               time without time zone,
    ora_fine                 time without time zone,
    note                     text,
    created_at               timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    indirizzo_appuntamento   text,
    CONSTRAINT appuntamenti_pkey PRIMARY KEY (id),
    CONSTRAINT appuntamenti_agente_id_fkey FOREIGN KEY (agente_id) REFERENCES public.profili_agenti(id) ON DELETE CASCADE,
    CONSTRAINT appuntamenti_immobile_id_fkey FOREIGN KEY (immobile_id) REFERENCES public.immobili(id) ON DELETE SET NULL,
    CONSTRAINT appuntamenti_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL
);

CREATE INDEX idx_appuntamenti_agente ON public.appuntamenti USING btree (agente_id);
CREATE INDEX idx_appuntamenti_data ON public.appuntamenti USING btree (data);


-- -----------------------------------------------------------------------------
-- 2.11 valutazioni — AI property valuations
-- -----------------------------------------------------------------------------
CREATE TABLE public.valutazioni (
    id                        uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
    lead_id                   uuid,
    agente_id                 uuid,
    indirizzo                 text NOT NULL,
    citta                     text DEFAULT 'Ranica'::text,
    tipologia                 text,
    superficie_mq             integer NOT NULL,
    piano                     text,
    ascensore                 boolean DEFAULT false,
    num_locali                integer,
    num_bagni                 integer,
    anno_costruzione          integer,
    stato_conservativo        text,
    classe_energetica         text,
    spese_condominiali_annue  numeric,
    ha_box                    boolean DEFAULT false,
    ha_posto_auto             boolean DEFAULT false,
    ha_cantina                boolean DEFAULT false,
    ha_giardino               boolean DEFAULT false,
    note_tecniche             text,
    prezzo_mq_zona            numeric,
    trend_mercato_locale      jsonb,
    stima_min                 numeric,
    stima_max                 numeric,
    motivazione_ai            text,
    slug                      text,
    pdf_url                   text,
    stato                     text DEFAULT 'Bozza'::text,
    created_at                timestamptz DEFAULT now(),
    updated_at                timestamptz DEFAULT now(),
    latitudine                numeric(9,6),
    longitudine               numeric(9,6),
    zona_omi_id               uuid,
    stima_breakdown           jsonb,
    status                    text DEFAULT 'draft'::text,
    descrizione_zona          text,
    num_camere                integer,
    tipo_riscaldamento        text,
    stima_ristrutturato_min   integer,
    stima_ristrutturato_max   integer,
    costo_stima_lavori        integer,
    tempo_mercato             text,
    identikit_compratore      text,
    narrativa_dotazioni       text,
    poi_summary               text,
    comparabili_attivi        jsonb,
    mapbox_image_url          text,
    ha_terrazzo               boolean DEFAULT false,
    terrazzo_mq               integer,
    anno_ristrutturazione     integer,
    dotazioni_extra           text[] DEFAULT '{}'::text[],
    CONSTRAINT valutazioni_pkey PRIMARY KEY (id),
    CONSTRAINT valutazioni_slug_key UNIQUE (slug),
    CONSTRAINT valutazioni_agente_id_fkey FOREIGN KEY (agente_id) REFERENCES public.profili_agenti(id),
    CONSTRAINT valutazioni_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE,
    CONSTRAINT valutazioni_zona_omi_id_fkey FOREIGN KEY (zona_omi_id) REFERENCES public.zone_omi(id) ON DELETE SET NULL,
    CONSTRAINT valutazioni_status_check CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text]))
);

COMMENT ON COLUMN public.valutazioni.latitudine IS 'WGS 84 latitude from Nominatim geocoding.';
COMMENT ON COLUMN public.valutazioni.longitudine IS 'WGS 84 longitude from Nominatim geocoding.';
COMMENT ON COLUMN public.valutazioni.zona_omi_id IS 'Nearest OMI zone resolved via ST_DWithin at valuation time.';
COMMENT ON COLUMN public.valutazioni.stima_breakdown IS 'JSONB: OMI base, comparable average, AI corrective factors, confidence score.';
-- NOTE: two parallel status columns coexist here — legacy `stato`
-- ('Bozza'/'Completata', used by the CRM UI per CLAUDE.md) and newer `status`
-- ('draft'/'published'/'archived', CHECK-constrained). Both are live in
-- production; not consolidated.
-- TODO(review): confirm whether `stato` vs `status` duplication is
-- intentional/in-progress migration, or dead weight from a partial rename.

CREATE INDEX valutazioni_latlon_idx ON public.valutazioni USING btree (latitudine, longitudine) WHERE ((latitudine IS NOT NULL) AND (longitudine IS NOT NULL));
CREATE INDEX valutazioni_zona_omi_idx ON public.valutazioni USING btree (zona_omi_id);


-- -----------------------------------------------------------------------------
-- 2.12 transazioni_chiuse — closed-sale comparables used as valuation evidence
-- -----------------------------------------------------------------------------
CREATE TABLE public.transazioni_chiuse (
    id              uuid NOT NULL DEFAULT gen_random_uuid(),
    indirizzo       text NOT NULL,
    citta           text NOT NULL,
    prezzo_finale   numeric(12,2) NOT NULL,
    mq              numeric(8,2) NOT NULL,
    prezzo_mq       numeric(10,2) NOT NULL,
    num_locali      smallint,
    data_chiusura   date NOT NULL,
    zona_id         uuid,
    agente_id       uuid,
    coordinates     extensions.geometry(Point, 4326),
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT transazioni_chiuse_pkey PRIMARY KEY (id),
    CONSTRAINT transazioni_chiuse_zona_id_fkey FOREIGN KEY (zona_id) REFERENCES public.zone_omi(id) ON DELETE SET NULL,
    CONSTRAINT transazioni_chiuse_agente_id_fkey FOREIGN KEY (agente_id) REFERENCES public.profili_agenti(id) ON DELETE SET NULL,
    CONSTRAINT transazioni_chiuse_prezzo_finale_check CHECK (prezzo_finale > 0::numeric),
    CONSTRAINT transazioni_chiuse_mq_check CHECK (mq > 0::numeric),
    CONSTRAINT transazioni_chiuse_prezzo_mq_check CHECK (prezzo_mq > 0::numeric)
);

COMMENT ON TABLE public.transazioni_chiuse IS 'Closed-sale comparables used as evidence in property valuations.';
COMMENT ON COLUMN public.transazioni_chiuse.prezzo_mq IS 'Stored (not computed) to allow manual adjustment for atypical sales.';
COMMENT ON COLUMN public.transazioni_chiuse.coordinates IS 'WGS 84 exact property location (SRID 4326).';

CREATE INDEX transazioni_chiuse_agente_idx ON public.transazioni_chiuse USING btree (agente_id);
CREATE INDEX transazioni_chiuse_coordinates_idx ON public.transazioni_chiuse USING gist (coordinates);
CREATE INDEX transazioni_chiuse_data_idx ON public.transazioni_chiuse USING btree (data_chiusura DESC);
CREATE INDEX transazioni_chiuse_zona_idx ON public.transazioni_chiuse USING btree (zona_id);


-- -----------------------------------------------------------------------------
-- 2.13 valutazione_comparabili — audit junction: comparables used per valuation
-- -----------------------------------------------------------------------------
CREATE TABLE public.valutazione_comparabili (
    id               uuid NOT NULL DEFAULT gen_random_uuid(),
    valutazione_id   uuid NOT NULL,
    transazione_id   uuid NOT NULL,
    distanza_metri   numeric(10,2),
    created_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT valutazione_comparabili_pkey PRIMARY KEY (id),
    CONSTRAINT valutazione_comparabili_unique UNIQUE (valutazione_id, transazione_id),
    CONSTRAINT valutazione_comparabili_valutazione_id_fkey FOREIGN KEY (valutazione_id) REFERENCES public.valutazioni(id) ON DELETE CASCADE,
    CONSTRAINT valutazione_comparabili_transazione_id_fkey FOREIGN KEY (transazione_id) REFERENCES public.transazioni_chiuse(id) ON DELETE RESTRICT
);

COMMENT ON TABLE public.valutazione_comparabili IS 'Audit junction: which transactions were used as comparables per valuation.';
COMMENT ON COLUMN public.valutazione_comparabili.distanza_metri IS 'Cached ST_Distance result in metres at link time.';

CREATE INDEX valutazione_comparabili_trx_idx ON public.valutazione_comparabili USING btree (transazione_id);
CREATE INDEX valutazione_comparabili_val_idx ON public.valutazione_comparabili USING btree (valutazione_id);


-- -----------------------------------------------------------------------------
-- 2.14 audit_log — field-change audit trail (also fed by auditLogger.ts writes
-- to lead_notes; this table is populated by the log_changes() trigger below)
-- -----------------------------------------------------------------------------
CREATE TABLE public.audit_log (
    id          uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id     uuid,
    action      text NOT NULL,
    table_name  text NOT NULL,
    record_id   uuid,
    old_data    jsonb,
    new_data    jsonb,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT audit_log_pkey PRIMARY KEY (id),
    CONSTRAINT audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL
);


-- -----------------------------------------------------------------------------
-- 2.15 immobile_unita — sub-units of a multi-unit immobile listing
-- -----------------------------------------------------------------------------
CREATE TABLE public.immobile_unita (
    id             uuid NOT NULL DEFAULT gen_random_uuid(),
    immobile_id    uuid NOT NULL,
    tipologia      text NOT NULL,
    superficie_mq  integer NOT NULL,
    piano          text NOT NULL,
    bagni          smallint NOT NULL DEFAULT 1,
    camere         smallint NOT NULL DEFAULT 1,
    terrazzo       boolean NOT NULL DEFAULT false,
    prezzo         integer,
    stato          text NOT NULL DEFAULT 'Disponibile'::text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT immobile_unita_pkey PRIMARY KEY (id),
    CONSTRAINT immobile_unita_immobile_id_fkey FOREIGN KEY (immobile_id) REFERENCES public.immobili(id) ON DELETE CASCADE,
    CONSTRAINT immobile_unita_stato_check CHECK (stato = ANY (ARRAY['Disponibile'::text, 'Riservato'::text, 'Venduto'::text]))
);

CREATE INDEX immobile_unita_immobile_id_idx ON public.immobile_unita USING btree (immobile_id);


-- -----------------------------------------------------------------------------
-- 2.16 tipologie_appuntamenti — agenda event type master data (colors/order)
-- -----------------------------------------------------------------------------
CREATE TABLE public.tipologie_appuntamenti (
    id              uuid NOT NULL DEFAULT gen_random_uuid(),
    nome            text NOT NULL,
    colore_bg       text NOT NULL DEFAULT '#6b7280'::text,
    colore_border   text NOT NULL DEFAULT '#4b5563'::text,
    ordine          integer NOT NULL DEFAULT 0,
    CONSTRAINT tipologie_appuntamenti_pkey PRIMARY KEY (id),
    CONSTRAINT tipologie_appuntamenti_nome_key UNIQUE (nome)
);


-- -----------------------------------------------------------------------------
-- 2.17 zone_omi_sync_log — run history of the OMI zone auto-sync job
-- -----------------------------------------------------------------------------
CREATE TABLE public.zone_omi_sync_log (
    id                uuid NOT NULL DEFAULT gen_random_uuid(),
    ran_at            timestamptz NOT NULL DEFAULT now(),
    status            text NOT NULL,
    zones_updated     integer NOT NULL DEFAULT 0,
    zones_unchanged   integer NOT NULL DEFAULT 0,
    zones_not_found   integer NOT NULL DEFAULT 0,
    source_url        text,
    error_message     text,
    details           jsonb,
    CONSTRAINT zone_omi_sync_log_pkey PRIMARY KEY (id)
);

CREATE INDEX zone_omi_sync_log_ran_at_idx ON public.zone_omi_sync_log USING btree (ran_at DESC);


-- =============================================================================
-- 3. ROW LEVEL SECURITY — enable on all 16 tables (all rls_enabled=true in prod)
-- =============================================================================

ALTER TABLE public.immobili                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.open_houses             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prenotazioni_oh         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_immobili           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_notes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profili_agenti          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appuntamenti            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.valutazioni             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zone_omi                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transazioni_chiuse      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.valutazione_comparabili ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.immobile_unita          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tipologie_appuntamenti  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zone_omi_sync_log       ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- 4. RLS POLICIES — reconstructed 1:1 from pg_policies (schemaname='public')
-- =============================================================================

-- --- appuntamenti -------------------------------------------------------------
CREATE POLICY "Team_Può_Fare_Tutto_Agenda" ON public.appuntamenti
    AS PERMISSIVE FOR ALL TO public
    USING (true);

-- --- audit_log ------------------------------------------------------------
CREATE POLICY "Agents can read audit log" ON public.audit_log
    AS PERMISSIVE FOR SELECT TO authenticated
    USING (true);

-- --- immobile_unita ---------------------------------------------------------
CREATE POLICY "auth_write_unita" ON public.immobile_unita
    AS PERMISSIVE FOR ALL TO public
    USING (auth.role() = 'authenticated'::text)
    WITH CHECK (auth.role() = 'authenticated'::text);

CREATE POLICY "public_read_unita" ON public.immobile_unita
    AS PERMISSIVE FOR SELECT TO public
    USING (EXISTS (
        SELECT 1 FROM immobili i
        WHERE i.id = immobile_unita.immobile_id
          AND i.is_deleted = false
          AND i.stato <> 'Bozza'::text
    ));

-- --- immobili -----------------------------------------------------------------
CREATE POLICY "Admins can insert and update properties" ON public.immobili
    AS PERMISSIVE FOR ALL TO public
    USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Public properties are viewable by everyone" ON public.immobili
    AS PERMISSIVE FOR SELECT TO public
    USING (true);

-- --- lead_immobili --------------------------------------------------------------
CREATE POLICY "Consenti accesso completo agli agenti autenticati" ON public.lead_immobili
    AS PERMISSIVE FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

-- --- lead_notes -----------------------------------------------------------------
CREATE POLICY "Permetti tutto su lead_notes" ON public.lead_notes
    AS PERMISSIVE FOR ALL TO public
    USING (true);

-- --- leads ------------------------------------------------------------------
CREATE POLICY "Admins can update leads" ON public.leads
    AS PERMISSIVE FOR UPDATE TO public
    USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Admins can view leads" ON public.leads
    AS PERMISSIVE FOR SELECT TO public
    USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Public can insert leads" ON public.leads
    AS PERMISSIVE FOR INSERT TO public
    WITH CHECK (true);
-- NOTE: CLAUDE.md states "leads INSERT: anon, authenticated — public contact
-- form via upsert_lead SECURITY DEFINER RPC only", implying direct anon
-- table INSERT should not be possible outside of the RPC. This policy's
-- `roles={public}` + `with_check=true` is a bare table-level allow with no
-- RPC-only restriction; it grants direct INSERT to any anon/authenticated
-- caller, not just via upsert_lead.
-- TODO(review): confirm whether this is intentional (belt-and-suspenders
-- since upsert_lead validates anyway) or a gap versus the documented intent.

-- --- open_houses --------------------------------------------------------------
CREATE POLICY "Admins can delete open houses" ON public.open_houses
    AS PERMISSIVE FOR DELETE TO authenticated
    USING (true);

CREATE POLICY "Admins can insert open houses" ON public.open_houses
    AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK (true);

CREATE POLICY "Admins can update open houses" ON public.open_houses
    AS PERMISSIVE FOR UPDATE TO authenticated
    USING (true);

CREATE POLICY "Open Houses visibili a tutti" ON public.open_houses
    AS PERMISSIVE FOR SELECT TO public
    USING (true);

-- --- prenotazioni_oh ------------------------------------------------------------
CREATE POLICY "Authenticated agents can delete bookings" ON public.prenotazioni_oh
    AS PERMISSIVE FOR DELETE TO authenticated
    USING (true);

CREATE POLICY "Permetti lettura prenotazioni" ON public.prenotazioni_oh
    AS PERMISSIVE FOR SELECT TO public
    USING (true);

CREATE POLICY "Tutti possono prenotarsi" ON public.prenotazioni_oh
    AS PERMISSIVE FOR INSERT TO public
    WITH CHECK (true);

-- --- profili_agenti -------------------------------------------------------------
CREATE POLICY "Permetti tutto su profili_agenti" ON public.profili_agenti
    AS PERMISSIVE FOR ALL TO public
    USING (true);

-- --- tasks ------------------------------------------------------------------
CREATE POLICY "Authenticated users can delete own tasks" ON public.tasks
    AS PERMISSIVE FOR DELETE TO authenticated
    USING (auth.uid() = agente_id);

CREATE POLICY "Authenticated users can insert tasks" ON public.tasks
    AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = agente_id);

CREATE POLICY "Authenticated users can update tasks" ON public.tasks
    AS PERMISSIVE FOR UPDATE TO authenticated
    USING (true);

CREATE POLICY "Authenticated users can view all tasks" ON public.tasks
    AS PERMISSIVE FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Team_Può_Fare_Tutto" ON public.tasks
    AS PERMISSIVE FOR ALL TO public
    USING (true);
-- NOTE: `tasks` carries both a broad public/ALL policy ("Team_Può_Fare_Tutto")
-- and narrower authenticated-only policies (insert/update/delete/select
-- above). Since RLS policies are OR'd together, the narrower policies are
-- effectively superseded by the permissive ALL/public one.
-- TODO(review): the narrower policies appear to be dead weight given the
-- ALL/public policy already grants everything — confirm intent before
-- removing either set.

-- --- tipologie_appuntamenti -----------------------------------------------------
CREATE POLICY "authenticated_manage" ON public.tipologie_appuntamenti
    AS PERMISSIVE FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "authenticated_read" ON public.tipologie_appuntamenti
    AS PERMISSIVE FOR SELECT TO authenticated
    USING (true);

-- --- transazioni_chiuse -----------------------------------------------------
CREATE POLICY "transazioni_chiuse: agent insert" ON public.transazioni_chiuse
    AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK (agente_id = auth.uid() OR agente_id IS NULL);

CREATE POLICY "transazioni_chiuse: agent update own" ON public.transazioni_chiuse
    AS PERMISSIVE FOR UPDATE TO authenticated
    USING (agente_id = auth.uid());

CREATE POLICY "transazioni_chiuse: authenticated read" ON public.transazioni_chiuse
    AS PERMISSIVE FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "transazioni_chiuse: service role all" ON public.transazioni_chiuse
    AS PERMISSIVE FOR ALL TO public
    USING (auth.role() = 'service_role'::text);

-- --- valutazione_comparabili --------------------------------------------------
CREATE POLICY "valutazione_comparabili: authenticated insert" ON public.valutazione_comparabili
    AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK (true);

CREATE POLICY "valutazione_comparabili: authenticated read" ON public.valutazione_comparabili
    AS PERMISSIVE FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "valutazione_comparabili: service role all" ON public.valutazione_comparabili
    AS PERMISSIVE FOR ALL TO public
    USING (auth.role() = 'service_role'::text);

-- --- valutazioni --------------------------------------------------------------
CREATE POLICY "val_delete" ON public.valutazioni
    AS PERMISSIVE FOR DELETE TO authenticated
    USING (true);

CREATE POLICY "val_insert" ON public.valutazioni
    AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK (true);

CREATE POLICY "val_public_report" ON public.valutazioni
    AS PERMISSIVE FOR SELECT TO anon
    USING (slug IS NOT NULL);

CREATE POLICY "val_select" ON public.valutazioni
    AS PERMISSIVE FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "val_update" ON public.valutazioni
    AS PERMISSIVE FOR UPDATE TO authenticated
    USING (true);

-- --- zone_omi -----------------------------------------------------------------
CREATE POLICY "zone_omi: public read" ON public.zone_omi
    AS PERMISSIVE FOR SELECT TO public
    USING (true);

CREATE POLICY "zone_omi: service role write" ON public.zone_omi
    AS PERMISSIVE FOR ALL TO public
    USING (auth.role() = 'service_role'::text);

-- --- zone_omi_sync_log ----------------------------------------------------------
CREATE POLICY "sync_log: authenticated read" ON public.zone_omi_sync_log
    AS PERMISSIVE FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "sync_log: service role all" ON public.zone_omi_sync_log
    AS PERMISSIVE FOR ALL TO public
    USING (auth.role() = 'service_role'::text);


-- =============================================================================
-- 5. FUNCTIONS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 5.1 upsert_lead — 8-arg current overload (adds p_tipo_interesse). Called by
-- ITI2.0 ContactForm. SECURITY DEFINER + search_path pinned to 'public'.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_lead(
    p_nome text,
    p_cognome text,
    p_email text,
    p_telefono text,
    p_messaggio text DEFAULT NULL::text,
    p_immobile_id uuid DEFAULT NULL::uuid,
    p_immobile_interesse text DEFAULT NULL::text,
    p_tipo_interesse text DEFAULT 'acquistare'::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_lead_id UUID;
    v_tipo_cliente TEXT;
BEGIN
    v_tipo_cliente := CASE
        WHEN p_tipo_interesse = 'vendere' THEN 'Proprietario'
        ELSE 'Acquirente'
    END;

    IF p_email IS NOT NULL AND p_email <> ''
       AND p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
        RAISE EXCEPTION 'Formato email non valido: %', p_email;
    END IF;

    IF p_email IS NOT NULL AND p_email <> '' THEN
        IF EXISTS (
            SELECT 1 FROM leads
            WHERE email = p_email
              AND created_at > now() - interval '15 minutes'
        ) THEN
            RAISE EXCEPTION 'Too many requests – riprova tra 15 minuti'
                USING ERRCODE = 'P0001';
        END IF;

        IF EXISTS (
            SELECT 1 FROM leads
            WHERE email = p_email
              AND created_at > now() - interval '24 hours'
        ) THEN
            RETURN;
        END IF;
    END IF;

    SELECT id INTO v_lead_id
    FROM leads
    WHERE (email    IS NOT NULL AND email    = p_email)
       OR (telefono IS NOT NULL AND telefono = p_telefono)
    LIMIT 1;

    IF v_lead_id IS NULL THEN
        INSERT INTO leads (nome, cognome, email, telefono, note_interne, tipo_cliente, stato, fonte)
        VALUES (p_nome, p_cognome, p_email, p_telefono, p_messaggio, v_tipo_cliente, 'Nuovo', 'sito')
        RETURNING id INTO v_lead_id;
    ELSE
        UPDATE leads SET
            nome         = COALESCE(NULLIF(p_nome,     ''), nome),
            cognome      = COALESCE(NULLIF(p_cognome,  ''), cognome),
            email        = COALESCE(NULLIF(p_email,    ''), email),
            telefono     = COALESCE(NULLIF(p_telefono, ''), telefono),
            tipo_cliente = v_tipo_cliente,
            note_interne = CASE
                WHEN p_messaggio IS NOT NULL
                THEN COALESCE(note_interne || E'\n---\n', '') || p_messaggio
                ELSE note_interne
            END
        WHERE id = v_lead_id;
    END IF;

    IF p_immobile_id IS NOT NULL AND v_lead_id IS NOT NULL THEN
        INSERT INTO lead_immobili (lead_id, immobile_id, stato_interesse)
        VALUES (v_lead_id, p_immobile_id, 'Interessato')
        ON CONFLICT (lead_id, immobile_id) DO NOTHING;
    END IF;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 5.2 upsert_lead — 7-arg overload (no p_tipo_interesse), still live alongside
-- the 8-arg one above. Also SECURITY DEFINER + search_path pinned, has
-- cognome + dedup + 15min/24h guards — this is NOT the "old unsafe overload"
-- described in CLAUDE.md as dropped (that one had no cognome/dedup/search_path
-- at all); both overloads present today are the hardened kind.
-- -----------------------------------------------------------------------------
-- TODO(review): two live overloads of the same RPC name (7-arg and 8-arg)
-- both match a call with 7 positional args — confirm which one ITI2.0
-- actually invokes, and whether the 7-arg overload should be dropped now
-- that the 8-arg one covers the same cases plus p_tipo_interesse.
CREATE OR REPLACE FUNCTION public.upsert_lead(
    p_nome text,
    p_cognome text,
    p_email text,
    p_telefono text,
    p_messaggio text DEFAULT NULL::text,
    p_immobile_id uuid DEFAULT NULL::uuid,
    p_immobile_interesse text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_lead_id UUID;
BEGIN
    -- Validate email format (basic RFC-compliant regex)
    IF p_email IS NOT NULL AND p_email <> ''
       AND p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
        RAISE EXCEPTION 'Formato email non valido: %', p_email;
    END IF;

    IF p_email IS NOT NULL AND p_email <> '' THEN
        -- 15-minute hard rate limit
        IF EXISTS (
            SELECT 1 FROM leads
            WHERE email = p_email
              AND created_at > now() - interval '15 minutes'
        ) THEN
            RAISE EXCEPTION 'Too many requests – riprova tra 15 minuti'
                USING ERRCODE = 'P0001';
        END IF;

        -- 24-hour duplicate guard: silently skip
        IF EXISTS (
            SELECT 1 FROM leads
            WHERE email = p_email
              AND created_at > now() - interval '24 hours'
        ) THEN
            RETURN;
        END IF;
    END IF;

    -- Try to find an existing lead by email or phone
    SELECT id INTO v_lead_id
    FROM leads
    WHERE (email    IS NOT NULL AND email    = p_email)
       OR (telefono IS NOT NULL AND telefono = p_telefono)
    LIMIT 1;

    IF v_lead_id IS NULL THEN
        INSERT INTO leads (nome, cognome, email, telefono, note_interne, tipo_cliente, stato, fonte)
        VALUES (p_nome, p_cognome, p_email, p_telefono, p_messaggio, 'Acquirente', 'Nuovo', 'sito')
        RETURNING id INTO v_lead_id;
    ELSE
        UPDATE leads SET
            nome     = COALESCE(NULLIF(p_nome,     ''), nome),
            cognome  = COALESCE(NULLIF(p_cognome,  ''), cognome),
            email    = COALESCE(NULLIF(p_email,    ''), email),
            telefono = COALESCE(NULLIF(p_telefono, ''), telefono),
            note_interne = CASE
                WHEN p_messaggio IS NOT NULL
                THEN COALESCE(note_interne || E'\n---\n', '') || p_messaggio
                ELSE note_interne
            END
        WHERE id = v_lead_id;
    END IF;

    -- Link to property if provided
    IF p_immobile_id IS NOT NULL AND v_lead_id IS NOT NULL THEN
        INSERT INTO lead_immobili (lead_id, immobile_id, stato_interesse)
        VALUES (v_lead_id, p_immobile_id, 'Interessato')
        ON CONFLICT (lead_id, immobile_id) DO NOTHING;
    END IF;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 5.3 nearest_zona_omi — multi-pass OMI zone lookup: comune-name match with
-- spatial proximity, falling back to pure spatial search (handles frazioni
-- stored under a parent comune, e.g. "Redona" under "Bergamo").
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.nearest_zona_omi(
    p_lon double precision,
    p_lat double precision,
    p_comune text DEFAULT NULL::text,
    max_distance_m double precision DEFAULT 5000
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
    v_id uuid;
    v_point geography;
BEGIN
    v_point := ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography;

    -- Step 1: try matching by comune name + spatial proximity
    IF p_comune IS NOT NULL THEN
        SELECT id INTO v_id
        FROM   public.zone_omi
        WHERE  comune ILIKE p_comune
          AND  ST_DWithin(geom::geography, v_point, max_distance_m)
        ORDER BY ST_Distance(geom::geography, v_point)
        LIMIT 1;

        IF v_id IS NOT NULL THEN
            RETURN v_id;
        END IF;
    END IF;

    -- Step 2: fallback — pure spatial search ignoring comune name.
    -- Handles frazioni/quartieri (e.g. "Redona") that are stored under
    -- a parent comune ("Bergamo") but have a correctly placed geom.
    SELECT id INTO v_id
    FROM   public.zone_omi
    WHERE  ST_DWithin(geom::geography, v_point, max_distance_m)
    ORDER BY ST_Distance(geom::geography, v_point)
    LIMIT 1;

    RETURN v_id;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 5.4 comparabili_vicini — spatial nearest-neighbour lookup of closed
-- transactions within a radius and time window, used by valuation flows.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.comparabili_vicini(
    p_lon double precision,
    p_lat double precision,
    p_raggio_m double precision DEFAULT 1500,
    p_limit integer DEFAULT 10,
    p_mesi_indietro integer DEFAULT 24
)
RETURNS TABLE(
    id uuid,
    indirizzo text,
    prezzo_finale numeric,
    mq numeric,
    prezzo_mq numeric,
    num_locali smallint,
    data_chiusura date,
    distanza_metri double precision
)
LANGUAGE sql
STABLE
AS $function$
    SELECT
        t.id,
        t.indirizzo,
        t.prezzo_finale,
        t.mq,
        t.prezzo_mq,
        t.num_locali,
        t.data_chiusura,
        ST_Distance(
            t.coordinates::geography,
            ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography
        ) AS distanza_metri
    FROM   public.transazioni_chiuse t
    WHERE  t.coordinates IS NOT NULL
      AND  t.data_chiusura >= (CURRENT_DATE - (p_mesi_indietro || ' months')::interval)
      AND  ST_DWithin(
               t.coordinates::geography,
               ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography,
               p_raggio_m
           )
    ORDER BY distanza_metri ASC
    LIMIT  p_limit;
$function$;

-- -----------------------------------------------------------------------------
-- 5.5 log_changes — generic audit trigger function writing to audit_log.
-- SECURITY DEFINER + search_path pinned to 'public'.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO audit_log (user_id, action, table_name, record_id, old_data, new_data)
  VALUES (
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
    CASE WHEN TG_OP IN ('DELETE', 'UPDATE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 5.6 update_valutazioni_timestamp — BEFORE UPDATE trigger keeping
-- valutazioni.updated_at current. Not SECURITY DEFINER, no search_path set
-- (harmless here — no dynamic SQL / injectable table refs).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_valutazioni_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 5.7 trigger_zone_omi_sync — checks for stale OMI zones (>5 months) and, if
-- vault secrets APP_SUPABASE_ANON_KEY / APP_SUPABASE_URL are configured,
-- invokes the sync-zone-omi Edge Function via pg_net's extensions.http_post.
-- Presumably invoked on a schedule via pg_cron (not captured by this
-- introspection pass — cron.job definitions were out of scope for this
-- snapshot). SECURITY DEFINER + search_path pinned to 'public'.
-- -----------------------------------------------------------------------------
-- TODO(review): if a pg_cron schedule calls this function, it lives in
-- cron.job (a separate catalog) and is NOT captured in this file — check
-- `select * from cron.job` separately if you need to reproduce the schedule.
CREATE OR REPLACE FUNCTION public.trigger_zone_omi_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_stale_count  int;
    v_anon_key     text;
    v_supabase_url text;
BEGIN
    SELECT COUNT(*) INTO v_stale_count
    FROM public.zone_omi
    WHERE updated_at < now() - interval '5 months';

    IF v_stale_count = 0 THEN
        INSERT INTO public.zone_omi_sync_log (status, details)
        VALUES ('skipped_fresh', jsonb_build_object('message', 'All zones updated within 5 months'));
        RETURN;
    END IF;

    BEGIN
        SELECT decrypted_secret INTO v_anon_key
        FROM vault.decrypted_secrets WHERE name = 'APP_SUPABASE_ANON_KEY' LIMIT 1;

        SELECT decrypted_secret INTO v_supabase_url
        FROM vault.decrypted_secrets WHERE name = 'APP_SUPABASE_URL' LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
        v_anon_key := NULL; v_supabase_url := NULL;
    END;

    IF v_anon_key IS NULL OR v_supabase_url IS NULL THEN
        INSERT INTO public.zone_omi_sync_log (status, zones_not_found, error_message)
        VALUES ('triggered', v_stale_count,
            'Vault keys APP_SUPABASE_ANON_KEY / APP_SUPABASE_URL non configurate. Esegui il sync manualmente.');
        RETURN;
    END IF;

    PERFORM extensions.http_post(
        url     := v_supabase_url || '/functions/v1/sync-zone-omi',
        headers := jsonb_build_object(
            'Authorization', 'Bearer ' || v_anon_key,
            'Content-Type',  'application/json'
        ),
        body    := '{"mode":"auto"}'
    );

    INSERT INTO public.zone_omi_sync_log (status, zones_not_found, details)
    VALUES ('triggered', v_stale_count,
        jsonb_build_object('stale_zones', v_stale_count, 'message', 'Edge Function chiamata via pg_net'));
END;
$function$;

-- -----------------------------------------------------------------------------
-- 5.8 process_lead — legacy lead-insert RPC, SECURITY DEFINER WITHOUT a
-- pinned search_path (unlike upsert_lead/log_changes/trigger_zone_omi_sync).
-- -----------------------------------------------------------------------------
-- TODO(review): this function is BROKEN against the current schema — it
-- references `leads.nome_completo` and `leads.messaggio_originale`, neither
-- of which exists on the live `leads` table (the real columns are `nome`,
-- `cognome`, `messaggio`). It also lacks `SET search_path`, which is a
-- SECURITY DEFINER hardening gap present nowhere else in this schema. It is
-- reproduced here verbatim because it exists in production `pg_proc`, but it
-- would raise `column "nome_completo" of relation "leads" does not exist` if
-- ever invoked. Confirm whether it is genuinely dead code safe to DROP, or
-- whether some caller still expects it to work (in which case it needs a
-- real fix, not just a baseline snapshot).
CREATE OR REPLACE FUNCTION public.process_lead(
    p_nome_completo text,
    p_email text,
    p_telefono text,
    p_messaggio text,
    p_tipo_cliente text DEFAULT 'Acquirente'::text,
    p_immobile_interesse text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  new_lead_id uuid;
BEGIN
  INSERT INTO public.leads (
    nome_completo,
    email,
    telefono,
    messaggio_originale,
    tipo_cliente,
    stato
  )
  VALUES (
    p_nome_completo,
    p_email,
    p_telefono,
    p_messaggio,
    p_tipo_cliente,
    'Nuovo'
  )
  RETURNING id INTO new_lead_id;

  -- Se c'è un immobile di interesse, potremmo volerlo loggare o gestire qui
  -- Per ora lo salviamo come nota se vuoi, o lo lasciamo pronto per future tabelle pivot

  RETURN new_lead_id;
END;
$function$;


-- =============================================================================
-- 6. TRIGGERS
-- =============================================================================

CREATE TRIGGER immobili_audit
    AFTER INSERT OR DELETE OR UPDATE ON public.immobili
    FOR EACH ROW EXECUTE FUNCTION public.log_changes();

CREATE TRIGGER leads_audit
    AFTER INSERT OR DELETE OR UPDATE ON public.leads
    FOR EACH ROW EXECUTE FUNCTION public.log_changes();

CREATE TRIGGER tasks_audit
    AFTER INSERT OR DELETE OR UPDATE ON public.tasks
    FOR EACH ROW EXECUTE FUNCTION public.log_changes();

CREATE TRIGGER valutazioni_audit
    AFTER INSERT OR DELETE OR UPDATE ON public.valutazioni
    FOR EACH ROW EXECUTE FUNCTION public.log_changes();

CREATE TRIGGER trigger_update_valutazioni
    BEFORE UPDATE ON public.valutazioni
    FOR EACH ROW EXECUTE FUNCTION public.update_valutazioni_timestamp();

-- =============================================================================
-- END OF BASELINE SNAPSHOT
-- =============================================================================
