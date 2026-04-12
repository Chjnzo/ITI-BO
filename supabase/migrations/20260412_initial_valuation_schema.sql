-- =============================================================================
-- Migration: 20260412_initial_valuation_schema.sql
-- Purpose:   Add OMI zone data, closed transaction comparables, and valuation
--            linking infrastructure. Upgrades AI-only model to data-driven model.
-- Requires:  PostGIS extension (spatial geometry for proximity queries)
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 0. EXTENSIONS
-- ---------------------------------------------------------------------------

-- PostGIS provides the `geometry` column type and spatial functions such as:
--   ST_Distance()   — compute metres between two geometry points
--   ST_DWithin()    — fast index-assisted radius filter (<N metres)
--   ST_SetSRID()    — assign a coordinate reference system to a geometry
--   ST_MakePoint()  — build a Point geometry from lon/lat values
--
-- SRID 4326 is the WGS 84 standard (GPS coordinates: longitude, latitude).
-- All `geom` and `coordinates` columns in this migration use SRID 4326 so that
-- ST_Distance / ST_DWithin work correctly in degrees-to-metres mode when cast
-- to geography: ST_Distance(a::geography, b::geography) → metres.

CREATE EXTENSION IF NOT EXISTS postgis;


-- ---------------------------------------------------------------------------
-- 1. zone_omi  (OMI official zone reference data)
-- ---------------------------------------------------------------------------
-- Stores the official Agenzia delle Entrate OMI zones with price bands.
-- Each row represents one OMI microzone for a given comune + fascia.
-- `geom` is the centroid point of the zone (populated via geocoding or import).

