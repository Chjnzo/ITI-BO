# Migration pre-baseline — archiviate 2026-08-20

Le 11 migration in questa cartella predatano `00000000000000_baseline.sql`, che è uno
snapshot completo dello schema di produzione introspetto il 2026-08-20 (vedi
`docs/STATO.md`). Il loro contenuto è già incluso nella baseline.

Non vanno eseguite dopo la baseline: `supabase db reset` fallisce se restano in
`supabase/migrations/`, perché ricreano oggetti (es. policy RLS) già presenti nella
baseline stessa (es. `CREATE POLICY "zone_omi: public read"` duplicata).

Restano nel repo solo per storia. Le migration datate 2026-08-20 o successive, in
`supabase/migrations/`, sono invece scritte per applicarsi sopra la baseline e vanno
eseguite normalmente.
