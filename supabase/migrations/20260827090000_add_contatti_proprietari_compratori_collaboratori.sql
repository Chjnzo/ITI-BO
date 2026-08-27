-- Pivot Proprietari/Compratori/Collaboratori, Fase 1 (schema): sostituisce `leads`
-- con tre tabelle dedicate. Additive-only, come 20260820160000: `leads`,
-- `lead_immobili`, `lead_notes.lead_id`, `tasks.lead_id`, `appuntamenti.lead_id`
-- restano intatti e il frontend attuale continua a funzionare senza modifiche
-- finché non arrivano le fasi 2-4 (RPC, UI Contatti, modulo Proprietari). La
-- migrazione dati vera e propria è in scripts/backfill-contatti-pivot.sql (non
-- una migration, per lo stesso motivo spiegato in
-- scripts/backfill-property-centric-model.sql: le migration girano prima di
-- supabase/seed.sql in `supabase db reset`, quindi troverebbero `leads` vuota).
--
-- Design: docs/DECISIONI.md "Pivot Proprietari/Compratori/Collaboratori".

-- -----------------------------------------------------------------------------
-- contatti: tabella base condivisa. proprietari/compratori/collaboratori si
-- appoggiano 1:1 sullo stesso id invece di tre colonne FK nullable sparse su
-- tasks/lead_notes/appuntamenti (Postgres non ha FK polimorfiche pulite).
-- `lead_id_origine` è solo per tracciabilità durante la transizione dal vecchio
-- modello — da rimuovere insieme a `leads` a cutover completato.
-- -----------------------------------------------------------------------------
CREATE TABLE public.contatti (
    id               uuid NOT NULL DEFAULT gen_random_uuid(),
    agente_id        uuid REFERENCES public.profili_agenti(id) ON DELETE SET NULL,
    lead_id_origine  uuid,
    created_at       timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT contatti_pkey PRIMARY KEY (id)
);

CREATE INDEX idx_contatti_agente_id ON public.contatti USING btree (agente_id);
CREATE INDEX idx_contatti_lead_id_origine ON public.contatti USING btree (lead_id_origine);

COMMENT ON COLUMN public.contatti.lead_id_origine IS 'Tracciabilità del backfill da leads.id — rimuovere a cutover completato (fine Fase 4/5), non un campo di prodotto.';

ALTER TABLE public.contatti ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Consenti accesso completo agli agenti autenticati" ON public.contatti
    AS PERMISSIVE FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- proprietari: anagrafica venditore. Un proprietario può avere più pratiche
-- (proprietari_pratiche), una per immobile in acquisizione/già acquisito.
-- -----------------------------------------------------------------------------
CREATE TABLE public.proprietari (
    id            uuid NOT NULL,
    nome          text NOT NULL,
    cognome       text,
    email         text,
    telefono      text,
    professione   text,
    note_interne  text,
    is_deleted    boolean NOT NULL DEFAULT false,
    deleted_at    timestamptz,
    _version      integer NOT NULL DEFAULT 1,
    CONSTRAINT proprietari_pkey PRIMARY KEY (id),
    CONSTRAINT proprietari_id_fkey FOREIGN KEY (id) REFERENCES public.contatti(id) ON DELETE CASCADE
);

CREATE INDEX idx_proprietari_email ON public.proprietari USING btree (email);

ALTER TABLE public.proprietari ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Consenti accesso completo agli agenti autenticati" ON public.proprietari
    AS PERMISSIVE FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- proprietari_pratiche: pipeline/kanban per singolo immobile in acquisizione.
