-- Chiude i warning "SECURITY DEFINER pubblica" per 2 funzioni che non sono
-- pensate per essere chiamate direttamente via RPC:
--   - is_admin(): helper usato dalle policy RLS di profili_agenti/alert_regole.
--     Resta eseguibile da `authenticated` (le policy ne hanno bisogno) ma non
--     più direttamente chiamabile da `anon` via /rest/v1/rpc/is_admin.
--   - handle_new_agente_profile(): trigger su auth.users, non richiede alcun
--     grant per essere eseguita (i trigger non controllano l'EXECUTE del
--     ruolo che li scatena), quindi nessun grant esplicito dopo la revoke.
--
-- upsert_lead() e get_public_valuation_report() restano invariate: sono
-- pubbliche di proposito (form di contatto ITI2.0 e report di valutazione
-- condiviso via link).

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.handle_new_agente_profile() FROM PUBLIC;
