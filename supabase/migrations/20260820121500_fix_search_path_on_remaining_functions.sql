-- Pin search_path per Supabase advisor lint 0011 (function_search_path_mutable).
-- comparabili_vicini and nearest_zona_omi call PostGIS functions (ST_Distance, ST_DWithin,
-- ST_SetSRID, ST_MakePoint), which live in the "extensions" schema — must stay in the path
-- or these functions break.
ALTER FUNCTION public.comparabili_vicini(double precision, double precision, double precision, integer, integer)
  SET search_path = public, extensions;

ALTER FUNCTION public.nearest_zona_omi(double precision, double precision, text, double precision)
  SET search_path = public, extensions;

-- Pure trigger function, no extension dependency.
ALTER FUNCTION public.update_valutazioni_timestamp()
  SET search_path = public;
