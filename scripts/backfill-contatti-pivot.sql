-- One-time data backfill: leads (+ lead_immobili) -> contatti/proprietari/
-- proprietari_pratiche/compratori/collaboratori/compratori_immobili.
-- See supabase/migrations/20260827090000_add_contatti_proprietari_compratori_collaboratori.sql
-- for the schema and docs/DECISIONI.md "Pivot Proprietari/Compratori/Collaboratori"
-- for the design decisions this implements.
--
-- NOT a migration file, same reason as scripts/backfill-property-centric-model.sql:
-- migrations run before supabase/seed.sql during `supabase db reset`, so a
-- migration-file version would find `leads` empty. Run manually, after data exists.
--
-- Local test:   docker exec -i supabase_db_ITI-BO psql -U postgres -d postgres \
--                 -f scripts/backfill-contatti-pivot.sql
-- Production:   only after end-to-end verification in local, and only after a
--               fresh backup. Never run untested against production.
--
-- Idempotent EXCEPT the Ibrido duplication inserts (step 3b/4b/5b), which are
-- guarded by `duplicato_da_id` so re-running does not duplicate twice — safe to
-- re-run overall.
--
-- Lead 'Ibrido' -> produces TWO separate contatti (one proprietari, one
-- compratori), NOT linked to each other (explicit decision, DECISIONI.md).
-- Historical tasks/lead_notes/appuntamenti for an Ibrido lead are duplicated,
-- one copy per side, not assigned to a single side.

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) Lato proprietario: contatti + proprietari, per tipo_cliente
--    Proprietario/Ibrido (valori reali di leads.tipo_cliente, 'Venditore' non
--    esiste mai nei dati -- vedi scripts/backfill-property-centric-model.sql).
--    assegnato_a è testo che oggi contiene un uuid agente (vedi supabase/seed.sql);
--    il guard con regex evita un errore di cast se in produzione fosse invece un
--    nome libero mai validato.
-- -----------------------------------------------------------------------------
WITH nuovi_contatti_proprietari AS (
    INSERT INTO public.contatti (agente_id, lead_id_origine)
    SELECT
        CASE WHEN l.assegnato_a ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
             THEN l.assegnato_a::uuid ELSE NULL END,
        l.id
    FROM public.leads l
    WHERE l.tipo_cliente IN ('Proprietario', 'Ibrido')
      AND NOT EXISTS (
          SELECT 1 FROM public.contatti c
          JOIN public.proprietari p ON p.id = c.id
          WHERE c.lead_id_origine = l.id
      )
    RETURNING id, lead_id_origine
)
INSERT INTO public.proprietari (id, nome, cognome, email, telefono, note_interne)
SELECT nc.id, l.nome, l.cognome, l.email, l.telefono, l.note_interne
FROM nuovi_contatti_proprietari nc
JOIN public.leads l ON l.id = nc.lead_id_origine;

-- -----------------------------------------------------------------------------
-- 2) proprietari_pratiche: solo per leads Proprietario/Ibrido con un immobile_id
--    già collegato (senza immobile non c'è ancora via/tipologia da registrare
--    sulla pratica). Fase dedotta da immobile_pipeline_stato: se l'immobile è
--    ancora in 'Acquisizione' (o non ha ancora una riga di stato), la pratica
--    parte da 'Contatto'; se l'immobile è già oltre (In Vendita/Venduto/
--    Archivio), la presa in carico deve essere già avvenuta in passato, quindi
--    la pratica nasce direttamente 'Presa in carico' — stima onesta, non
--    ricostruibile con precisione dai dati vecchi.
-- -----------------------------------------------------------------------------
INSERT INTO public.proprietari_pratiche
    (proprietario_id, via, tipologia, citta, fase, zona_venditore, motivazione_vendita, scadenza_esclusiva, valutazione_stimata, immobile_id)
SELECT
    p.id,
    COALESCE(i.indirizzo, i.titolo, 'Indirizzo da definire'),
    i.tipologia,
    i.citta,
    CASE WHEN ips.fase IS NULL OR ips.fase = 'Acquisizione' THEN 'Contatto' ELSE 'Presa in carico' END,
    l.zona_venditore,
    l.motivazione_vendita,
    l.scadenza_esclusiva,
    l.valutazione_stimata,
    i.id
FROM public.leads l
JOIN public.contatti c ON c.lead_id_origine = l.id
JOIN public.proprietari p ON p.id = c.id
JOIN public.immobili i ON i.id = l.immobile_id
LEFT JOIN public.immobile_pipeline_stato ips ON ips.immobile_id = i.id
WHERE l.tipo_cliente IN ('Proprietario', 'Ibrido')
  AND l.immobile_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM public.proprietari_pratiche pp
      WHERE pp.proprietario_id = p.id AND pp.immobile_id = i.id
  );

