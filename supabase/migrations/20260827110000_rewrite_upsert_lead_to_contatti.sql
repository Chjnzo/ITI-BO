-- Pivot Proprietari/Acquirenti/Collaboratori, Fase 2 (RPC): upsert_lead ora
-- scrive su contatti/proprietari/acquirenti invece che su leads/lead_immobili.
-- Firma invariata — ITI2.0/ContactForm.tsx non richiede nessuna modifica di
-- codice (vedi ITI2.0/PIVOT-CONTATTI-ITI-BO.md e docs/DECISIONI.md).
--
-- L'overload a 7 argomenti (senza p_tipo_interesse) non è mai chiamato da
-- ContactForm.tsx (che passa sempre p_tipo_interesse) né da nessun altro
-- punto del codice in questo repo o in ITI2.0 — è dead code, viene rimosso
-- invece di essere riscritto due volte.
DROP FUNCTION IF EXISTS public.upsert_lead(text, text, text, text, text, uuid, text);

CREATE OR REPLACE FUNCTION public.upsert_lead(
    p_nome text,
    p_cognome text,
    p_email text,
    p_telefono text,
    p_messaggio text DEFAULT NULL::text,
    p_immobile_id uuid DEFAULT NULL::uuid,
    p_immobile_interesse text DEFAULT NULL::text,
    p_tipo_interesse text DEFAULT 'acquistare'::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_contatto_id uuid;
    v_is_proprietario boolean := (p_tipo_interesse = 'vendere');
    v_recent_15 boolean;
    v_recent_24 boolean;
BEGIN
    IF p_email IS NOT NULL AND p_email <> ''
       AND p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
        RAISE EXCEPTION 'Formato email non valido: %', p_email;
    END IF;

    IF p_email IS NOT NULL AND p_email <> '' THEN
        IF v_is_proprietario THEN
            SELECT EXISTS (
                SELECT 1 FROM proprietari pr JOIN contatti c ON c.id = pr.id
                WHERE pr.email = p_email AND c.created_at > now() - interval '15 minutes'
            ), EXISTS (
                SELECT 1 FROM proprietari pr JOIN contatti c ON c.id = pr.id
                WHERE pr.email = p_email AND c.created_at > now() - interval '24 hours'
            ) INTO v_recent_15, v_recent_24;
        ELSE
            SELECT EXISTS (
                SELECT 1 FROM acquirenti co JOIN contatti c ON c.id = co.id
                WHERE co.email = p_email AND c.created_at > now() - interval '15 minutes'
            ), EXISTS (
                SELECT 1 FROM acquirenti co JOIN contatti c ON c.id = co.id
                WHERE co.email = p_email AND c.created_at > now() - interval '24 hours'
            ) INTO v_recent_15, v_recent_24;
        END IF;

        -- 15-minute hard rate limit
        IF v_recent_15 THEN
            RAISE EXCEPTION 'Too many requests – riprova tra 15 minuti'
                USING ERRCODE = 'P0001';
        END IF;

        -- 24-hour duplicate guard: silently skip
        IF v_recent_24 THEN
            RETURN;
        END IF;
    END IF;

    IF v_is_proprietario THEN
        SELECT pr.id INTO v_contatto_id
        FROM proprietari pr
        WHERE (pr.email    IS NOT NULL AND pr.email    = p_email)
           OR (pr.telefono IS NOT NULL AND pr.telefono = p_telefono)
        LIMIT 1;

        IF v_contatto_id IS NULL THEN
            INSERT INTO contatti DEFAULT VALUES RETURNING id INTO v_contatto_id;
            INSERT INTO proprietari (id, nome, cognome, email, telefono, note_interne)
            VALUES (v_contatto_id, p_nome, p_cognome, p_email, p_telefono, p_messaggio);
        ELSE
            UPDATE proprietari SET
                nome     = COALESCE(NULLIF(p_nome,     ''), nome),
                cognome  = COALESCE(NULLIF(p_cognome,  ''), cognome),
                email    = COALESCE(NULLIF(p_email,    ''), email),
                telefono = COALESCE(NULLIF(p_telefono, ''), telefono),
                note_interne = CASE
                    WHEN p_messaggio IS NOT NULL
                    THEN COALESCE(note_interne || E'\n---\n', '') || p_messaggio
                    ELSE note_interne
                END
            WHERE id = v_contatto_id;
        END IF;

        -- Nessun collegamento immobile lato proprietari: una pratica richiede
        -- via/tipologia/città (raccolte dall'agente, non dal form pubblico),
        -- non solo un immobile_id — p_immobile_id/p_immobile_interesse restano
        -- ignorati per il ramo "vendere", come già oggi il form non li valorizza
        -- in quel flusso.
    ELSE
        SELECT co.id INTO v_contatto_id
        FROM acquirenti co
        WHERE (co.email    IS NOT NULL AND co.email    = p_email)
           OR (co.telefono IS NOT NULL AND co.telefono = p_telefono)
        LIMIT 1;

        IF v_contatto_id IS NULL THEN
            INSERT INTO contatti DEFAULT VALUES RETURNING id INTO v_contatto_id;
            INSERT INTO acquirenti (id, nome, cognome, email, telefono, note_interne, stato)
            VALUES (v_contatto_id, p_nome, p_cognome, p_email, p_telefono, p_messaggio, 'Nuovo');
        ELSE
            UPDATE acquirenti SET
                nome     = COALESCE(NULLIF(p_nome,     ''), nome),
                cognome  = COALESCE(NULLIF(p_cognome,  ''), cognome),
                email    = COALESCE(NULLIF(p_email,    ''), email),
                telefono = COALESCE(NULLIF(p_telefono, ''), telefono),
                note_interne = CASE
                    WHEN p_messaggio IS NOT NULL
                    THEN COALESCE(note_interne || E'\n---\n', '') || p_messaggio
                    ELSE note_interne
                END
            WHERE id = v_contatto_id;
        END IF;

        IF p_immobile_id IS NOT NULL AND v_contatto_id IS NOT NULL THEN
            INSERT INTO acquirenti_immobili (acquirente_id, immobile_id, stato_interesse)
            VALUES (v_contatto_id, p_immobile_id, 'Richiesta dal Web')
            ON CONFLICT (acquirente_id, immobile_id) DO NOTHING;
        END IF;
    END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.upsert_lead(text, text, text, text, text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_lead(text, text, text, text, text, uuid, text, text) TO anon, authenticated;
