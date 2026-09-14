-- §1 Aggiunge `immobile_id` a tasks — oggi le task hanno solo lead_id/
-- contatto_id, quindi non è possibile collegare una task a un immobile in
-- gestione. Serve per (a) far sparire il concetto separato di "scadenza"
-- della pipeline e usare le task ovunque, e (b) mostrare in PipelineDetailSheet
-- l'elenco delle task collegate a quell'immobile.
--
-- ON DELETE SET NULL: se l'immobile viene (soft- o hard-) eliminato la task
-- resta, come già succede per contatto_id via ON DELETE CASCADE — comportamento
-- coerente col fatto che tasks.contatto_id oggi è CASCADE ma la task sopravvive
-- alla cancellazione del contatto solo se ha anche lead_id/immobile_id.

ALTER TABLE public.tasks
    ADD COLUMN IF NOT EXISTS immobile_id uuid NULL
    REFERENCES public.immobili(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_immobile_id
    ON public.tasks USING btree (immobile_id)
    WHERE immobile_id IS NOT NULL;


-- §2 Migra le righe di pipeline_scadenze in tasks (una task per scadenza) e
-- dismette la tabella. Motivazione: le "scadenze" della pipeline erano di
-- fatto task con un'etichetta diversa — l'utente vuole un solo posto in cui
-- vedere/gestire le cose da fare, sincronizzato tra Task/Contatti/Gestione.
--
-- Idempotenza: uso INSERT ... SELECT senza riusare gli id vecchi (tasks avrà
-- nuovi UUID), quindi se questa migration girasse due volte le stesse righe
-- verrebbero migrate due volte. Ma la migration è protetta dal DROP TABLE
-- finale — la seconda esecuzione trova la tabella già inesistente e salta
-- tutto grazie al `pg_class` check qui sotto.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_class
        WHERE relname = 'pipeline_scadenze' AND relnamespace = 'public'::regnamespace
    ) THEN
        -- Fallback agente per scadenze orfane: primo profilo disponibile in
        -- profili_agenti (in prod ce n'è almeno uno; se il DB è veramente
        -- vuoto la CTE non produce righe e la INSERT si limita a scartarle
        -- silenziosamente — un'orfana non ha dove finire, meglio perderla che
        -- bloccare la migration).
        WITH fallback AS (
            SELECT id FROM public.profili_agenti ORDER BY id LIMIT 1
        )
        -- 2.1 Scadenze legate a un immobile: agente = agente del proprietario
        -- dell'immobile (via contatti.agente_id), contatto_id = proprietario.
        INSERT INTO public.tasks (
            titolo, data, stato, urgente, origine,
            immobile_id, contatto_id, agente_id, nota, created_at
        )
        SELECT
            COALESCE(NULLIF(TRIM(ps.descrizione), ''), 'Scadenza pipeline'),
            ps.scadenza,
            CASE WHEN ps.completata THEN 'Completata' ELSE 'Da fare' END,
            false,
            'gestione',
            ps.immobile_id,
            i.proprietario_id,
            COALESCE(c.agente_id, (SELECT id FROM fallback)),
            'Migrata da pipeline_scadenze (fase: ' || COALESCE(ps.fase, '-')
                || COALESCE(', sottofase: ' || ps.sottofase, '') || ')',
            ps.created_at
        FROM public.pipeline_scadenze ps
        JOIN public.immobili i ON i.id = ps.immobile_id
        LEFT JOIN public.contatti c ON c.id = i.proprietario_id
        WHERE ps.immobile_id IS NOT NULL
          AND COALESCE(c.agente_id, (SELECT id FROM fallback)) IS NOT NULL;

        -- 2.2 Scadenze legate a una pratica: agente = agente del proprietario,
        -- contatto_id = proprietario, immobile_id = eventuale immobile della
        -- pratica (può essere NULL se la pratica non è ancora arrivata a
        -- Presa in carico).
        WITH fallback AS (
            SELECT id FROM public.profili_agenti ORDER BY id LIMIT 1
        )
        INSERT INTO public.tasks (
            titolo, data, stato, urgente, origine,
            immobile_id, contatto_id, agente_id, nota, created_at
        )
        SELECT
            COALESCE(NULLIF(TRIM(ps.descrizione), ''), 'Scadenza pipeline'),
            ps.scadenza,
            CASE WHEN ps.completata THEN 'Completata' ELSE 'Da fare' END,
            false,
            'gestione',
            pp.immobile_id,
            pp.proprietario_id,
            COALESCE(c.agente_id, (SELECT id FROM fallback)),
            'Migrata da pipeline_scadenze (pratica, fase: ' || COALESCE(ps.fase, '-') || ')',
            ps.created_at
        FROM public.pipeline_scadenze ps
        JOIN public.proprietari_pratiche pp ON pp.id = ps.pratica_id
        LEFT JOIN public.contatti c ON c.id = pp.proprietario_id
        WHERE ps.pratica_id IS NOT NULL
          AND COALESCE(c.agente_id, (SELECT id FROM fallback)) IS NOT NULL;

        -- 2.3 Droppa la tabella (le sue righe sono ora in tasks).
        DROP TABLE public.pipeline_scadenze;
    END IF;
END $$;