-- -----------------------------------------------------------------------------
-- 3) Lato compratore: contatti + compratori, per tipo_cliente Acquirente/Ibrido.
--    Riga di contatto separata da quella proprietario anche per gli Ibridi
--    (decisione esplicita, non collegate tra loro).
-- -----------------------------------------------------------------------------
WITH nuovi_contatti_compratori AS (
    INSERT INTO public.contatti (agente_id, lead_id_origine)
    SELECT
        CASE WHEN l.assegnato_a ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
             THEN l.assegnato_a::uuid ELSE NULL END,
        l.id
    FROM public.leads l
    WHERE l.tipo_cliente IN ('Acquirente', 'Ibrido')
      AND NOT EXISTS (
          SELECT 1 FROM public.contatti c
          JOIN public.compratori co ON co.id = c.id
          WHERE c.lead_id_origine = l.id
      )
    RETURNING id, lead_id_origine
)
INSERT INTO public.compratori (id, nome, cognome, email, telefono, budget, zone_ricercate, tipologia_ricerca, note_interne, stato)
SELECT nc.id, l.nome, l.cognome, l.email, l.telefono, l.budget, l.zone_ricercate, l.tipologia_ricerca, l.note_interne, l.stato
FROM nuovi_contatti_compratori nc
JOIN public.leads l ON l.id = nc.lead_id_origine;

-- -----------------------------------------------------------------------------
-- 4) compratori_immobili, da lead_immobili (solo dove esiste un compratore
--    corrispondente -- righe di lead legate a un tipo_cliente Proprietario puro
--    non hanno un lato compratore e vengono saltate, non è un errore).
-- -----------------------------------------------------------------------------
INSERT INTO public.compratori_immobili (compratore_id, immobile_id, stato_interesse, note, created_at)
SELECT co.id, li.immobile_id, li.stato_interesse, li.note, li.created_at
FROM public.lead_immobili li
JOIN public.contatti c ON c.lead_id_origine = li.lead_id
JOIN public.compratori co ON co.id = c.id
ON CONFLICT (compratore_id, immobile_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 5) valutazioni.proprietario_id, dal lead che l'ha richiesta (indipendente da
--    immobile_id: una valutazione può precedere l'esistenza di un immobile).
-- -----------------------------------------------------------------------------
UPDATE public.valutazioni v
SET proprietario_id = p.id
FROM public.contatti c
JOIN public.proprietari p ON p.id = c.id
WHERE c.lead_id_origine = v.lead_id
  AND v.proprietario_id IS NULL
  AND v.lead_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 6) tasks/lead_notes/appuntamenti: contatto_id. Non-Ibrido è un 1:1 diretto;
--    Ibrido aggiorna in place verso il lato proprietario e duplica una copia
--    per il lato compratore (guardia `duplicato_da_id` per idempotenza).
-- -----------------------------------------------------------------------------
-- 6a) tasks — non Ibrido
UPDATE public.tasks t
SET contatto_id = c.id
FROM public.leads l
JOIN public.contatti c ON c.lead_id_origine = l.id
WHERE t.lead_id = l.id AND l.tipo_cliente <> 'Ibrido' AND t.contatto_id IS NULL;

-- 6b) tasks — Ibrido, lato proprietario (in place)
UPDATE public.tasks t
SET contatto_id = c.id
FROM public.leads l
JOIN public.contatti c ON c.lead_id_origine = l.id
JOIN public.proprietari p ON p.id = c.id
WHERE t.lead_id = l.id AND l.tipo_cliente = 'Ibrido' AND t.contatto_id IS NULL;

-- 6c) tasks — Ibrido, lato compratore (duplicato)
INSERT INTO public.tasks (lead_id, contatto_id, agente_id, nota, data, ora, stato, titolo, is_deleted, deleted_at, telefono, colore, urgente, duplicato_da_id)
SELECT t.lead_id, c.id, t.agente_id, t.nota, t.data, t.ora, t.stato, t.titolo, t.is_deleted, t.deleted_at, t.telefono, t.colore, t.urgente, t.id
FROM public.tasks t
JOIN public.leads l ON l.id = t.lead_id
JOIN public.contatti c ON c.lead_id_origine = l.id
JOIN public.compratori co ON co.id = c.id
WHERE l.tipo_cliente = 'Ibrido'
  AND t.duplicato_da_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.tasks t2 WHERE t2.duplicato_da_id = t.id);

