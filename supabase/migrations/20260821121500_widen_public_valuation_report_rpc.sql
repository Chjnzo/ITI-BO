-- La RPC get_public_valuation_report (migration precedente) restituiva solo un sottoinsieme
-- minimo di colonne: il report pubblico ne usa molte di più (caratteristiche immobile, zona OMI,
-- comparabili, breakdown stima). Qui viene allargata per replicare esattamente ciò che
-- ValuazioneReport.tsx renderizzava prima del fix RLS, incluso il join non sensibile su
-- zone_omi (già pubblico di suo), escludendo però `lead_id`/`agente_id` che non servono al
-- report pubblico e non erano comunque mostrati (solo presenti "in più" nella vecchia query
-- select('*'), visibili in Network tab senza necessità).
DROP FUNCTION IF EXISTS public.get_public_valuation_report(text);

CREATE FUNCTION public.get_public_valuation_report(p_slug text)
RETURNS TABLE (
  id uuid,
  indirizzo text,
  citta text,
  tipologia text,
  superficie_mq integer,
  piano text,
  num_locali integer,
  num_camere integer,
  num_bagni integer,
  anno_costruzione integer,
  stato_conservativo text,
  classe_energetica text,
  tipo_riscaldamento text,
  ha_box boolean,
  ha_posto_auto boolean,
  ha_cantina boolean,
  ha_giardino boolean,
  ascensore boolean,
  ha_terrazzo boolean,
  terrazzo_mq integer,
  anno_ristrutturazione integer,
  dotazioni_extra text[],
  note_tecniche text,
  stima_min numeric,
  stima_max numeric,
  stima_breakdown jsonb,
  motivazione_ai text,
  trend_mercato_locale jsonb,
  descrizione_zona text,
  stima_ristrutturato_min integer,
  stima_ristrutturato_max integer,
  costo_stima_lavori integer,
  tempo_mercato text,
  identikit_compratore text,
  narrativa_dotazioni text,
  poi_summary text,
  comparabili_attivi jsonb,
  latitudine numeric,
  longitudine numeric,
  stato text,
  created_at timestamptz,
  slug text,
  zone_omi jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT v.id, v.indirizzo, v.citta, v.tipologia, v.superficie_mq, v.piano,
         v.num_locali, v.num_camere, v.num_bagni, v.anno_costruzione,
         v.stato_conservativo, v.classe_energetica, v.tipo_riscaldamento,
         v.ha_box, v.ha_posto_auto, v.ha_cantina, v.ha_giardino, v.ascensore,
         v.ha_terrazzo, v.terrazzo_mq, v.anno_ristrutturazione, v.dotazioni_extra,
         v.note_tecniche, v.stima_min, v.stima_max, v.stima_breakdown,
         v.motivazione_ai, v.trend_mercato_locale, v.descrizione_zona,
         v.stima_ristrutturato_min, v.stima_ristrutturato_max, v.costo_stima_lavori,
         v.tempo_mercato, v.identikit_compratore, v.narrativa_dotazioni, v.poi_summary,
         v.comparabili_attivi, v.latitudine, v.longitudine, v.stato, v.created_at, v.slug,
         CASE WHEN z.id IS NULL THEN NULL ELSE jsonb_build_object(
           'codice_zona', z.codice_zona,
           'fascia', z.fascia,
           'zona', z.zona,
           'prezzo_mq_min', z.prezzo_mq_min,
           'prezzo_mq_max', z.prezzo_mq_max,
           'prezzo_mq_medio', z.prezzo_mq_medio
         ) END AS zone_omi
  FROM public.valutazioni v
  LEFT JOIN public.zone_omi z ON z.id = v.zona_omi_id
  WHERE v.slug = p_slug AND v.stato = 'Completata'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_valuation_report(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_valuation_report(text) TO anon;
