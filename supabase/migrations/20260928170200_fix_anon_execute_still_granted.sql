-- La migration precedente (20260928170100) revocava EXECUTE da PUBLIC, ma su
-- Supabase i ruoli anon/authenticated hanno spesso un grant esplicito separato
-- da PUBLIC (assegnato in automatico alla creazione della funzione). Il revoke
-- da PUBLIC non bastava: anon poteva ancora chiamare entrambe le funzioni.

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_agente_profile() FROM anon, authenticated;
