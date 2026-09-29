-- Chiude il warning "function_search_path_mutable" del linter Supabase:
-- entrambe le funzioni sono trigger su profili_agenti e non dichiaravano un
-- search_path esplicito. Nessun cambio di comportamento, solo hardening.

CREATE OR REPLACE FUNCTION public.enforce_ruolo_change_admin_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND NEW.ruolo IS DISTINCT FROM OLD.ruolo AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un Admin può modificare il ruolo di un agente.';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_is_admin_from_ruolo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.is_admin := (NEW.ruolo = 'Admin');
  RETURN NEW;
END;
$function$;
