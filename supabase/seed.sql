-- Seed data for local development only. Never run against production.
-- Test users share the password 'locale123' (see docs/riferimento/ambiente_locale.md).

-- -----------------------------------------------------------------------------
-- Test users: one admin agent, one regular agent
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change
) VALUES
    ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000001',
     'authenticated', 'authenticated', 'admin@locale.test', crypt('locale123', gen_salt('bf')),
     now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000002',
     'authenticated', 'authenticated', 'agente@locale.test', crypt('locale123', gen_salt('bf')),
     now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

INSERT INTO auth.identities (
    id, provider_id, user_id, identity_data, provider, created_at, updated_at, last_sign_in_at
) VALUES
    (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
     '{"sub":"00000000-0000-0000-0000-000000000001","email":"admin@locale.test"}', 'email', now(), now(), now()),
    (gen_random_uuid(), '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002',
     '{"sub":"00000000-0000-0000-0000-000000000002","email":"agente@locale.test"}', 'email', now(), now(), now());

-- Il trigger AFTER INSERT su auth.users (Fase 6 pivot) auto-crea le righe
-- profili_agenti — qui aggiorniamo solo nome/colore/ruolo.
INSERT INTO public.profili_agenti (id, nome_completo, colore_calendario, ruolo) VALUES
    ('00000000-0000-0000-0000-000000000001', 'Anna Admin', '#94b0ab', 'Admin'),
    ('00000000-0000-0000-0000-000000000002', 'Marco Agente', '#3b82f6', 'Agente')
ON CONFLICT (id) DO UPDATE SET
    nome_completo = EXCLUDED.nome_completo,
    colore_calendario = EXCLUDED.colore_calendario,
    ruolo = EXCLUDED.ruolo;

-- -----------------------------------------------------------------------------
-- Zone OMI (Bergamo area)
-- -----------------------------------------------------------------------------
INSERT INTO public.zone_omi (id, codice_zona, comune, provincia, fascia, zona, prezzo_mq_min, prezzo_mq_max) VALUES
    ('00000000-0000-0000-0000-000000000301', 'B1', 'Bergamo', 'BG', 'Centrale', 'Città Alta', 3200, 4800),
    ('00000000-0000-0000-0000-000000000302', 'D2', 'Bergamo', 'BG', 'Periferica', 'Malpensata', 1800, 2600),
    ('00000000-0000-0000-0000-000000000303', 'B1', 'Seriate', 'BG', 'Semicentrale', 'Centro', 1600, 2200);

-- -----------------------------------------------------------------------------
-- Leads legacy: usati SOLO per collaudare i redirect e le valutazioni orfane.
-- La UI nuova (contatti/proprietari/acquirenti) NON li legge — vivono in
-- questa tabella solo perché il backfill (scripts/backfill-contatti-pivot.sql)
-- deve poterli convertire in produzione. Nessun immobile_id: gli immobili
-- fittizi 101-105 sono stati rimossi perché disorientavano il kanban (non
-- collegati ai proprietari nativi né ai loro pratiche).
-- -----------------------------------------------------------------------------
INSERT INTO public.leads (id, nome, cognome, email, telefono, stato, tipo_cliente, budget, assegnato_a, fonte) VALUES
    ('00000000-0000-0000-0000-000000000201', 'Luca',   'Bianchi', 'luca.bianchi@example.test',   '3331234567', 'Nuovo',      'Acquirente',   300000, '00000000-0000-0000-0000-000000000002', 'manuale'),
    ('00000000-0000-0000-0000-000000000202', 'Giulia', 'Verdi',   'giulia.verdi@example.test',    '3339876543', 'Contattato', 'Acquirente',   160000, '00000000-0000-0000-0000-000000000001', 'sito'),
    ('00000000-0000-0000-0000-000000000203', 'Paolo',  'Rossi',   'paolo.rossi@example.test',     '3335551122', 'Trattativa', 'Proprietario', NULL,   '00000000-0000-0000-0000-000000000002', 'manuale');

INSERT INTO public.lead_notes (lead_id, testo, autore) VALUES
    ('00000000-0000-0000-0000-000000000201', 'Interessato a una visita nel weekend.', 'Marco Agente'),
    ('00000000-0000-0000-0000-000000000203', 'Vuole vendere entro fine anno.',         'Marco Agente');

