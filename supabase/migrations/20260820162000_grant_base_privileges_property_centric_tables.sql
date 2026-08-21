-- Root cause: tables created via CREATE TABLE in a migration file are owned
-- by role `postgres`, whose default ACL for schema `public` only grants
-- Dxtm (truncate/references/trigger/maintain) to anon/authenticated/
-- service_role — not SELECT/INSERT/UPDATE/DELETE. RLS policies alone never
-- grant access: Postgres checks the base table GRANT first, RLS second.
-- Confirmed locally: `\dp public.immobile_pipeline_stato` showed no data
-- privileges for `authenticated` despite the "Consenti accesso completo
-- agli agenti autenticati" RLS policy in the schema migration, and a real
-- PostgREST call returned `permission denied for table` (42501). Tables
-- created via the Supabase Studio dashboard don't hit this because they're
-- created by role `supabase_admin`, whose default ACL is permissive by
-- default — only raw-SQL migrations like this one are affected.
--
-- Without this, the four property-centric tables would be unreachable by
-- the CRM frontend the moment this migration lands in production, even
-- though their RLS policies are correct.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    public.lead_ricerca,
    public.documenti_catalogo,
    public.immobile_pipeline_stato,
    public.immobile_documenti
TO authenticated, service_role;
