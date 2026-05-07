-- Add zone_ricercate as a text array directly on leads.
-- Agents enter zone names freely; autocomplete is derived from existing values.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS zone_ricercate text[] DEFAULT NULL;
