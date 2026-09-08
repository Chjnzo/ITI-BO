-- Kanban2 (In Vendita) e Kanban3 (Venduto): reintroduce la sottofase come
-- raggruppamento visuale delle checklist documenti nella board, e aggiunge le
-- due date che fanno da gate al passaggio di fase:
--
--   * data_preliminare  → firma del preliminare, gate In Vendita -> Venduto
--   * data_atto         → rogito notarile, marca l'ingresso in "Archivio"
--                         (che ora è la 4ª sottofase di Venduto, non più una
--                         fase pipeline separata: la spec chiede 4 step in
--                         Kanban3 = Vincolo / Preliminare / Rogito / Archivio,
--                         tutti visualizzati come colonne nella board Venduto).
--
-- La colonna sottofase era stata dropped in 20260902130000 perché veniva usata
-- come etichetta manuale. Qui la reintroduciamo con semantica diversa: NON è
-- editabile a mano, è il campo del catalogo documenti che dice a quale gruppo
-- appartiene ogni doc. La "sottofase corrente" della card in Kanban è invece
-- derivata a runtime (primo gruppo con doc "Da fare"), non memorizzata sullo
-- stato pipeline (evita la duplicazione di verità che aveva causato il drop).

-- -----------------------------------------------------------------------------
-- 1) Reintroduce sottofase su documenti_catalogo (nullable) e la popola per i
--    documenti esistenti secondo lo schema originale dell'INSERT in
--    20260820160000_property_centric_schema_additive.sql. Marketing per "In
--    Vendita" resta senza documenti nel catalogo (l'utente potrà aggiungerli
--    dopo se serve — non li inventiamo qui).
-- -----------------------------------------------------------------------------
ALTER TABLE public.documenti_catalogo
    ADD COLUMN sottofase text;

UPDATE public.documenti_catalogo SET sottofase = 'Burocratiche' WHERE fase = 'In Vendita' AND documento IN (
    'Atto notarile di provenienza',
    'Planimetria e visure',
    'APE',
    'Modulo antiriciclaggio proprietario',
    'Spese condominiali/verbale assemblea',
    'Richiesta accesso agli atti'
);
UPDATE public.documenti_catalogo SET sottofase = 'Appuntamenti' WHERE fase = 'In Vendita' AND documento IN (
    'Documento proposta d''acquisto',
    'Documenti acquirente (CI/tessera sanitaria)',
    'Copia assegno/deposito cauzionale',
    'Allegato A provvigioni'
);
UPDATE public.documenti_catalogo SET sottofase = 'Vincolo'      WHERE fase = 'Venduto' AND documento = 'Doc Preliminare';
UPDATE public.documenti_catalogo SET sottofase = 'Preliminare'  WHERE fase = 'Venduto' AND documento IN (
    'Fattura agenzia',
    'Versamento caparra',
    'Modulo antiriciclaggio acquirente'
);
UPDATE public.documenti_catalogo SET sottofase = 'Rogito'       WHERE fase = 'Venduto' AND documento IN (
    'Liberatoria condominiale',
    'Verifica stati civili',
    'IBAN saldo/mutuo',
    'Atto di provenienza'
);

-- -----------------------------------------------------------------------------
-- 2) Migra "Archivio" da fase pipeline a sottofase di Venduto. Il singolo
--    doc di catalogo "Copia Atto Notarile definitivo" e le sue istanze in
--    immobile_documenti passano a fase='Venduto', sottofase='Archivio'; gli
--    immobili in fase='Archivio' passano anch'essi a 'Venduto'.
--    La sottofase su immobile_documenti serve solo come ridondanza per query
--    di gate (evita di dover fare JOIN con documenti_catalogo ogni volta).
-- -----------------------------------------------------------------------------
ALTER TABLE public.immobile_documenti
    ADD COLUMN sottofase text;

-- popola la sottofase per tutti i doc già esistenti, riflettendo il catalogo
UPDATE public.immobile_documenti d
SET sottofase = dc.sottofase
FROM public.documenti_catalogo dc
WHERE dc.fase = d.fase AND dc.documento = d.documento;

-- Sposta il documento Archivio dentro Venduto (catalog + istanze).
UPDATE public.documenti_catalogo
SET fase = 'Venduto', sottofase = 'Archivio'
WHERE fase = 'Archivio';

UPDATE public.immobile_documenti
SET fase = 'Venduto', sottofase = 'Archivio'
WHERE fase = 'Archivio';

-- Immobili storicamente in fase='Archivio': la migration originale non li
-- creava mai (Archivio esisteva solo come slot vuoto), ma per sicurezza
-- copriamo il caso e li spostiamo in Venduto.
UPDATE public.immobile_pipeline_stato
SET fase = 'Venduto',
    updated_at = timezone('utc'::text, now())
WHERE fase = 'Archivio';

-- -----------------------------------------------------------------------------
-- 3) Restringe i CHECK a due sole fasi pipeline: ['In Vendita', 'Venduto'].
-- -----------------------------------------------------------------------------
ALTER TABLE public.documenti_catalogo
    DROP CONSTRAINT documenti_catalogo_fase_check,
    ADD CONSTRAINT documenti_catalogo_fase_check CHECK (fase = ANY (ARRAY['In Vendita'::text, 'Venduto'::text]));

ALTER TABLE public.immobile_pipeline_stato
    DROP CONSTRAINT immobile_pipeline_stato_fase_check,
    ADD CONSTRAINT immobile_pipeline_stato_fase_check CHECK (fase = ANY (ARRAY['In Vendita'::text, 'Venduto'::text]));

ALTER TABLE public.immobile_documenti
    DROP CONSTRAINT immobile_documenti_fase_check,
    ADD CONSTRAINT immobile_documenti_fase_check CHECK (fase = ANY (ARRAY['In Vendita'::text, 'Venduto'::text]));

-- -----------------------------------------------------------------------------
-- 4) Date del percorso Venduto: gate del passaggio (data_preliminare) e marca
--    dell'ingresso in sottofase Archivio (data_atto). Sono nullable: si
--    compilano dalla sheet in Kanban quando servono.
-- -----------------------------------------------------------------------------
ALTER TABLE public.immobili
    ADD COLUMN data_preliminare date,
    ADD COLUMN data_atto        date;

COMMENT ON COLUMN public.immobili.data_preliminare IS
    'Firma del preliminare. Gate obbligatorio (insieme a checklist "In Vendita" completa) per spostare l''immobile a Kanban3 "Venduto".';

COMMENT ON COLUMN public.immobili.data_atto IS
    'Rogito notarile definitivo. Marca l''ingresso nella sottofase "Archivio" della Kanban3.';
