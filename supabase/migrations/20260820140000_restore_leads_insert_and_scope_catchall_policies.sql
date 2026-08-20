-- Fix 1 (URGENT regression): dropping "Public can insert leads" in the prior session
-- removed the ONLY insert policy on leads, including for authenticated CRM agents
-- (src/pages/Leads.tsx does a direct authenticated .insert() when creating a new
-- lead, not via the upsert_lead RPC). This caused a live 403 for agents. Restore
-- authenticated-only insert; anon still has no direct insert path (must use
-- upsert_lead RPC, which is SECURITY DEFINER and bypasses RLS).
CREATE POLICY "Authenticated can insert leads" ON public.leads
  FOR INSERT TO authenticated WITH CHECK (true);

-- Fix 2: lead_notes, profili_agenti, appuntamenti each had a single catch-all
-- ALL/public/qual=true policy exposing full read/write to anon, with no
-- authenticated-only fallback. Replace (not just drop) with authenticated-only
-- equivalents so CRM agents keep working while anon loses access, matching
-- CLAUDE.md's documented intent (internal CRM only, no public usage found in
-- the ITI2.0 sibling site for any of these three tables).
DROP POLICY "Permetti tutto su lead_notes" ON public.lead_notes;
CREATE POLICY "Authenticated can manage lead_notes" ON public.lead_notes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY "Permetti tutto su profili_agenti" ON public.profili_agenti;
CREATE POLICY "Authenticated can manage profili_agenti" ON public.profili_agenti
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY "Team_Può_Fare_Tutto_Agenda" ON public.appuntamenti;
CREATE POLICY "Authenticated can manage appuntamenti" ON public.appuntamenti
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
