-- Infrastruttura per il sync mensile automatico dei prezzi OMI.
-- Componenti:
--   1. zone_omi_sync_log     — tabella di audit per ogni esecuzione
--   2. pg_net                — estensione HTTP outbound per pg_cron
--   3. trigger_zone_omi_sync — funzione PL/pgSQL chiamata dal cron
--   4. cron.schedule         — job mensile il 1° del mese alle 07:00 UTC

-- 1. Tabella log
CREATE TABLE IF NOT EXISTS public.zone_omi_sync_log (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    ran_at          timestamptz NOT NULL DEFAULT now(),
    status          text        NOT NULL,
    zones_updated   int         NOT NULL DEFAULT 0,
    zones_unchanged int         NOT NULL DEFAULT 0,
    zones_not_found int         NOT NULL DEFAULT 0,
    source_url      text,
    error_message   text,
    details         jsonb
);

CREATE INDEX IF NOT EXISTS zone_omi_sync_log_ran_at_idx ON public.zone_omi_sync_log (ran_at DESC);

ALTER TABLE public.zone_omi_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sync_log: authenticated read" ON public.zone_omi_sync_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "sync_log: service role all"   ON public.zone_omi_sync_log FOR ALL   USING (auth.role() = 'service_role');
GRANT SELECT ON public.zone_omi_sync_log TO authenticated;

-- 2. pg_net per HTTP outbound
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 3. Funzione wrapper chiamata da pg_cron
--    Legge URL + chiave dal Vault (secrets: SUPABASE_URL, SUPABASE_ANON_KEY).
--    Se il Vault non è configurato, logga un avviso senza bloccare.
CREATE OR REPLACE FUNCTION public.trigger_zone_omi_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
        FROM vault.decrypted_secrets WHERE name = 'SUPABASE_ANON_KEY' LIMIT 1;

        SELECT decrypted_secret INTO v_supabase_url
        FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
        v_anon_key := NULL; v_supabase_url := NULL;
    END;

    IF v_anon_key IS NULL OR v_supabase_url IS NULL THEN
        INSERT INTO public.zone_omi_sync_log (status, zones_not_found, error_message)
        VALUES ('triggered', v_stale_count,
            'Vault keys SUPABASE_ANON_KEY / SUPABASE_URL non configurate. Esegui il sync manualmente.');
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
$$;

COMMENT ON FUNCTION public.trigger_zone_omi_sync IS
    'Chiamata da pg_cron il 1° di ogni mese. Verifica se esistono zone OMI stale (>5 mesi) '
    'e attiva la Edge Function sync-zone-omi via pg_net.';

-- 4. Cron mensile — 1° del mese alle 07:00 UTC
SELECT cron.schedule(
    'sync-zone-omi-monthly',
    '0 7 1 * *',
    'SELECT public.trigger_zone_omi_sync()'
);