-- 6d) lead_notes — non Ibrido
UPDATE public.lead_notes n
SET contatto_id = c.id
FROM public.leads l
JOIN public.contatti c ON c.lead_id_origine = l.id
WHERE n.lead_id = l.id AND l.tipo_cliente <> 'Ibrido' AND n.contatto_id IS NULL;

-- 6e) lead_notes — Ibrido, lato proprietario (in place)
UPDATE public.lead_notes n
SET contatto_id = c.id
FROM public.leads l
JOIN public.contatti c ON c.lead_id_origine = l.id
JOIN public.proprietari p ON p.id = c.id
WHERE n.lead_id = l.id AND l.tipo_cliente = 'Ibrido' AND n.contatto_id IS NULL;

-- 6f) lead_notes — Ibrido, lato compratore (duplicato)
INSERT INTO public.lead_notes (lead_id, contatto_id, testo, autore, duplicato_da_id)
SELECT n.lead_id, c.id, n.testo, n.autore, n.id
FROM public.lead_notes n
JOIN public.leads l ON l.id = n.lead_id
JOIN public.contatti c ON c.lead_id_origine = l.id
JOIN public.compratori co ON co.id = c.id
WHERE l.tipo_cliente = 'Ibrido'
  AND n.duplicato_da_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.lead_notes n2 WHERE n2.duplicato_da_id = n.id);

-- 6g) appuntamenti — non Ibrido
UPDATE public.appuntamenti a
SET contatto_id = c.id
FROM public.leads l
JOIN public.contatti c ON c.lead_id_origine = l.id
WHERE a.lead_id = l.id AND l.tipo_cliente <> 'Ibrido' AND a.contatto_id IS NULL;

-- 6h) appuntamenti — Ibrido, lato proprietario (in place)
UPDATE public.appuntamenti a
SET contatto_id = c.id
FROM public.leads l
JOIN public.contatti c ON c.lead_id_origine = l.id
JOIN public.proprietari p ON p.id = c.id
WHERE a.lead_id = l.id AND l.tipo_cliente = 'Ibrido' AND a.contatto_id IS NULL;

-- 6i) appuntamenti — Ibrido, lato compratore (duplicato)
INSERT INTO public.appuntamenti (agente_id, lead_id, contatto_id, immobile_id, tipologia, data, ora_inizio, ora_fine, note, indirizzo_appuntamento, duplicato_da_id)
SELECT a.agente_id, a.lead_id, c.id, a.immobile_id, a.tipologia, a.data, a.ora_inizio, a.ora_fine, a.note, a.indirizzo_appuntamento, a.id
FROM public.appuntamenti a
JOIN public.leads l ON l.id = a.lead_id
JOIN public.contatti c ON c.lead_id_origine = l.id
JOIN public.compratori co ON co.id = c.id
WHERE l.tipo_cliente = 'Ibrido'
  AND a.duplicato_da_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.appuntamenti a2 WHERE a2.duplicato_da_id = a.id);

-- -----------------------------------------------------------------------------
-- Riepilogo per verifica manuale prima del COMMIT.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    RAISE NOTICE 'contatti totali: % (proprietari: %, compratori: %)',
        (SELECT count(*) FROM public.contatti),
        (SELECT count(*) FROM public.proprietari),
        (SELECT count(*) FROM public.compratori);
    RAISE NOTICE 'proprietari_pratiche: %', (SELECT count(*) FROM public.proprietari_pratiche);
    RAISE NOTICE 'compratori_immobili: % (lead_immobili originali: %)',
        (SELECT count(*) FROM public.compratori_immobili), (SELECT count(*) FROM public.lead_immobili);
    RAISE NOTICE 'valutazioni con proprietario_id: % (valutazioni totali: %)',
        (SELECT count(*) FROM public.valutazioni WHERE proprietario_id IS NOT NULL), (SELECT count(*) FROM public.valutazioni);
    RAISE NOTICE 'tasks con contatto_id: % (di cui duplicate): % / totale tasks: %',
        (SELECT count(*) FROM public.tasks WHERE contatto_id IS NOT NULL),
        (SELECT count(*) FROM public.tasks WHERE duplicato_da_id IS NOT NULL),
        (SELECT count(*) FROM public.tasks);
    RAISE NOTICE 'lead_notes con contatto_id: % / totale: %',
        (SELECT count(*) FROM public.lead_notes WHERE contatto_id IS NOT NULL), (SELECT count(*) FROM public.lead_notes);
    RAISE NOTICE 'appuntamenti con contatto_id: % / totale: %',
        (SELECT count(*) FROM public.appuntamenti WHERE contatto_id IS NOT NULL), (SELECT count(*) FROM public.appuntamenti);
END $$;

COMMIT;
