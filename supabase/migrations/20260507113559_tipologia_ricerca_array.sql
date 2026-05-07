-- Convert tipologia_ricerca from text to text[] to support multiple search types per lead.
-- Existing single values are wrapped into a one-element array; NULLs stay NULL.
ALTER TABLE public.leads
  ALTER COLUMN tipologia_ricerca TYPE text[]
  USING CASE
    WHEN tipologia_ricerca IS NULL OR tipologia_ricerca = '' THEN NULL
    ELSE ARRAY[tipologia_ricerca]
  END;
