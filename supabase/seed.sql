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

INSERT INTO public.profili_agenti (id, nome_completo, colore_calendario, is_admin) VALUES
    ('00000000-0000-0000-0000-000000000001', 'Anna Admin', '#94b0ab', true),
    ('00000000-0000-0000-0000-000000000002', 'Marco Agente', '#3b82f6', false);

-- -----------------------------------------------------------------------------
-- Zone OMI (Bergamo area)
-- -----------------------------------------------------------------------------
INSERT INTO public.zone_omi (id, codice_zona, comune, provincia, fascia, zona, prezzo_mq_min, prezzo_mq_max) VALUES
    ('00000000-0000-0000-0000-000000000301', 'B1', 'Bergamo', 'BG', 'Centrale', 'Città Alta', 3200, 4800),
    ('00000000-0000-0000-0000-000000000302', 'D2', 'Bergamo', 'BG', 'Periferica', 'Malpensata', 1800, 2600),
    ('00000000-0000-0000-0000-000000000303', 'B1', 'Seriate', 'BG', 'Semicentrale', 'Centro', 1600, 2200);

-- -----------------------------------------------------------------------------
-- Immobili
-- -----------------------------------------------------------------------------
INSERT INTO public.immobili (id, titolo, prezzo, mq, locali, bagni, indirizzo, stato, slug, citta, in_evidenza, visibile) VALUES
    ('00000000-0000-0000-0000-000000000101', 'Trilocale in Città Alta', 320000, 85, '3', 1, 'Via Colle Aperto 12', 'Disponibile', 'trilocale-citta-alta', 'Bergamo', true, true),
    ('00000000-0000-0000-0000-000000000102', 'Bilocale Malpensata', 155000, 55, '2', 1, 'Via Broseta 40', 'Disponibile', 'bilocale-malpensata', 'Bergamo', false, true),
    ('00000000-0000-0000-0000-000000000103', 'Villa con giardino a Seriate', 480000, 180, '5', 2, 'Via Roma 8', 'In Trattativa', 'villa-giardino-seriate', 'Seriate', true, true);

-- -----------------------------------------------------------------------------
-- Leads
-- -----------------------------------------------------------------------------
INSERT INTO public.leads (id, nome, cognome, email, telefono, stato, tipo_cliente, immobile_id, budget, assegnato_a, fonte) VALUES
    ('00000000-0000-0000-0000-000000000201', 'Luca', 'Bianchi', 'luca.bianchi@example.test', '3331234567', 'Nuovo', 'Acquirente', '00000000-0000-0000-0000-000000000101', 300000, '00000000-0000-0000-0000-000000000002', 'manuale'),
    ('00000000-0000-0000-0000-000000000202', 'Giulia', 'Verdi', 'giulia.verdi@example.test', '3339876543', 'Contattato', 'Acquirente', '00000000-0000-0000-0000-000000000102', 160000, '00000000-0000-0000-0000-000000000001', 'sito'),
    ('00000000-0000-0000-0000-000000000203', 'Paolo', 'Rossi', 'paolo.rossi@example.test', '3335551122', 'Trattativa', 'Venditore', '00000000-0000-0000-0000-000000000103', NULL, '00000000-0000-0000-0000-000000000002', 'manuale');

INSERT INTO public.lead_notes (lead_id, testo, autore) VALUES
    ('00000000-0000-0000-0000-000000000201', 'Interessato a una visita nel weekend.', 'Marco Agente'),
    ('00000000-0000-0000-0000-000000000203', 'Vuole vendere entro fine anno.', 'Marco Agente');

INSERT INTO public.lead_immobili (lead_id, immobile_id, stato_interesse) VALUES
    ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000101', 'Interessato'),
    ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000102', 'Richiesta dal Web');

-- -----------------------------------------------------------------------------
-- Tasks
-- -----------------------------------------------------------------------------
-- NOTE: production `tasks` has no `tipologia` column (see docs/STATO.md TODO#2,
-- CLAUDE.md documents one that doesn't exist in the live schema).
INSERT INTO public.tasks (lead_id, agente_id, nota, data, ora, stato, titolo) VALUES
    ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000002', 'Richiamare per fissare visita', CURRENT_DATE, '10:00', 'Da fare', 'Chiamata Luca Bianchi');

-- -----------------------------------------------------------------------------
-- Appuntamenti (agenda) + open house
-- -----------------------------------------------------------------------------
INSERT INTO public.appuntamenti (agente_id, lead_id, immobile_id, tipologia, data, ora_inizio, ora_fine, note) VALUES
    ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000101', 'Appuntamento', CURRENT_DATE + 1, '15:00', '15:30', 'Visita immobile Città Alta');

INSERT INTO public.open_houses (id, immobile_id, data_evento, ora_inizio, ora_fine, posti_totali) VALUES
    ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000103', CURRENT_DATE + 7, '10:00', '13:00', 15);

INSERT INTO public.prenotazioni_oh (open_house_id, nome, email, telefono, orario_scelto) VALUES
    ('00000000-0000-0000-0000-000000000401', 'Sara Neri', 'sara.neri@example.test', '3337778899', '10:30');

-- -----------------------------------------------------------------------------
-- Valutazioni
-- -----------------------------------------------------------------------------
INSERT INTO public.valutazioni (lead_id, agente_id, indirizzo, citta, tipologia, superficie_mq, zona_omi_id, stato, slug, stima_min, stima_max) VALUES
    ('00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000002', 'Via Roma 8', 'Seriate', 'Villa', 180, '00000000-0000-0000-0000-000000000303', 'Completata', 'villa-roma-8-seriate', 420000, 480000);