-- -----------------------------------------------------------------------------
-- Contatti/Proprietari nativi (post-pivot). Ogni proprietario rappresenta
-- una fase distinta del flusso reale:
--   501 Roberto Marchetti — caldo, pratica Incontro/Sopralluogo, no immobile
--   502 Sara Bellini      — caldo, pratica Rivalutazione,        no immobile
--   503 Davide Conti      — caldo, pratica Presa in carico + immobile "In Vendita"
--                            fase Preparazione (checklist quasi vuota)
--   504 Marco Fumagalli   — NON caldo, nessuna pratica (test "Avvia pratica" nascosto)
--   505 Giulia Ricci      — caldo, pratica Presa in carico + immobile "In Vendita"
--                            fase Pubblicato (Preparazione già completata)
--   506 Franco Neri       — caldo, pratica Presa in carico + immobile "Venduto"
--                            fase Preliminare (data preliminare compilata)
--   507 Anna Rota         — caldo, pratica Presa in carico + immobile "Venduto"
--                            fase Archivio (data preliminare + atto compilate)
-- -----------------------------------------------------------------------------
INSERT INTO public.contatti (id, agente_id, lead_id_origine) VALUES
    ('00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000002', NULL),
    ('00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000001', NULL),
    ('00000000-0000-0000-0000-000000000503', '00000000-0000-0000-0000-000000000002', NULL),
    ('00000000-0000-0000-0000-000000000504', '00000000-0000-0000-0000-000000000001', NULL),
    ('00000000-0000-0000-0000-000000000505', '00000000-0000-0000-0000-000000000002', NULL),
    ('00000000-0000-0000-0000-000000000506', '00000000-0000-0000-0000-000000000001', NULL),
    ('00000000-0000-0000-0000-000000000507', '00000000-0000-0000-0000-000000000002', NULL);

INSERT INTO public.proprietari (id, nome, cognome, email, telefono, caldo) VALUES
    ('00000000-0000-0000-0000-000000000501', 'Roberto', 'Marchetti', 'roberto.marchetti@example.test', '3331112233', true),
    ('00000000-0000-0000-0000-000000000502', 'Sara',    'Bellini',   'sara.bellini@example.test',      '3332223344', true),
    ('00000000-0000-0000-0000-000000000503', 'Davide',  'Conti',     'davide.conti@example.test',      '3333334455', true),
    ('00000000-0000-0000-0000-000000000504', 'Marco',   'Fumagalli', 'marco.fumagalli@example.test',   '3334445500', false),
    ('00000000-0000-0000-0000-000000000505', 'Giulia',  'Ricci',     'giulia.ricci@example.test',      '3335556699', true),
    ('00000000-0000-0000-0000-000000000506', 'Franco',  'Neri',      'franco.neri@example.test',       '3336667700', true),
    ('00000000-0000-0000-0000-000000000507', 'Anna',    'Rota',      'anna.rota@example.test',         '3337778811', true);

-- Immobili nativi: ID 601-604, creati come conseguenza delle pratiche in
-- "Presa in carico" (stesso pattern di useProprietariPipeline.creaImmobileDaPratica).
-- immobili.proprietario_id resta NULL (FK punta ancora a leads, gap noto):
-- il link "vero" col proprietario passa dalla pratica.
INSERT INTO public.immobili (id, titolo, prezzo, mq, locali, bagni, indirizzo, tipologia, stato, slug, citta, in_evidenza, visibile, data_preliminare, data_atto) VALUES
    ('00000000-0000-0000-0000-000000000601', 'Trilocale in Città Alta',         320000, 85,  '3', 1, 'Via Colle Aperto 12', 'Trilocale', 'Disponibile', 'trilocale-citta-alta',   'Bergamo', true,  true,  NULL,                     NULL),
    ('00000000-0000-0000-0000-000000000602', 'Bilocale Malpensata',             155000, 55,  '2', 1, 'Via Broseta 40',      'Bilocale',  'Disponibile', 'bilocale-malpensata',    'Bergamo', false, true,  NULL,                     NULL),
    ('00000000-0000-0000-0000-000000000603', 'Villa con giardino a Seriate',    480000, 180, '5', 2, 'Via Roma 8',          'Villa',     'Disponibile', 'villa-giardino-seriate', 'Seriate', true,  true,  CURRENT_DATE - 20,        NULL),
    ('00000000-0000-0000-0000-000000000604', 'Attico in Piazza Pontida',        410000, 120, '4', 2, 'Piazza Pontida 5',    'Attico',    'Venduto',     'attico-piazza-pontida',  'Bergamo', false, false, CURRENT_DATE - 60,        CURRENT_DATE - 5);

-- Stato pipeline: 601 e 602 in 'In Vendita', 603 e 604 in 'Venduto'.
INSERT INTO public.immobile_pipeline_stato (immobile_id, fase, updated_at) VALUES
    ('00000000-0000-0000-0000-000000000601', 'In Vendita', now()),
    ('00000000-0000-0000-0000-000000000602', 'In Vendita', now()),
    ('00000000-0000-0000-0000-000000000603', 'Venduto',    now() - interval '20 days'),
    ('00000000-0000-0000-0000-000000000604', 'Venduto',    now() - interval '60 days');

