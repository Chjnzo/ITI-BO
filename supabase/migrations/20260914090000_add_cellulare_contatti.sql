-- Aggiunge `cellulare` distinto da `telefono` su proprietari, acquirenti,
-- collaboratori. Nasce dalla richiesta esplicita dell'utente di poter
-- registrare due numeri separati (fisso + cellulare) per lo stesso contatto,
-- oggi impossibile perché il campo `telefono` è unico.
--
-- Nullable, senza default: contatti esistenti restano con `cellulare = NULL`
-- e la UI mostra solo `telefono` finché non viene compilato. Nessun backfill
-- da un vecchio schema (il campo non esisteva).

ALTER TABLE public.proprietari    ADD COLUMN IF NOT EXISTS cellulare text NULL;
ALTER TABLE public.acquirenti     ADD COLUMN IF NOT EXISTS cellulare text NULL;
ALTER TABLE public.collaboratori  ADD COLUMN IF NOT EXISTS cellulare text NULL;
