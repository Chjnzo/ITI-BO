-- Generated column that strips spaces, dashes, dots, parentheses and plus signs
-- from telefono so phone searches are spacing-agnostic.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS telefono_clean text
  GENERATED ALWAYS AS (
    regexp_replace(coalesce(telefono, ''), '[\s\-\.\+\(\)]', '', 'g')
  ) STORED;

CREATE INDEX IF NOT EXISTS leads_telefono_clean_idx ON leads (telefono_clean);
