-- Fix nearest_zona_omi: add spatial fallback when comune filter finds nothing.
-- Problem: frazioni/quartieri (e.g. "Redona") are stored under a parent comune
-- ("Bergamo") in zone_omi, so ILIKE 'Redona' matched nothing → zona_omi = null
-- → AI hallucinated nearby zones (Campagnola for Redona, Alzano for Villa di Serio).
-- Fix: if step 1 (comune filter) finds nothing, fall back to pure spatial search.

CREATE OR REPLACE FUNCTION public.nearest_zona_omi(
    p_lon           double precision,
    p_lat           double precision,
    p_comune        text             DEFAULT NULL,
    max_distance_m  double precision DEFAULT 5000
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
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
$$;

COMMENT ON FUNCTION public.nearest_zona_omi IS
    'Returns the zone_omi.id closest to a WGS 84 lon/lat point. '
    'Step 1: filters by comune name (ILIKE) within max_distance_m. '
    'Step 2 (fallback): pure spatial search within the same radius — '
    'handles frazioni/quartieri stored under a parent comune.';
