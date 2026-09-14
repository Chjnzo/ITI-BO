-- Supporto multi-agente sugli appuntamenti. La segreteria vuole poter
-- assegnare un evento a due o più agenti (es. "Prima visita" con l'agente di
-- riferimento + un collega di supporto).
--
-- Aggiungiamo `agenti_ids uuid[]` come lista canonica dei partecipanti;
-- `agente_id` (già NOT NULL, primario) resta valorizzato col PRIMO agente
-- della lista per retrocompat con tutte le query esistenti che filtrano per
-- `agente_id` (RLS, viste per agente, colore calendario). Backfill:
-- `agenti_ids = ARRAY[agente_id]` per tutte le righe esistenti.

ALTER TABLE public.appuntamenti
    ADD COLUMN IF NOT EXISTS agenti_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[];

-- Backfill: allinea agenti_ids all'attuale agente_id per le righe storiche.
-- Idempotente: sovrascrive solo se agenti_ids è ancora vuoto.
UPDATE public.appuntamenti
SET agenti_ids = ARRAY[agente_id]
WHERE agenti_ids = ARRAY[]::uuid[]
  AND agente_id IS NOT NULL;

-- Trigger di auto-sync: se agenti_ids è vuoto ma agente_id è settato, lo
-- popola con ARRAY[agente_id]. Se agente_id è cambiato, si assicura che
-- sia presente in agenti_ids. Ciò rende retro-compatibili tutti gli INSERT
-- storici (seed, upsert_lead, altri codepath che non conoscono agenti_ids).
CREATE OR REPLACE FUNCTION public.sync_appuntamenti_agenti_ids()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.agenti_ids IS NULL OR array_length(NEW.agenti_ids, 1) IS NULL THEN
        -- lista vuota o null → riparti dal primario
        NEW.agenti_ids := ARRAY[NEW.agente_id];
    ELSIF NEW.agente_id IS NOT NULL AND NOT (NEW.agente_id = ANY (NEW.agenti_ids)) THEN
        -- primario non presente in lista → aggiungilo davanti
        NEW.agenti_ids := ARRAY[NEW.agente_id] || NEW.agenti_ids;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appuntamenti_sync_agenti_ids ON public.appuntamenti;
CREATE TRIGGER appuntamenti_sync_agenti_ids
    BEFORE INSERT OR UPDATE ON public.appuntamenti
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_appuntamenti_agenti_ids();

-- CHECK: agente_id deve essere presente nella lista agenti_ids (garantito
-- dal trigger di sopra, ma teniamo il vincolo come sicurezza extra).
ALTER TABLE public.appuntamenti
    DROP CONSTRAINT IF EXISTS appuntamenti_agente_id_in_agenti_ids;
ALTER TABLE public.appuntamenti
    ADD CONSTRAINT appuntamenti_agente_id_in_agenti_ids
    CHECK (agente_id = ANY (agenti_ids));

-- Indice GIN per query di tipo "eventi in cui l'agente X è coinvolto"
-- (utile per la vista "Per agente" quando estenderà agli agenti secondari).
CREATE INDEX IF NOT EXISTS idx_appuntamenti_agenti_ids_gin
    ON public.appuntamenti USING GIN (agenti_ids);

COMMENT ON COLUMN public.appuntamenti.agenti_ids IS
    'Lista completa dei partecipanti (uuid). agente_id resta il primario/owner ed è sempre incluso in questa lista (vedi CHECK).';
