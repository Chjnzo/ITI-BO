-- log_changes is only ever invoked as a trigger (immobili_audit, leads_audit, tasks_audit,
-- valutazioni_audit); trigger firing does not require EXECUTE privilege on the invoking
-- session, so revoking public/anon/authenticated access does not break auditing.
REVOKE EXECUTE ON FUNCTION public.log_changes() FROM PUBLIC, anon, authenticated;

-- trigger_zone_omi_sync is only ever invoked by the pg_cron job "sync-zone-omi-monthly",
-- which runs as role "postgres" (function owner) and therefore bypasses ACL checks entirely.
REVOKE EXECUTE ON FUNCTION public.trigger_zone_omi_sync() FROM PUBLIC, anon, authenticated;
