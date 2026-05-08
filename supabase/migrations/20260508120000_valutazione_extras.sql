-- Aggiunge campi per dotazioni, terrazzo, anno ristrutturazione alle valutazioni

ALTER TABLE valutazioni
  ADD COLUMN IF NOT EXISTS ha_terrazzo        BOOLEAN   DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS terrazzo_mq        INTEGER,
  ADD COLUMN IF NOT EXISTS anno_ristrutturazione INTEGER,
  ADD COLUMN IF NOT EXISTS dotazioni_extra    TEXT[]    DEFAULT '{}';