-- Checklist documenti: popoliamo tutte le righe dal catalogo per la fase
-- pipeline corrente, replicando esattamente ciò che farebbe
-- generaChecklistPerFase (con sottofase inclusa, altrimenti la card cade
-- sempre nell'ultima sottofase — vedi useImmobiliPipeline.derivaSottofase).
INSERT INTO public.immobile_documenti (immobile_id, fase, sottofase, documento, stato)
SELECT '00000000-0000-0000-0000-000000000601', dc.fase, dc.sottofase, dc.documento, 'Da fare'
FROM public.documenti_catalogo dc WHERE dc.fase = 'In Vendita';

INSERT INTO public.immobile_documenti (immobile_id, fase, sottofase, documento, stato, completato_at)
SELECT '00000000-0000-0000-0000-000000000602', dc.fase, dc.sottofase, dc.documento,
       CASE WHEN dc.sottofase = 'Preparazione' THEN 'Fatto' ELSE 'Da fare' END,
       CASE WHEN dc.sottofase = 'Preparazione' THEN now() - interval '5 days' ELSE NULL END
FROM public.documenti_catalogo dc WHERE dc.fase = 'In Vendita';

-- 603: Venduto/Preliminare. Vincolo completo, Preliminare parzialmente,
-- Rogito ancora vergine, Archivio vergine.
INSERT INTO public.immobile_documenti (immobile_id, fase, sottofase, documento, stato, completato_at)
SELECT '00000000-0000-0000-0000-000000000603', dc.fase, dc.sottofase, dc.documento,
       CASE
         WHEN dc.sottofase = 'Vincolo' THEN 'Fatto'
         WHEN dc.sottofase = 'Preliminare' AND dc.documento = 'Fattura agenzia' THEN 'Fatto'
         ELSE 'Da fare'
       END,
       CASE
         WHEN dc.sottofase = 'Vincolo' THEN now() - interval '20 days'
         WHEN dc.sottofase = 'Preliminare' AND dc.documento = 'Fattura agenzia' THEN now() - interval '15 days'
         ELSE NULL
       END
FROM public.documenti_catalogo dc WHERE dc.fase = 'Venduto';

-- 604: Venduto/Archivio. Tutti i doc della fase Venduto completati.
INSERT INTO public.immobile_documenti (immobile_id, fase, sottofase, documento, stato, completato_at)
SELECT '00000000-0000-0000-0000-000000000604', dc.fase, dc.sottofase, dc.documento, 'Fatto', now() - interval '10 days'
FROM public.documenti_catalogo dc WHERE dc.fase = 'Venduto';

-- Pratiche: 3 senza immobile (501, 502) e 4 con immobile collegato
-- (503→601, 505→602, 506→603, 507→604). Ordine INSERT invariato ma con la
-- pratica 511 spostata a 'Incontro/Sopralluogo' visto che 'Contatto' non
-- esiste più (migration 20260907120000_remove_contatto_fase_proprietari).
INSERT INTO public.proprietari_pratiche (id, proprietario_id, via, tipologia, citta, fase, immobile_id, valutazione_stimata) VALUES
    ('00000000-0000-0000-0000-000000000511', '00000000-0000-0000-0000-000000000501', 'Via Palma il Vecchio 15', 'Bilocale',  'Bergamo', 'Incontro/Sopralluogo', NULL,                                     NULL),
    ('00000000-0000-0000-0000-000000000512', '00000000-0000-0000-0000-000000000502', 'Via San Bernardino 4',    'Trilocale', 'Bergamo', 'Rivalutazione',        NULL,                                     NULL),
    ('00000000-0000-0000-0000-000000000513', '00000000-0000-0000-0000-000000000503', 'Via Colle Aperto 12',     'Trilocale', 'Bergamo', 'Presa in carico',      '00000000-0000-0000-0000-000000000601', 320000),
    ('00000000-0000-0000-0000-000000000515', '00000000-0000-0000-0000-000000000505', 'Via Broseta 40',          'Bilocale',  'Bergamo', 'Presa in carico',      '00000000-0000-0000-0000-000000000602', 155000),
    ('00000000-0000-0000-0000-000000000516', '00000000-0000-0000-0000-000000000506', 'Via Roma 8',              'Villa',     'Seriate', 'Presa in carico',      '00000000-0000-0000-0000-000000000603', 480000),
    ('00000000-0000-0000-0000-000000000517', '00000000-0000-0000-0000-000000000507', 'Piazza Pontida 5',        'Attico',    'Bergamo', 'Presa in carico',      '00000000-0000-0000-0000-000000000604', 410000);

-- Acquirenti nativi: uno con interesse su immobile esistente, uno con criteri
-- di ricerca vuoti (stesso paio di edge case usato prima).
INSERT INTO public.contatti (id, agente_id, lead_id_origine) VALUES
    ('00000000-0000-0000-0000-000000000521', '00000000-0000-0000-0000-000000000002', NULL),
    ('00000000-0000-0000-0000-000000000522', '00000000-0000-0000-0000-000000000001', NULL);

INSERT INTO public.acquirenti (id, nome, cognome, email, telefono, budget, zone_ricercate, tipologia_ricerca, stato) VALUES
    ('00000000-0000-0000-0000-000000000521', 'Federico', 'Galli',   'federico.galli@example.test', '3335556677', 170000, ARRAY['Malpensata'], ARRAY['Bilocale'], 'Contattato'),
    ('00000000-0000-0000-0000-000000000522', 'Alice',    'Moretti', 'alice.moretti@example.test',  '3336667788', NULL,   NULL,                NULL,               'Nuovo');

INSERT INTO public.acquirenti_immobili (acquirente_id, immobile_id, stato_interesse) VALUES
    ('00000000-0000-0000-0000-000000000521', '00000000-0000-0000-0000-000000000602', 'Interessato');

-- Collaboratori: notaio + responsabile portale.
INSERT INTO public.contatti (id, agente_id, lead_id_origine) VALUES
    ('00000000-0000-0000-0000-000000000531', '00000000-0000-0000-0000-000000000001', NULL),
    ('00000000-0000-0000-0000-000000000532', '00000000-0000-0000-0000-000000000002', NULL);

INSERT INTO public.collaboratori (id, nome, cognome, email, telefono, professione) VALUES
    ('00000000-0000-0000-0000-000000000531', 'Giovanna', 'Riva', 'giovanna.riva@example.test', '3337778800', 'Notaio'),
    ('00000000-0000-0000-0000-000000000532', 'Simone',   'Pes',  'simone.pes@example.test',    '3338889911', 'Responsabile Getrix');

-- -----------------------------------------------------------------------------
-- Tasks / Appuntamenti / Open house / Valutazioni: agganciati agli immobili
-- nativi (601-604) o ai proprietari/contatti nativi. Nessun riferimento più
-- agli ex-immobili fittizi 101-105.
-- -----------------------------------------------------------------------------
INSERT INTO public.tasks (contatto_id, agente_id, nota, data, ora, stato, titolo) VALUES
    ('00000000-0000-0000-0000-000000000503', '00000000-0000-0000-0000-000000000002', 'Sollecito documenti burocratici Città Alta', CURRENT_DATE, '10:00', 'Da fare', 'Chiamata Davide Conti');

INSERT INTO public.appuntamenti (agente_id, contatto_id, immobile_id, tipologia, data, ora_inizio, ora_fine, note) VALUES
    ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000521', '00000000-0000-0000-0000-000000000602', 'Appuntamento', CURRENT_DATE + 1, '15:00', '15:30', 'Visita Bilocale Malpensata');

INSERT INTO public.open_houses (id, immobile_id, data_evento, ora_inizio, ora_fine, posti_totali) VALUES
    ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000603', CURRENT_DATE + 7, '10:00', '13:00', 15);

INSERT INTO public.prenotazioni_oh (open_house_id, nome, email, telefono, orario_scelto) VALUES
    ('00000000-0000-0000-0000-000000000401', 'Sara Neri', 'sara.neri@example.test', '3337778899', '10:30');

-- Valutazione AI collegata direttamente al proprietario 506 (Franco Neri),
-- così nella scheda pratica appare il range + link "Apri report". Slug reale
-- per testare /report/:slug.
INSERT INTO public.valutazioni (proprietario_id, agente_id, indirizzo, citta, tipologia, superficie_mq, zona_omi_id, stato, slug, stima_min, stima_max) VALUES
    ('00000000-0000-0000-0000-000000000506', '00000000-0000-0000-0000-000000000002', 'Via Roma 8', 'Seriate', 'Villa', 180, '00000000-0000-0000-0000-000000000303', 'Completata', 'villa-roma-8-seriate', 420000, 480000);

-- Edge case: valutazione orfana senza proprietario_id né lead_id (richiesta
-- pubblica) — il backfill non deve toccarla né fallire.
INSERT INTO public.valutazioni (lead_id, agente_id, indirizzo, citta, tipologia, superficie_mq, zona_omi_id, stato, slug, stima_min, stima_max) VALUES
    (NULL, NULL, 'Via Sudorno 3', 'Bergamo', 'Trilocale', 90, NULL, 'Bozza', 'trilocale-sudorno-3', NULL, NULL);
