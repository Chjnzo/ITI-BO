-- Pivot Proprietari/Compratori/Collaboratori, Fase 5: rimuove 'Acquisizione'
-- dalla pipeline immobili. Da quando un proprietario passa dalla pipeline
-- proprietari_pratiche (Fase 4), l'acquisizione avviene lì, non più come
-- prima fase del Kanban immobili — un immobile ora nasce già in 'In Vendita'
-- (creato da PropertyWizard o da proprietari_pratiche.spostaFase quando la
-- pratica arriva a "Presa in carico").
--
-- I 4 documenti che oggi vivono su documenti_catalogo/immobile_documenti fase
-- 'Acquisizione' (Doc Valutazione, Privacy proprietario firmata, Incarico di
-- mediazione firmato, CI/CF proprietario) sono documenti lato proprietario,
-- non lato immobile: si spostano sulla pratica proprietario (nuove tabelle
-- proprietari_documenti_catalogo/proprietari_pratica_documenti, stesso
-- pattern di documenti_catalogo/immobile_documenti). Nessun nuovo documento
-- da aggiungere alle fasi restanti della pipeline immobili (In Vendita/
-- Venduto/Archivio hanno già una checklist completa e indipendente
-- dall'acquisizione, vedi i rispettivi INSERT in
-- 20260820160000_property_centric_schema_additive.sql).
--
-- Migrazione dati inclusa qui (a differenza dei backfill leads->contatti, che
-- sono script separati non-migration): a differenza di quelle, questa tocca
-- tabelle già popolate SOLO dalle migration/dal codice applicativo (mai da
-- `leads`), quindi gira correttamente sia in produzione (dati reali, se
-- presenti) sia in un `supabase db reset` locale pulito (nessuna riga
-- 'Acquisizione' esistente, la sezione 4 è un no-op idempotente). Se in
-- produzione questa migration viene applicata PRIMA che
-- scripts/backfill-contatti-pivot.sql abbia creato le proprietari_pratiche
-- corrispondenti, i documenti 'Acquisizione' orfani vengono comunque
-- eliminati senza errore (nessuna pratica da collegare): applicare quello
-- script prima di questa migration per non perdere lo stato 'Fatto'
-- storico.

-- -----------------------------------------------------------------------------
-- 1) proprietari_documenti_catalogo: stesso pattern di documenti_catalogo,
--    ma sulle 4 fasi di proprietari_pratiche (nessuna sottofase, coerente con
--    la scelta "niente sottofase per la pipeline proprietari").
-- -----------------------------------------------------------------------------
CREATE TABLE public.proprietari_documenti_catalogo (
    id         uuid NOT NULL DEFAULT gen_random_uuid(),
    fase       text NOT NULL CHECK (fase = ANY (ARRAY['Contatto'::text, 'Incontro/Sopralluogo'::text, 'Rivalutazione'::text, 'Presa in carico'::text])),
    documento  text NOT NULL,
    ordine     integer NOT NULL DEFAULT 0,
    CONSTRAINT proprietari_documenti_catalogo_pkey PRIMARY KEY (id),
    CONSTRAINT proprietari_documenti_catalogo_fase_documento_key UNIQUE (fase, documento)
);

ALTER TABLE public.proprietari_documenti_catalogo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Consenti accesso completo agli agenti autenticati" ON public.proprietari_documenti_catalogo
    AS PERMISSIVE FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

INSERT INTO public.proprietari_documenti_catalogo (fase, documento, ordine) VALUES
    ('Contatto',        'Doc Valutazione', 1),
    ('Presa in carico', 'Privacy proprietario firmata', 2),
    ('Presa in carico', 'Incarico di mediazione firmato', 3),
    ('Presa in carico', 'CI/CF proprietario', 4);

-- -----------------------------------------------------------------------------
-- 2) proprietari_pratica_documenti: checklist per pratica, stesso pattern di
--    immobile_documenti ma senza drive_file_id/upload (nessuna integrazione
--    Drive per i documenti proprietario in questa fase — solo spunta manuale,
--    coerente con la semplicità scelta per il Kanban proprietari; l'upload su
--    Drive per questi documenti resta un possibile lavoro futuro separato).
-- -----------------------------------------------------------------------------
CREATE TABLE public.proprietari_pratica_documenti (
    id             uuid NOT NULL DEFAULT gen_random_uuid(),
    pratica_id     uuid NOT NULL REFERENCES public.proprietari_pratiche(id) ON DELETE CASCADE,
    fase           text NOT NULL CHECK (fase = ANY (ARRAY['Contatto'::text, 'Incontro/Sopralluogo'::text, 'Rivalutazione'::text, 'Presa in carico'::text])),
    documento      text NOT NULL,
    stato          text NOT NULL DEFAULT 'Da fare' CHECK (stato = ANY (ARRAY['Da fare'::text, 'Fatto'::text])),
    completato_at  timestamptz,
    created_at     timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT proprietari_pratica_documenti_pkey PRIMARY KEY (id),
    CONSTRAINT proprietari_pratica_documenti_pratica_documento_key UNIQUE (pratica_id, documento)
);

