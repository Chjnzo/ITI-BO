-- Flag "caldo" sui proprietari: di default false, diventa true quando l'agente
-- avvia una pratica (o lo marca manualmente dalla scheda contatto).
ALTER TABLE public.proprietari
  ADD COLUMN IF NOT EXISTS caldo boolean NOT NULL DEFAULT false;

-- Link cartella documenti (Drive) condiviso da tutti e tre i tipi di contatto
-- (proprietari/acquirenti/collaboratori), per la tab "Documenti" della scheda.
ALTER TABLE public.contatti
  ADD COLUMN IF NOT EXISTS drive_folder_url text;
