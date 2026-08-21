-- Fix RLS: prenotazioni_oh e valutazioni erano leggibili in blocco da anon/public.
-- Trovato durante audit privacy 2026-08-21 (docs/riferimento/mappa_dati_privacy.md §6).

-- 6a) prenotazioni_oh: nessuna funzionalità del sito legge questa tabella (solo INSERT),
-- la lettura pubblica esponeva nome/email/telefono di ogni prenotazione Open House.
DROP POLICY IF EXISTS "Permetti lettura prenotazioni" ON public.prenotazioni_oh;

CREATE POLICY "Agenti autenticati leggono prenotazioni" ON public.prenotazioni_oh
    AS PERMISSIVE FOR SELECT TO authenticated
    USING (true);

-- 6b) valutazioni: la policy "slug IS NOT NULL" filtra per riga, non per query, quindi
-- permetteva di scaricare l'intera tabella (bozze incluse) senza conoscere alcuno slug.
-- Sostituita con una funzione SECURITY DEFINER che restituisce una sola riga per slug esatto,
-- solo se la valutazione è "Completata" (le bozze non sono più pubblicamente visibili).
DROP POLICY IF EXISTS "val_public_report" ON public.valutazioni;

CREATE OR REPLACE FUNCTION public.get_public_valuation_report(p_slug text)
RETURNS TABLE (
  id uuid,
  indirizzo text,
  citta text,
  superficie_mq numeric,
  tipologia text,
  stima_min numeric,
  stima_max numeric,
  motivazione_ai text,
  trend_mercato_locale text,
  slug text,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT id, indirizzo, citta, superficie_mq, tipologia,
         stima_min, stima_max, motivazione_ai, trend_mercato_locale,
         slug, created_at
  FROM public.valutazioni
  WHERE slug = p_slug AND stato = 'Completata'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_valuation_report(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_valuation_report(text) TO anon;
