-- Aggiorna trigger_zone_omi_sync per leggere i segreti Vault con i nomi
-- APP_SUPABASE_URL e APP_SUPABASE_ANON_KEY invece di SUPABASE_URL / SUPABASE_ANON_KEY,
-- evitando collisioni con le env var auto-iniettate dal runtime di Supabase.

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
$$;

COMMENT ON FUNCTION public.trigger_zone_omi_sync IS
    'Chiamata da pg_cron il 1° di ogni mese. Verifica se esistono zone OMI stale (>5 mesi) '
    'e attiva la Edge Function sync-zone-omi via pg_net. '
    'Legge APP_SUPABASE_URL e APP_SUPABASE_ANON_KEY dal Vault.';
