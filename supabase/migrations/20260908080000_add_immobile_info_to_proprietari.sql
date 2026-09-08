-- Info sull'immobile che il proprietario vuole vendere: vivono direttamente
-- sulla scheda anagrafica del proprietario, indipendentemente dall'avvio di
-- una pratica. Quando l'agente attiva la pratica (AvviaPraticaDialog) questi
-- valori vengono usati come pre-fill della pratica ma restano visibili qui
-- anche prima e dopo. Distinti da proprietari_pratiche perché quel record
-- rappresenta la kanban attiva, non l'anagrafica dell'immobile.
ALTER TABLE public.proprietari
  ADD COLUMN via_immobile        text,
  ADD COLUMN citta_immobile      text,
  ADD COLUMN tipologia_immobile  text,
  ADD COLUMN zona_venditore      text,
  ADD COLUMN motivazione_vendita text,
  ADD COLUMN scadenza_esclusiva  date,
  ADD COLUMN valutazione_stimata numeric;

-- Backfill una tantum dai leads originari + immobile collegato quando esiste.
-- Idempotente su prod perché i dati esistenti erano stati appena migrati e
-- questi campi sono al momento tutti NULL. Se una futura ri-esecuzione trovasse
-- dati già scritti, la LEFT JOIN sovrascriverebbe con l'ultima verità di leads:
-- questa migration nasce come one-shot post-cutover, il flusso continuo passa
-- dal frontend (ProprietarioSchedaSheet) non da qui.
UPDATE public.proprietari p
SET
  via_immobile        = COALESCE(i.indirizzo, l.via_immobile),
  citta_immobile      = i.citta,
  tipologia_immobile  = i.tipologia,
  zona_venditore      = l.zona_venditore,
  motivazione_vendita = l.motivazione_vendita,
  scadenza_esclusiva  = l.scadenza_esclusiva,
  valutazione_stimata = l.valutazione_stimata
FROM public.contatti c
JOIN public.leads l ON l.id = c.lead_id_origine
LEFT JOIN public.immobili i ON i.id = l.immobile_id
WHERE c.id = p.id;
