-- Pivot Proprietari/Acquirenti/Collaboratori, Fase 6: rende operativo il campo
-- profili_agenti.ruolo introdotto (solo schema, nessun enforcement) in
-- 20260821090000_add_ruolo_profili_agenti.sql — vedi docs/DECISIONI.md
-- "2026-08-21 — Ruoli (Admin/Agente/Segreteria) solo a livello di schema/dati",
-- che rimandava esplicitamente RLS + UI a una fase successiva per non fare un
-- enforcement a metà.
--
-- Scope di questa migration, deliberatamente limitato: chi può assegnare il
-- ruolo (solo un Admin) e chi può vedere/modificare le righe profili_agenti.
-- NON introduce una matrice di permessi per ruolo sulle altre tabelle del CRM
-- (leads/contatti/immobili/tasks/...), che restano "authenticated ALL" come
-- documentato in CLAUDE.md: costruire quella matrice senza una richiesta
-- esplicita su quali differenze di accesso servono per Agente vs Segreteria
-- sarebbe di nuovo un enforcement presunto, lo stesso rischio già scartato il
-- 21/08. Qui si chiude solo il gap concreto e non ambiguo: oggi qualsiasi
-- agente autenticato può riassegnarsi da solo il ruolo Admin via client
-- Supabase diretto, since profili_agenti ha ancora la policy permissiva
-- "Authenticated can manage profili_agenti" (FOR ALL USING true WITH CHECK
-- true) ereditata dal baseline.

-- -----------------------------------------------------------------------------
-- 1) is_admin(): helper SECURITY DEFINER per verificare il ruolo dell'utente
--    corrente senza ricorsione RLS (la funzione, di proprietà del ruolo che
--    applica le migration, bypassa RLS su profili_agenti al suo interno).
--    Usata sia dalle policy sotto sia, potenzialmente, da futuri controlli
--    lato RLS su altre tabelle.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profili_agenti
    WHERE id = auth.uid() AND ruolo = 'Admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- -----------------------------------------------------------------------------
-- 2) is_admin resta sincronizzato da ruolo: is_admin era il campo letto finora
--    da Dashboard.tsx (filtro client-side "tutti i leads" vs "i miei"). Invece
--    di cercare e riscrivere ogni lettura esistente, si tiene is_admin come
--    specchio derivato di ruolo così il codice esistente continua a funzionare
--    invariato mentre ruolo diventa la fonte di verità che l'Admin gestisce
--    dalla nuova UI.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_is_admin_from_ruolo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.is_admin := (NEW.ruolo = 'Admin');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_is_admin_from_ruolo ON public.profili_agenti;
CREATE TRIGGER trg_sync_is_admin_from_ruolo
  BEFORE INSERT OR UPDATE ON public.profili_agenti
  FOR EACH ROW EXECUTE FUNCTION public.sync_is_admin_from_ruolo();

-- Backfill una tantum per le righe già esistenti (il trigger copre solo gli
-- INSERT/UPDATE successivi a questa migration).
UPDATE public.profili_agenti SET ruolo = ruolo WHERE is_admin IS DISTINCT FROM (ruolo = 'Admin');

-- -----------------------------------------------------------------------------
-- 3) Solo un Admin può cambiare il ruolo di una riga (propria o altrui). Fatto
--    con un trigger invece che con la sola RLS: un self-update di ruolo va
--    bloccato anche se la policy UPDATE sotto permette "id = auth.uid()" per
--    tutti gli altri campi del proprio profilo (nome, colore, avatar) — un
--    controllo a livello di singola colonna è più semplice ed esplicito con
--    OLD/NEW in un trigger che con condizioni RLS annidate.
--    Il controllo si applica solo quando auth.uid() è valorizzato, cioè sotto
--    PostgREST con un JWT autenticato: le connessioni dirette (migration,
--    seed, `execute_sql`/`apply_migration`, service_role) non hanno un
--    claim.sub e restano fuori dall'enforcement, stesso principio già in uso
--    per le tabelle "ALL TO service_role" documentate in CLAUDE.md.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_ruolo_change_admin_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NEW.ruolo IS DISTINCT FROM OLD.ruolo AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un Admin può modificare il ruolo di un agente.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_ruolo_change_admin_only ON public.profili_agenti;
CREATE TRIGGER trg_enforce_ruolo_change_admin_only
  BEFORE UPDATE ON public.profili_agenti
  FOR EACH ROW EXECUTE FUNCTION public.enforce_ruolo_change_admin_only();

-- -----------------------------------------------------------------------------
-- 4) Auto-provisioning: oggi un nuovo utente creato in auth.users (via invito/
--    Supabase Studio, non c'è self-signup nell'app) non genera automaticamente
--    una riga profili_agenti — va inserita a mano (come fa supabase/seed.sql).
--    Senza questo trigger la nuova UI Admin "assegna ruolo ai registrati" non
--    vedrebbe un utente appena creato finché qualcuno non aggiunge la riga a
--    mano, vanificando lo scopo della UI. Ruolo di default 'Agente' (stesso
--    default della colonna).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_agente_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profili_agenti (id, nome_completo, ruolo)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome_completo', split_part(NEW.email, '@', 1), 'Nuovo agente'), 'Agente')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profilo_agente ON auth.users;
CREATE TRIGGER on_auth_user_created_profilo_agente
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_agente_profile();

-- -----------------------------------------------------------------------------
-- 5) RLS: sostituisce la policy "tutto a chiunque sia autenticato" con SELECT
--    aperto (i nomi/colori agente servono ovunque nell'app: dropdown
--    assegnazione task, colori calendario, filtri per agente) e UPDATE
--    ristretto a "la propria riga, oppure qualunque riga se sei Admin" — il
--    trigger sopra chiude il buco residuo del cambio ruolo su se stessi.
--    Nessuna policy INSERT/DELETE per authenticated: le righe si creano solo
--    via trigger (SECURITY DEFINER, bypassa RLS) e si cancellano solo via
--    CASCADE da auth.users (gestito da service_role/Admin API).
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can manage profili_agenti" ON public.profili_agenti;

CREATE POLICY "Authenticated possono leggere profili_agenti" ON public.profili_agenti
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Utente aggiorna se stesso, Admin aggiorna chiunque" ON public.profili_agenti
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_admin())
  WITH CHECK (id = auth.uid() OR public.is_admin());