CREATE TABLE IF NOT EXISTS public.zone_omi (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    codice_zona         text        NOT NULL,               -- e.g. "B1", "C3"
    comune              text        NOT NULL,               -- e.g. "Bologna"
    provincia           text        NOT NULL,               -- e.g. "BO"
    fascia              text        NOT NULL,               -- "B" Centrale / "S" Semicentrale / "P" Periferica / "R" Rurale / "E" Extraurbana
    zona                text,                               -- human-readable zone description
    link_istituzionale  text,                               -- direct URL to the OMI official page
    prezzo_mq_min       numeric(10,2),                      -- €/mq lower bound (residential)
    prezzo_mq_max       numeric(10,2),                      -- €/mq upper bound (residential)
    prezzo_mq_medio     numeric(10,2) GENERATED ALWAYS AS  -- computed midpoint, always in sync
                            ((prezzo_mq_min + prezzo_mq_max) / 2) STORED,
    geom                geometry(Point, 4326),              -- WGS 84 centroid; index below
    updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Spatial index: enables fast ST_DWithin radius queries on zone centroids
CREATE INDEX IF NOT EXISTS zone_omi_geom_idx
    ON public.zone_omi USING GIST (geom);

-- Lookup index for comune + provincia filtering
CREATE INDEX IF NOT EXISTS zone_omi_comune_idx
    ON public.zone_omi (comune, provincia);

COMMENT ON TABLE  public.zone_omi IS 'OMI (Osservatorio Mercato Immobiliare) official zone reference with price bands per comune/fascia.';
COMMENT ON COLUMN public.zone_omi.geom IS 'WGS 84 centroid point (SRID 4326). Use ::geography cast for ST_Distance results in metres.';
COMMENT ON COLUMN public.zone_omi.prezzo_mq_medio IS 'Computed midpoint of min/max; always kept in sync via GENERATED ALWAYS.';


-- ---------------------------------------------------------------------------
-- 2. transazioni_chiuse  (closed transaction comparables)
-- ---------------------------------------------------------------------------
-- Each row is a real sold property used as a comparable in valuations.
-- `prezzo_mq` is stored (not generated) to allow manual overrides for
-- properties with non-standard features (e.g. luxury finishes, structural issues).

CREATE TABLE IF NOT EXISTS public.transazioni_chiuse (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    indirizzo       text        NOT NULL,
    citta           text        NOT NULL,
    prezzo_finale   numeric(12,2) NOT NULL CHECK (prezzo_finale > 0),
    mq              numeric(8,2)  NOT NULL CHECK (mq > 0),
    prezzo_mq       numeric(10,2) NOT NULL CHECK (prezzo_mq > 0),   -- stored; may differ from prezzo_finale/mq for atypical sales
    num_locali      smallint,
    data_chiusura   date        NOT NULL,
    zona_id         uuid        REFERENCES public.zone_omi(id) ON DELETE SET NULL,
    agente_id       uuid        REFERENCES public.profili_agenti(id) ON DELETE SET NULL,
    coordinates     geometry(Point, 4326),                          -- exact property location
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Spatial index: enables fast proximity queries when finding comparables near a target property
CREATE INDEX IF NOT EXISTS transazioni_chiuse_coordinates_idx
    ON public.transazioni_chiuse USING GIST (coordinates);

-- Lookup indexes for common query patterns
CREATE INDEX IF NOT EXISTS transazioni_chiuse_zona_idx
    ON public.transazioni_chiuse (zona_id);

CREATE INDEX IF NOT EXISTS transazioni_chiuse_data_idx
    ON public.transazioni_chiuse (data_chiusura DESC);

CREATE INDEX IF NOT EXISTS transazioni_chiuse_agente_idx
    ON public.transazioni_chiuse (agente_id);

COMMENT ON TABLE  public.transazioni_chiuse IS 'Real closed-sale comparables used as evidence in property valuations.';
COMMENT ON COLUMN public.transazioni_chiuse.prezzo_mq IS 'Stored (not computed) to allow manual adjustment for atypical transactions.';
COMMENT ON COLUMN public.transazioni_chiuse.coordinates IS 'WGS 84 exact property location (SRID 4326). Populated via geocoding at insert time.';


-- ---------------------------------------------------------------------------
-- 3. valutazione_comparabili  (junction: valutazione ↔ transazioni_chiuse)
-- ---------------------------------------------------------------------------
-- Records exactly which comparable transactions were used for each valuation,
-- and the spatial distance between the subject property and each comparable.
-- This audit trail lets agents explain and defend the final estimate.

CREATE TABLE IF NOT EXISTS public.valutazione_comparabili (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    valutazione_id      uuid NOT NULL REFERENCES public.valutazioni(id) ON DELETE CASCADE,
    transazione_id      uuid NOT NULL REFERENCES public.transazioni_chiuse(id) ON DELETE RESTRICT,
    distanza_metri      numeric(10,2),                  -- ST_Distance result at link time (cached for display)
    created_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT valutazione_comparabili_unique UNIQUE (valutazione_id, transazione_id)
);

CREATE INDEX IF NOT EXISTS valutazione_comparabili_valutazione_idx
    ON public.valutazione_comparabili (valutazione_id);

CREATE INDEX IF NOT EXISTS valutazione_comparabili_transazione_idx
    ON public.valutazione_comparabili (transazione_id);

COMMENT ON TABLE  public.valutazione_comparabili IS 'Audit junction: which closed transactions were used as comparables for each valuation, and at what distance.';
COMMENT ON COLUMN public.valutazione_comparabili.distanza_metri IS 'Snapshot of ST_Distance(::geography) in metres at the time the comparable was linked. Cached to avoid re-querying spatial index on report render.';


-- ---------------------------------------------------------------------------
-- 4. ALTER valutazioni  (add spatial + breakdown columns)
-- ---------------------------------------------------------------------------

ALTER TABLE public.valutazioni
    ADD COLUMN IF NOT EXISTS latitudine       numeric(9,6),       -- WGS 84 latitude  (from Nominatim geocoding)
    ADD COLUMN IF NOT EXISTS longitudine      numeric(9,6),       -- WGS 84 longitude (from Nominatim geocoding)
    ADD COLUMN IF NOT EXISTS zona_omi_id      uuid REFERENCES public.zone_omi(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS stima_breakdown  jsonb;              -- AI corrective factors; see note below

-- Partial index: only index valuations that have been geocoded (non-null coordinates).
-- Enables fast spatial lookups when building comparable sets for a new valuation.
CREATE INDEX IF NOT EXISTS valutazioni_latlon_idx
    ON public.valutazioni (latitudine, longitudine)
    WHERE latitudine IS NOT NULL AND longitudine IS NOT NULL;

CREATE INDEX IF NOT EXISTS valutazioni_zona_omi_idx
    ON public.valutazioni (zona_omi_id);

-- stima_breakdown expected JSON shape (not enforced at DB level intentionally —
-- allows the AI prompt to evolve without a migration):
--
--   {
--     "base_prezzo_mq_omi":   2800,          -- OMI midpoint for the matched zone
--     "base_prezzo_mq_comp":  2950,          -- average of comparable transactions
--     "fattori_correttivi": [
--       { "nome": "Piano alto",        "delta_pct":  5  },
--       { "nome": "Classe energetica", "delta_pct": -3  },
--       { "nome": "Ascensore",         "delta_pct":  2  }
--     ],
--     "prezzo_mq_finale":     3068,          -- after corrections
--     "confidence_score":     0.82           -- 0–1; lower = fewer comparables available
--   }

COMMENT ON COLUMN public.valutazioni.latitudine      IS 'WGS 84 latitude from Nominatim geocoding of indirizzo+citta.';
COMMENT ON COLUMN public.valutazioni.longitudine     IS 'WGS 84 longitude from Nominatim geocoding of indirizzo+citta.';
COMMENT ON COLUMN public.valutazioni.zona_omi_id     IS 'Nearest OMI zone resolved via ST_DWithin at valuation time.';
COMMENT ON COLUMN public.valutazioni.stima_breakdown IS 'JSONB breakdown of OMI base price, comparable adjustments, and AI corrective factors.';


-- ---------------------------------------------------------------------------
-- 5. HELPER FUNCTION: nearest_zona_omi()
-- ---------------------------------------------------------------------------
-- Returns the id of the closest zone_omi centroid within `max_distance_m`
-- metres of the supplied lon/lat point.
-- Called by the Edge Function after geocoding to resolve zona_omi_id.

CREATE OR REPLACE FUNCTION public.nearest_zona_omi(
    p_lon           double precision,
    p_lat           double precision,
    p_comune        text             DEFAULT NULL,   -- optional filter to same comune
    max_distance_m  double precision DEFAULT 5000    -- default 5 km search radius
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
    SELECT id
    FROM   public.zone_omi
    WHERE  (p_comune IS NULL OR comune ILIKE p_comune)
      AND  ST_DWithin(
               geom::geography,
               ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography,
               max_distance_m
           )
    ORDER BY
           ST_Distance(
               geom::geography,
               ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography
           )
    LIMIT 1;
$$;

COMMENT ON FUNCTION public.nearest_zona_omi IS
    'Returns the zone_omi.id closest to a WGS 84 lon/lat point, optionally filtered by comune, within max_distance_m metres.';


-- ---------------------------------------------------------------------------
-- 6. HELPER FUNCTION: comparabili_vicini()
-- ---------------------------------------------------------------------------
-- Returns the N closest closed transactions to a subject property location,
-- used by the Edge Function to build the comparable set for a new valuation.

CREATE OR REPLACE FUNCTION public.comparabili_vicini(
    p_lon           double precision,
    p_lat           double precision,
    p_raggio_m      double precision DEFAULT 1500,   -- 1.5 km default radius
    p_limit         int              DEFAULT 10,
    p_mesi_indietro int              DEFAULT 24       -- only recent transactions
)
RETURNS TABLE (
    id              uuid,
    indirizzo       text,
    prezzo_finale   numeric,
    mq              numeric,
    prezzo_mq       numeric,
    num_locali      smallint,
    data_chiusura   date,
    distanza_metri  double precision
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
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
$$;

COMMENT ON FUNCTION public.comparabili_vicini IS
    'Returns the closest N closed transactions within p_raggio_m metres of a WGS 84 point, within the last p_mesi_indietro months.';


-- ---------------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------

-- --- zone_omi: public read-only ---
ALTER TABLE public.zone_omi ENABLE ROW LEVEL SECURITY;

CREATE POLICY "zone_omi: public read"
    ON public.zone_omi
    FOR SELECT
    USING (true);                                           -- no auth required; OMI data is public

CREATE POLICY "zone_omi: service role write"
    ON public.zone_omi
    FOR ALL
    USING (auth.role() = 'service_role');                   -- only Edge Functions / admin scripts can upsert


-- --- transazioni_chiuse: authenticated agents read; owning agent or admin can write ---
ALTER TABLE public.transazioni_chiuse ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transazioni_chiuse: authenticated read"
    ON public.transazioni_chiuse
    FOR SELECT
    TO authenticated
    USING (true);                                           -- all logged-in agents can browse comparables

CREATE POLICY "transazioni_chiuse: agent insert"
    ON public.transazioni_chiuse
    FOR INSERT
    TO authenticated
    WITH CHECK (
        agente_id = auth.uid()                              -- profili_agenti.id IS the auth UID
        OR agente_id IS NULL                                -- allow null agente_id (e.g. seed data)
    );

CREATE POLICY "transazioni_chiuse: agent update own"
    ON public.transazioni_chiuse
    FOR UPDATE
    TO authenticated
    USING (
        agente_id = auth.uid()
    );

CREATE POLICY "transazioni_chiuse: service role all"
    ON public.transazioni_chiuse
    FOR ALL
    USING (auth.role() = 'service_role');                   -- Edge Functions retain full access


-- --- valutazione_comparabili: authenticated agents only ---
ALTER TABLE public.valutazione_comparabili ENABLE ROW LEVEL SECURITY;

CREATE POLICY "valutazione_comparabili: authenticated read"
    ON public.valutazione_comparabili
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "valutazione_comparabili: authenticated write"
    ON public.valutazione_comparabili
    FOR INSERT
    TO authenticated
    WITH CHECK (true);                                      -- agent who saves the valuation links its comparables

CREATE POLICY "valutazione_comparabili: service role all"
    ON public.valutazione_comparabili
    FOR ALL
    USING (auth.role() = 'service_role');


-- ---------------------------------------------------------------------------
-- 8. GRANT PERMISSIONS (anon + authenticated roles via PostgREST)
-- ---------------------------------------------------------------------------

GRANT SELECT ON public.zone_omi TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.transazioni_chiuse TO authenticated;
GRANT SELECT, INSERT ON public.valutazione_comparabili TO authenticated;
GRANT EXECUTE ON FUNCTION public.nearest_zona_omi TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.comparabili_vicini TO authenticated, service_role;
