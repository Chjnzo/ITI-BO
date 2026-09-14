-- Aggiunge `tipo_contratto` (array) sulla tabella acquirenti. Prima di questa
-- migration tutti gli acquirenti erano implicitamente in cerca in acquisto:
-- non c'era modo di segnare chi cerca (anche) in affitto. La segretaria vuole
-- poter distinguere/filtrare, e un acquirente può cercare sia in acquisto sia
-- in affitto, quindi il campo è multi-valore.
--
-- Default = {'Acquisto'} per coerenza col comportamento storico (tutti gli
-- acquirenti esistenti erano di fatto "in acquisto"). NOT NULL così il codice
-- lato client non deve gestire il ramo null; array vuoto ammesso ma il form
-- garantisce almeno un valore selezionato.
--
-- Nessun CHECK sui valori dell'array: manteniamo il pattern di
-- `tipologia_ricerca`/`zone_ricercate` (già text[] senza vincoli), così i
-- futuri valori (es. "Nuda proprietà") non richiedono migration.

ALTER TABLE public.acquirenti
    ADD COLUMN IF NOT EXISTS tipo_contratto text[] NOT NULL DEFAULT ARRAY['Acquisto']::text[];

COMMENT ON COLUMN public.acquirenti.tipo_contratto IS
    'Tipi di contratto cercati (multi-valore): ''Acquisto'', ''Affitto''. Default {''Acquisto''} per compat con storico.';
