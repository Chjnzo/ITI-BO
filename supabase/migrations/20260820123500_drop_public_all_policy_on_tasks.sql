-- "Team_Può_Fare_Tutto" granted ALL (select/insert/update/delete) to `public`,
-- i.e. including anon, contradicting CLAUDE.md's documented intent that
-- `tasks` is authenticated-only internal CRM data. The narrower
-- authenticated-only policies (insert/update/delete/select, already present)
-- cover all legitimate CRM access, so dropping this closes the anon exposure
-- without changing behavior for authenticated users.
DROP POLICY IF EXISTS "Team_Può_Fare_Tutto" ON public.tasks;
