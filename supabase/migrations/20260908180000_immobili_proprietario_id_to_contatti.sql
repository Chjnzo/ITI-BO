-- Post-pivot: immobili.proprietario_id puntava a leads(id) (design pre-pivot).
-- Ora il "proprietario" di un immobile è un contatto della nuova tabella
-- contatti/proprietari. Sposto la FK. Safe: tutti i 103 immobili in prod
-- hanno proprietario_id = NULL, quindi nessuna riga esistente da tradurre.
ALTER TABLE public.immobili
    DROP CONSTRAINT immobili_proprietario_id_fkey,
    ADD CONSTRAINT immobili_proprietario_id_fkey
        FOREIGN KEY (proprietario_id) REFERENCES public.contatti(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.immobili.proprietario_id IS
    'FK a contatti(id). Set automaticamente da creaImmobileDaPratica quando una pratica passa a Presa in carico. Editabile manualmente da PropertyWizard.';
