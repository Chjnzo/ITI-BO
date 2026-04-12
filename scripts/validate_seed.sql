-- =============================================================================
-- validate_seed.sql
-- Run this in the Supabase SQL Editor after executing seed_market_data.js
-- =============================================================================


-- 1. Row counts per table
SELECT
    'zone_omi'              AS tabella,
    COUNT(*)                AS righe,
    COUNT(geom)             AS con_geometria
FROM public.zone_omi
WHERE provincia = 'BG'

UNION ALL

SELECT
    'transazioni_chiuse',
    COUNT(*),
    COUNT(coordinates)
FROM public.transazioni_chiuse
WHERE citta = 'Bergamo';


-- 2. Zone summary: price bands and computed midpoint (GENERATED ALWAYS AS)
SELECT
    codice_zona,
    zona,
    fascia,
    prezzo_mq_min                               AS min,
    prezzo_mq_max                               AS max,
    prezzo_mq_medio                             AS medio,   -- server-computed
    ST_AsText(geom)                             AS centroide_wkt
FROM public.zone_omi
WHERE provincia = 'BG'
ORDER BY fascia, prezzo_mq_min DESC;


-- 3. Transaction stats by zone (verify realistic distribution)
SELECT
    z.zona,
    z.fascia,
    COUNT(t.id)                                 AS n_transazioni,
    ROUND(MIN(t.prezzo_mq))                     AS prezzo_mq_min,
    ROUND(MAX(t.prezzo_mq))                     AS prezzo_mq_max,
    ROUND(AVG(t.prezzo_mq))                     AS prezzo_mq_medio,
    ROUND(AVG(t.mq), 1)                         AS mq_medio,
    MIN(t.data_chiusura)                        AS prima_vendita,
    MAX(t.data_chiusura)                        AS ultima_vendita
FROM public.transazioni_chiuse t
JOIN public.zone_omi z ON z.id = t.zona_id
WHERE t.citta = 'Bergamo'
GROUP BY z.id, z.zona, z.fascia
ORDER BY z.fascia, prezzo_mq_medio DESC;


-- 4. Spatial sanity check: verify GIST indexes are used and distances are plausible
--    Finds the 5 transactions closest to Piazza Vecchia (Città Alta centroid)
EXPLAIN (ANALYZE, COSTS OFF, FORMAT TEXT)
SELECT
    t.indirizzo,
    t.prezzo_mq,
    ROUND(
        ST_Distance(
            t.coordinates::geography,
            ST_SetSRID(ST_MakePoint(9.6620, 45.7054), 4326)::geography
        )
    )  AS distanza_metri
FROM public.transazioni_chiuse t
WHERE ST_DWithin(
    t.coordinates::geography,
    ST_SetSRID(ST_MakePoint(9.6620, 45.7054), 4326)::geography,
    3000   -- 3 km radius
)
ORDER BY distanza_metri
LIMIT 5;


-- 5. Test nearest_zona_omi() helper function
--    Pass coordinates for Via XX Settembre (Centro Bassa) — should return BG-B2
SELECT
    nearest_zona_omi(9.6682, 45.6941, 'Bergamo')   AS zona_omi_id,
    z.codice_zona,
    z.zona
FROM public.zone_omi z
WHERE z.id = nearest_zona_omi(9.6682, 45.6941, 'Bergamo');


-- 6. Test comparabili_vicini() helper function
--    Returns closest transactions within 1.5 km of Borgo Palazzo centroid
SELECT
    indirizzo,
    prezzo_finale,
    mq,
    prezzo_mq,
    data_chiusura,
    ROUND(distanza_metri::numeric) AS distanza_m
FROM comparabili_vicini(
    9.6850,    -- lon Borgo Palazzo
    45.6910,   -- lat Borgo Palazzo
    1500,      -- radius metres
    10,        -- max results
    24         -- months lookback
);


-- 7. Geometry metadata: confirm SRID and geometry type are correct
SELECT
    f_table_name   AS tabella,
    f_geometry_column AS colonna,
    srid,
    type
FROM geometry_columns
WHERE f_table_schema = 'public'
  AND f_table_name IN ('zone_omi', 'transazioni_chiuse', 'valutazioni')
ORDER BY tabella;