-- 4 fasi, nessuna sottofase (decisione esplicita, a differenza della pipeline
-- immobili). `immobile_id` resta NULL finché la pratica non arriva a "Presa in
-- carico" — la creazione automatica dell'immobile è Fase 4, non qui.
-- `updated_at` guida la futura soglia di stagnazione (stesso pattern di
-- immobile_pipeline_stato.updated_at).
-- -----------------------------------------------------------------------------
CREATE TABLE public.proprietari_pratiche (
    id                    uuid NOT NULL DEFAULT gen_random_uuid(),
    proprietario_id       uuid NOT NULL,
    via                   text NOT NULL,
    tipologia             text,
    citta                 text,
    fase                  text NOT NULL DEFAULT 'Contatto',
    zona_venditore        text,
    motivazione_vendita   text,
    scadenza_esclusiva    date,
    valutazione_stimata   numeric,
    immobile_id           uuid,
    created_at            timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at            timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT proprietari_pratiche_pkey PRIMARY KEY (id),
    CONSTRAINT proprietari_pratiche_proprietario_id_fkey FOREIGN KEY (proprietario_id) REFERENCES public.proprietari(id) ON DELETE CASCADE,
    CONSTRAINT proprietari_pratiche_immobile_id_fkey FOREIGN KEY (immobile_id) REFERENCES public.immobili(id) ON DELETE SET NULL,
    CONSTRAINT proprietari_pratiche_fase_check CHECK (fase = ANY (ARRAY['Contatto'::text, 'Incontro/Sopralluogo'::text, 'Rivalutazione'::text, 'Presa in carico'::text]))
);

CREATE INDEX idx_proprietari_pratiche_proprietario_id ON public.proprietari_pratiche USING btree (proprietario_id);
CREATE INDEX idx_proprietari_pratiche_fase ON public.proprietari_pratiche USING btree (fase);
CREATE INDEX idx_proprietari_pratiche_immobile_id ON public.proprietari_pratiche USING btree (immobile_id);

ALTER TABLE public.proprietari_pratiche ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Consenti accesso completo agli agenti autenticati" ON public.proprietari_pratiche
    AS PERMISSIVE FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- compratori: stessa pipeline stato di leads.stato oggi (Nuovo/Contattato/
-- Trattativa/Chiuso/Perso), criteri di ricerca inline come su leads oggi
-- (zone_ricercate/tipologia_ricerca array — nessuna tabella lead_ricerca
-- separata per questa entità, replica lo schema attuale di leads).
-- -----------------------------------------------------------------------------
CREATE TABLE public.compratori (
    id                 uuid NOT NULL,
    nome               text NOT NULL,
    cognome            text,
    email              text,
    telefono           text,
    budget             numeric,
    zone_ricercate     text[],
    tipologia_ricerca  text[],
    note_interne       text,
    stato              text NOT NULL DEFAULT 'Nuovo',
    is_deleted         boolean NOT NULL DEFAULT false,
    deleted_at         timestamptz,
    _version           integer NOT NULL DEFAULT 1,
    CONSTRAINT compratori_pkey PRIMARY KEY (id),
    CONSTRAINT compratori_id_fkey FOREIGN KEY (id) REFERENCES public.contatti(id) ON DELETE CASCADE,
    CONSTRAINT compratori_stato_check CHECK (stato = ANY (ARRAY['Nuovo'::text, 'Contattato'::text, 'Trattativa'::text, 'Chiuso'::text, 'Perso'::text]))
);

CREATE INDEX idx_compratori_email ON public.compratori USING btree (email);
CREATE INDEX idx_compratori_stato ON public.compratori USING btree (stato);

ALTER TABLE public.compratori ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Consenti accesso completo agli agenti autenticati" ON public.compratori
    AS PERMISSIVE FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- collaboratori: certificatori/notai/responsabili Getrix o immobiliare.it —
-- chiunque non sia né proprietario né compratore. Tabella nuova, nessun dato
-- storico da migrare (non esisteva un tipo_cliente equivalente su leads).
-- -----------------------------------------------------------------------------
CREATE TABLE public.collaboratori (
    id            uuid NOT NULL,
    nome          text NOT NULL,
    cognome       text,
    email         text,
    telefono      text,
    professione   text,
    note_interne  text,
    is_deleted    boolean NOT NULL DEFAULT false,
    deleted_at    timestamptz,
    CONSTRAINT collaboratori_pkey PRIMARY KEY (id),
    CONSTRAINT collaboratori_id_fkey FOREIGN KEY (id) REFERENCES public.contatti(id) ON DELETE CASCADE
);

