-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Enable RLS and authenticated-only access policies
-- Tables: leads, appuntamenti, tasks, valutazioni, lead_notes,
--         lead_immobili, lead_zone_ricercate
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Enable Row Level Security ─────────────────────────────────────────────────

ALTER TABLE public.leads                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appuntamenti           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.valutazioni            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_notes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_immobili          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_zone_ricercate    ENABLE ROW LEVEL SECURITY;

-- ── Policies: full access for authenticated users only ────────────────────────

-- leads
CREATE POLICY "Allow full access for authenticated users"
  ON public.leads
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- appuntamenti
CREATE POLICY "Allow full access for authenticated users"
  ON public.appuntamenti
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- tasks
CREATE POLICY "Allow full access for authenticated users"
  ON public.tasks
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- valutazioni
CREATE POLICY "Allow full access for authenticated users"
  ON public.valutazioni
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- lead_notes
CREATE POLICY "Allow full access for authenticated users"
  ON public.lead_notes
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- lead_immobili
CREATE POLICY "Allow full access for authenticated users"
  ON public.lead_immobili
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- lead_zone_ricercate
CREATE POLICY "Allow full access for authenticated users"
  ON public.lead_zone_ricercate
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
