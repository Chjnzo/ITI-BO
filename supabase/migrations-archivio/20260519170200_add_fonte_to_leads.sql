-- Add fonte column to track lead origin (sito = website, manuale = CRM)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS fonte TEXT NOT NULL DEFAULT 'manuale';

-- Update upsert_lead overload 1 to set fonte = 'sito' on INSERT
CREATE OR REPLACE FUNCTION public.upsert_lead(
    p_nome text,
    p_cognome text,
    p_email text,
    p_telefono text,
    p_messaggio text DEFAULT NULL::text,
    p_immobile_id uuid DEFAULT NULL::uuid,
    p_immobile_interesse text DEFAULT NULL::text
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_lead_id UUID;
BEGIN
    IF p_email IS NOT NULL AND p_email <> ''
       AND p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
        RAISE EXCEPTION 'Formato email non valido: %', p_email;
    END IF;

    IF p_email IS NOT NULL AND p_email <> '' THEN
        IF EXISTS (
            SELECT 1 FROM leads
            WHERE email = p_email
              AND created_at > now() - interval '15 minutes'
        ) THEN
            RAISE EXCEPTION 'Too many requests – riprova tra 15 minuti'
                USING ERRCODE = 'P0001';
        END IF;

        IF EXISTS (
            SELECT 1 FROM leads
            WHERE email = p_email
              AND created_at > now() - interval '24 hours'
        ) THEN
            RETURN;
        END IF;
    END IF;

    SELECT id INTO v_lead_id
    FROM leads
    WHERE (email    IS NOT NULL AND email    = p_email)
       OR (telefono IS NOT NULL AND telefono = p_telefono)
    LIMIT 1;

    IF v_lead_id IS NULL THEN
        INSERT INTO leads (nome, cognome, email, telefono, note_interne, tipo_cliente, stato, fonte)
        VALUES (p_nome, p_cognome, p_email, p_telefono, p_messaggio, 'Acquirente', 'Nuovo', 'sito')
        RETURNING id INTO v_lead_id;
    ELSE
        UPDATE leads SET
            nome     = COALESCE(NULLIF(p_nome,     ''), nome),
            cognome  = COALESCE(NULLIF(p_cognome,  ''), cognome),
            email    = COALESCE(NULLIF(p_email,    ''), email),
            telefono = COALESCE(NULLIF(p_telefono, ''), telefono),
            note_interne = CASE
                WHEN p_messaggio IS NOT NULL
                THEN COALESCE(note_interne || E'\n---\n', '') || p_messaggio
                ELSE note_interne
            END
        WHERE id = v_lead_id;
    END IF;

    IF p_immobile_id IS NOT NULL AND v_lead_id IS NOT NULL THEN
        INSERT INTO lead_immobili (lead_id, immobile_id, stato_interesse)
        VALUES (v_lead_id, p_immobile_id, 'Interessato')
        ON CONFLICT (lead_id, immobile_id) DO NOTHING;
    END IF;
END;
$function$;

-- Update upsert_lead overload 2 (with p_tipo_interesse) to set fonte = 'sito' on INSERT
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
    v_lead_id UUID;
    v_tipo_cliente TEXT;
BEGIN
    v_tipo_cliente := CASE
        WHEN p_tipo_interesse = 'vendere' THEN 'Venditore'
        ELSE 'Acquirente'
    END;

    IF p_email IS NOT NULL AND p_email <> ''
       AND p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
        RAISE EXCEPTION 'Formato email non valido: %', p_email;
    END IF;

    IF p_email IS NOT NULL AND p_email <> '' THEN
        IF EXISTS (
            SELECT 1 FROM leads
            WHERE email = p_email
              AND created_at > now() - interval '15 minutes'
        ) THEN
            RAISE EXCEPTION 'Too many requests – riprova tra 15 minuti'
                USING ERRCODE = 'P0001';
        END IF;

        IF EXISTS (
            SELECT 1 FROM leads
            WHERE email = p_email
              AND created_at > now() - interval '24 hours'
        ) THEN
            RETURN;
        END IF;
    END IF;

    SELECT id INTO v_lead_id
    FROM leads
    WHERE (email    IS NOT NULL AND email    = p_email)
       OR (telefono IS NOT NULL AND telefono = p_telefono)
    LIMIT 1;

    IF v_lead_id IS NULL THEN
        INSERT INTO leads (nome, cognome, email, telefono, note_interne, tipo_cliente, stato, fonte)
        VALUES (p_nome, p_cognome, p_email, p_telefono, p_messaggio, v_tipo_cliente, 'Nuovo', 'sito')
        RETURNING id INTO v_lead_id;
    ELSE
        UPDATE leads SET
            nome         = COALESCE(NULLIF(p_nome,     ''), nome),
            cognome      = COALESCE(NULLIF(p_cognome,  ''), cognome),
            email        = COALESCE(NULLIF(p_email,    ''), email),
            telefono     = COALESCE(NULLIF(p_telefono, ''), telefono),
            tipo_cliente = v_tipo_cliente,
            note_interne = CASE
                WHEN p_messaggio IS NOT NULL
                THEN COALESCE(note_interne || E'\n---\n', '') || p_messaggio
                ELSE note_interne
            END
        WHERE id = v_lead_id;
    END IF;

    IF p_immobile_id IS NOT NULL AND v_lead_id IS NOT NULL THEN
        INSERT INTO lead_immobili (lead_id, immobile_id, stato_interesse)
        VALUES (v_lead_id, p_immobile_id, 'Interessato')
        ON CONFLICT (lead_id, immobile_id) DO NOTHING;
    END IF;
END;
$function$;
