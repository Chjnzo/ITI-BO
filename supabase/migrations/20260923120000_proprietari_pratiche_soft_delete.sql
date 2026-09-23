-- Aggiunge soft-delete a proprietari_pratiche.
--
-- Perché: fino a oggi il tasto "Elimina" nella scheda pratica cancellava solo
-- l'immobile collegato (soft-delete su immobili) e sganciava la pratica,
-- lasciando quest'ultima "vuota" nel kanban. Non c'era modo di eliminare una
-- pratica in fase Valutazione (nessun immobile ancora esistente).
--
-- Spec utente (2026-09-23): "vorrei che l'opzione eliminare l'immobile ci sia
-- dalla prima parte della gestione quindi dalla valutazione — elimina la
-- pratica ma il proprietario rimane". Da qui: soft-delete della pratica,
-- proprietario intatto (resta in Contatti).
--
-- Pattern coerente con immobili/proprietari/acquirenti (is_deleted + deleted_at
-- già presenti su quelle tabelle).

ALTER TABLE public.proprietari_pratiche
  ADD COLUMN is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN deleted_at timestamptz;

-- Indice parziale: la query di lettura del kanban filtra sempre is_deleted =
-- false, e le pratiche eliminate saranno una minoranza — indice parziale è
-- più leggero di uno completo.
CREATE INDEX idx_proprietari_pratiche_not_deleted
  ON public.proprietari_pratiche (updated_at DESC)
  WHERE is_deleted = false;
