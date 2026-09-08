-- Repo-wide fix: every table created via a raw `CREATE TABLE` migration
-- (i.e. every custom table in this project, not just the 4 added by the
-- previous migration) is owned by role `postgres`. The default ACL
-- Postgres applies to new objects owned by `postgres` in schema `public`
-- only grants Dxtm (truncate/references/trigger/maintain) to
-- anon/authenticated/service_role — never SELECT/INSERT/UPDATE/DELETE.
-- RLS policies never get a chance to run in that case: Postgres checks the
-- base table GRANT before evaluating any RLS policy, so every one of our
-- RLS policies has been silently unreachable via PostgREST/anon/
-- authenticated all along. This was invisible so far because all local
-- verification in this project has gone through `psql` as role `postgres`
-- (which owns every table and is unaffected), never through the real
-- REST/auth path the frontend actually uses.
--
-- Verified locally with:
--   SELECT relname, has_table_privilege('authenticated','public.'||relname,'SELECT')
--   FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r';
-- — every table returned false for both anon and authenticated, except the
-- 4 already fixed by 20260820162000_grant_base_privileges_property_centric_tables.sql.
--
-- Fix: grant the same broad base privileges Supabase's own dashboard-created
-- tables get by default (owned by `supabase_admin`, whose default ACL for
-- `public` already grants full data-privilege to anon/authenticated/
-- service_role — see `pg_default_acl`). RLS policies remain the sole real
-- access-control layer, exactly as documented in CLAUDE.md: this migration
-- does not loosen anything, it makes the already-written, already-reviewed
-- RLS policies reachable at all. Function EXECUTE grants are intentionally
-- left untouched — those were deliberately hardened in
-- 20260820122500_revoke_public_execute_on_internal_functions.sql and must
-- not be broadened here.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
    TO anon, authenticated, service_role;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
    TO anon, authenticated, service_role;

-- So future migrations that CREATE TABLE as `postgres` don't reintroduce
-- this same gap.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;