CREATE INDEX idx_proprietari_pratica_documenti_pratica_id ON public.proprietari_pratica_documenti USING btree (pratica_id);

ALTER TABLE public.proprietari_pratica_documenti ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Consenti accesso completo agli agenti autenticati" ON public.proprietari_pratica_documenti
    AS PERMISSIVE FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 3) Migrazione dati: sposta i documenti 'Acquisizione' esistenti sulla
--    pratica collegata allo stesso immobile (se esiste), preservando lo stato
--    'Fatto'/'Da fare' già segnato. Immobili senza pratica corrispondente
--    (pratica non ancora creata da backfill-contatti-pivot.sql) perdono
--    silenziosamente questi 4 documenti: nessun dato critico, solo checkbox.
-- -----------------------------------------------------------------------------
INSERT INTO public.proprietari_pratica_documenti (pratica_id, fase, documento, stato, completato_at)
SELECT pp.id, pdc.fase, doc.documento, doc.stato, doc.completato_at
FROM public.immobile_documenti doc
JOIN public.proprietari_pratiche pp ON pp.immobile_id = doc.immobile_id
JOIN public.proprietari_documenti_catalogo pdc ON pdc.documento = doc.documento
WHERE doc.fase = 'Acquisizione'
ON CONFLICT (pratica_id, documento) DO NOTHING;

DELETE FROM public.immobile_documenti WHERE fase = 'Acquisizione';
DELETE FROM public.documenti_catalogo WHERE fase = 'Acquisizione';

-- Immobili rimasti in 'Acquisizione' passano a 'In Vendita' (prima fase
-- rimasta), sottofase riportata alla prima di 'In Vendita' come fa
-- upsertFasePipeline ad ogni cambio fase manuale.
UPDATE public.immobile_pipeline_stato
SET fase = 'In Vendita',
    sottofase = 'Burocratiche',
    updated_at = timezone('utc'::text, now())
WHERE fase = 'Acquisizione';

-- Rigenera la checklist 'In Vendita' per gli immobili appena spostati (e,
-- idempotentemente, per qualunque altro immobile già in 'In Vendita' a cui
-- mancasse — stesso INSERT...SELECT di scripts/backfill-property-centric-model.sql).
INSERT INTO public.immobile_documenti (immobile_id, fase, documento)
SELECT ips.immobile_id, ips.fase, dc.documento
FROM public.immobile_pipeline_stato ips
JOIN public.documenti_catalogo dc ON dc.fase = ips.fase
WHERE ips.fase = 'In Vendita'
ON CONFLICT (immobile_id, documento) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 4) Stringe i CHECK esistenti togliendo 'Acquisizione' (nomi verificati con
--    pg_get_constraintdef su questa stessa colonna in locale). Il DEFAULT di
--    immobile_pipeline_stato.fase passa a 'In Vendita', prima fase rimasta.
-- -----------------------------------------------------------------------------
ALTER TABLE public.documenti_catalogo
    DROP CONSTRAINT documenti_catalogo_fase_check,
    ADD CONSTRAINT documenti_catalogo_fase_check CHECK (fase = ANY (ARRAY['In Vendita'::text, 'Venduto'::text, 'Archivio'::text]));

ALTER TABLE public.immobile_pipeline_stato
    DROP CONSTRAINT immobile_pipeline_stato_fase_check,
    ADD CONSTRAINT immobile_pipeline_stato_fase_check CHECK (fase = ANY (ARRAY['In Vendita'::text, 'Venduto'::text, 'Archivio'::text])),
    ALTER COLUMN fase SET DEFAULT 'In Vendita';

ALTER TABLE public.immobile_documenti
    DROP CONSTRAINT immobile_documenti_fase_check,
    ADD CONSTRAINT immobile_documenti_fase_check CHECK (fase = ANY (ARRAY['In Vendita'::text, 'Venduto'::text, 'Archivio'::text]));
