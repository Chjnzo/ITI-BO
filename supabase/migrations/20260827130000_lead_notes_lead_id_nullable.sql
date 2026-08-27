-- Pivot Proprietari/Compratori/Collaboratori, Fase 3 fix: lead_notes.lead_id
-- era rimasta NOT NULL nella migration precedente (a differenza di
-- tasks.lead_id/appuntamenti.lead_id, già nullable prima del pivot), il che
-- impediva di inserire note collegate solo via contatto_id (es. compratori
-- creati dopo il cutover, senza nessun leads.id di origine).
ALTER TABLE public.lead_notes ALTER COLUMN lead_id DROP NOT NULL;
