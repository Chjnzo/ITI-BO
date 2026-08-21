-- One-time data backfill: old lead-centric flat fields -> new property-centric
-- tables (see supabase/migrations/20260820160000_property_centric_schema_additive.sql
-- and 20260820161500_add_zona_omi_and_tipologia_to_immobili.sql for the schema).
--
-- NOT a migration file on purpose: migrations run before supabase/seed.sql during
-- `supabase db reset`, so a migration-file version of this script would find no
-- rows to backfill. Run this manually, after data exists.
--
-- Local test:   docker exec -i supabase_db_ITI-BO psql -U postgres -d postgres \
--                 -f scripts/backfill-property-centric-model.sql
-- Production:   only after this has been verified end-to-end in local against
--               data that mirrors known real edge cases, and only after taking a
--               fresh backup. Never run untested against production.
--
-- Idempotent: safe to re-run. Existing values are never overwritten (guarded by
-- IS NULL checks / ON CONFLICT DO NOTHING), so re-running after manual edits in
-- between won't clobber them.

BEGIN;

-- -----------------------------------------------------------------------------
-- Safety check: abort instead of silently picking one if more than one
-- owner-side lead (Proprietario o Ibrido, i due valori reali usati da
-- Leads.tsx per il ruolo venditore -- 'Venditore' non esiste nei dati veri)
-- punta allo stesso immobile_id (proprietario_id è 1 FK, non può avere due
-- proprietari). Surfaces the conflict for a human to resolve first.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    dupe_count integer;
BEGIN
    SELECT count(*) INTO dupe_count
    FROM (
        SELECT immobile_id
        FROM public.leads
        WHERE immobile_id IS NOT NULL
          AND tipo_cliente IN ('Proprietario', 'Ibrido')
        GROUP BY immobile_id
        HAVING count(*) > 1
    ) dupes;

    IF dupe_count > 0 THEN
        RAISE EXCEPTION 'Trovati % immobile_id con più di un lead Proprietario/Ibrido collegato: risolvere manualmente prima del backfill', dupe_count;
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1) immobili: proprietario_id + journey venditore, dai leads Proprietario/Ibrido
--    (valori reali di leads.tipo_cliente, vedi Leads.tsx:1440-1442 -- non
--    'Venditore', che non esiste nei dati).
--    Guardia IS NULL: non sovrascrive un proprietario_id già impostato a mano.
-- -----------------------------------------------------------------------------
UPDATE public.immobili i
SET proprietario_id    = l.id,
    zona_venditore     = l.zona_venditore,
    motivazione_vendita = l.motivazione_vendita,
    scadenza_esclusiva = l.scadenza_esclusiva
FROM public.leads l
WHERE l.immobile_id = i.id
  AND l.tipo_cliente IN ('Proprietario', 'Ibrido')
  AND i.proprietario_id IS NULL;

-- -----------------------------------------------------------------------------
-- 2) lead_ricerca: criteri di ricerca per leads Acquirente/Ibrido.
-- -----------------------------------------------------------------------------
INSERT INTO public.lead_ricerca (lead_id, budget, zone_ricercate, tipologia_ricerca)
SELECT id, budget, zone_ricercate, tipologia_ricerca
FROM public.leads
WHERE tipo_cliente IN ('Acquirente', 'Ibrido')
ON CONFLICT (lead_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 3) immobile_pipeline_stato: una riga per immobile, dedotta dal vecchio
--    `immobili.stato` (Bozza/Disponibile/In Trattativa/Venduto).
-- -----------------------------------------------------------------------------
INSERT INTO public.immobile_pipeline_stato (immobile_id, fase)
SELECT id,
       CASE stato
           WHEN 'Bozza'    THEN 'Acquisizione'
           WHEN 'Venduto'  THEN 'Venduto'
           ELSE 'In Vendita' -- Disponibile, In Trattativa
       END
FROM public.immobili
ON CONFLICT (immobile_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 4) immobile_documenti: crea la checklist per la fase corrente di ogni
--    immobile, tutta 'Da fare'. NON marca come fatti i documenti di fasi
--    precedenti: lo stato reale di completamento storico non è ricostruibile
--    dai dati vecchi, quindi si parte onestamente da zero per ogni immobile e
--    saranno gli agenti a spuntare retroattivamente ciò che è già stato fatto.
-- -----------------------------------------------------------------------------
INSERT INTO public.immobile_documenti (immobile_id, fase, documento)
SELECT ips.immobile_id, ips.fase, dc.documento
FROM public.immobile_pipeline_stato ips
JOIN public.documenti_catalogo dc ON dc.fase = ips.fase
ON CONFLICT (immobile_id, documento) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 5) valutazioni: collega a immobile_id via il lead che l'ha richiesta,
--    quando quel lead aveva già un immobile_id associato.
-- -----------------------------------------------------------------------------
UPDATE public.valutazioni v
SET immobile_id = l.immobile_id
FROM public.leads l
WHERE v.lead_id = l.id
  AND v.immobile_id IS NULL
  AND l.immobile_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Riepilogo per verifica manuale prima del COMMIT.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    RAISE NOTICE 'immobili con proprietario_id: %', (SELECT count(*) FROM public.immobili WHERE proprietario_id IS NOT NULL);
    RAISE NOTICE 'righe lead_ricerca: %', (SELECT count(*) FROM public.lead_ricerca);
    RAISE NOTICE 'righe immobile_pipeline_stato: % (immobili totali: %)',
        (SELECT count(*) FROM public.immobile_pipeline_stato), (SELECT count(*) FROM public.immobili);
    RAISE NOTICE 'righe immobile_documenti: %', (SELECT count(*) FROM public.immobile_documenti);
    RAISE NOTICE 'valutazioni con immobile_id: % (valutazioni totali: %)',
        (SELECT count(*) FROM public.valutazioni WHERE immobile_id IS NOT NULL), (SELECT count(*) FROM public.valutazioni);
END $$;

COMMIT;