ALTER TABLE public.collaboratori ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Consenti accesso completo agli agenti autenticati" ON public.collaboratori
    AS PERMISSIVE FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- compratori_immobili: sostituisce lead_immobili per il lato compratore.
-- lead_immobili resta intatta finché il frontend non passa a questa tabella
-- (Fase 3/4).
-- -----------------------------------------------------------------------------
CREATE TABLE public.compratori_immobili (
    id               uuid NOT NULL DEFAULT gen_random_uuid(),
    compratore_id    uuid NOT NULL,
    immobile_id      uuid NOT NULL,
    stato_interesse  text DEFAULT 'Richiesta dal Web'::text,
    note             text,
    created_at       timestamptz DEFAULT now(),
    CONSTRAINT compratori_immobili_pkey PRIMARY KEY (id),
    CONSTRAINT compratori_immobili_compratore_id_immobile_id_key UNIQUE (compratore_id, immobile_id),
    CONSTRAINT compratori_immobili_compratore_id_fkey FOREIGN KEY (compratore_id) REFERENCES public.compratori(id) ON DELETE CASCADE,
    CONSTRAINT compratori_immobili_immobile_id_fkey FOREIGN KEY (immobile_id) REFERENCES public.immobili(id) ON DELETE CASCADE
);

ALTER TABLE public.compratori_immobili ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Consenti accesso completo agli agenti autenticati" ON public.compratori_immobili
    AS PERMISSIVE FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- valutazioni: aggiunge il collegamento al nuovo proprietario, in parallelo a
-- lead_id (non lo sostituisce ancora — vedi nota in testa al file).
-- -----------------------------------------------------------------------------
ALTER TABLE public.valutazioni
    ADD COLUMN proprietario_id uuid REFERENCES public.proprietari(id) ON DELETE SET NULL;

CREATE INDEX idx_valutazioni_proprietario_id ON public.valutazioni USING btree (proprietario_id);

-- -----------------------------------------------------------------------------
-- tasks / lead_notes / appuntamenti: aggiungono `contatto_id` generico in
-- parallelo a `lead_id` (decisione "collegamento generico da tasks/note/
-- appuntamenti a un contatto qualsiasi" in DECISIONI.md). `duplicato_da_id`
-- traccia le righe duplicate per i lead Ibrido (una copia per proprietario, una
-- per compratore) — solo per idempotenza dello script di backfill, da rimuovere
-- a cutover completato insieme a `contatti.lead_id_origine`.
-- -----------------------------------------------------------------------------
ALTER TABLE public.tasks
    ADD COLUMN contatto_id uuid REFERENCES public.contatti(id) ON DELETE CASCADE,
    ADD COLUMN duplicato_da_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL;

CREATE INDEX idx_tasks_contatto_id ON public.tasks USING btree (contatto_id);

ALTER TABLE public.lead_notes
    ADD COLUMN contatto_id uuid REFERENCES public.contatti(id) ON DELETE CASCADE,
    ADD COLUMN duplicato_da_id uuid REFERENCES public.lead_notes(id) ON DELETE SET NULL;

CREATE INDEX idx_lead_notes_contatto_id ON public.lead_notes USING btree (contatto_id);

ALTER TABLE public.appuntamenti
    ADD COLUMN contatto_id uuid REFERENCES public.contatti(id) ON DELETE SET NULL,
    ADD COLUMN duplicato_da_id uuid REFERENCES public.appuntamenti(id) ON DELETE SET NULL;

CREATE INDEX idx_appuntamenti_contatto_id ON public.appuntamenti USING btree (contatto_id);
