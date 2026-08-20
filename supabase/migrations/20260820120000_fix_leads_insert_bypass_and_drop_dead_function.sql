-- Close the direct-INSERT bypass on leads; upsert_lead (SECURITY DEFINER, owned by
-- postgres, table has relforcerowsecurity=false) is unaffected and remains the only path.
DROP POLICY "Public can insert leads" ON public.leads;

-- Dead/broken legacy function: references leads.nome_completo / messaggio_originale,
-- which don't exist; SECURITY DEFINER with no search_path set. Zero references in repo.
DROP FUNCTION public.process_lead(text, text, text, text, text, text);
