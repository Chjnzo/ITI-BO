-- Pivot Proprietari/Compratori/Collaboratori, Fase 7: motore di alert
-- configurabile. Sostituisce le soglie di stagnazione hardcoded in
-- useAlerts.ts (SOGLIA_STAGNAZIONE_GIORNI, solo immobili) con una tabella che
-- l'Admin gestisce dalla UI Impostazioni — richiesta esplicita della
-- pianificazione 2026-08-21 ("motore di regole configurabile dagli admin...
-- deve coprire almeno le fasi del kanban proprietari").
--
-- Scope: copre solo il pattern "entità ferma in fase X da N giorni" (alert di
-- stagnazione), per entrambe le pipeline (immobili e proprietari). Restano
-- invariati e fuori da questa tabella: l'alert "documento mancante" su
-- immobili (logica di confronto presenza/catalogo in useAlerts.ts, non è un
-- pattern "N giorni in fase X") e gli alert manuali (`immobile_alert`).
--
-- Combinazioni fisse, non CRUD libero: ogni (entita_tipo, fase) valida è
-- un'unica riga pre-seedata (7 in totale: 3 fasi immobili + 4 fasi
-- proprietari) che l'Admin modifica (giorni_soglia/destinatario/attiva) ma
-- non aggiunge/rimuove — le fasi sono un enum chiuso condiviso con i CHECK di
-- immobile_pipeline_stato/proprietari_pratiche, un "aggiungi regola" libero
-- permetterebbe righe orfane senza fase reale a cui applicarsi.

CREATE TABLE public.alert_regole (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entita_tipo text NOT NULL CHECK (entita_tipo IN ('immobile', 'proprietario')),
  fase text NOT NULL,
  giorni_soglia integer NOT NULL CHECK (giorni_soglia > 0),
  destinatario text NOT NULL DEFAULT 'tutti' CHECK (destinatario IN ('agente_responsabile', 'tutti')),
  attiva boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT alert_regole_fase_valida CHECK (
    (entita_tipo = 'immobile' AND fase IN ('In Vendita', 'Venduto', 'Archivio'))
    OR (entita_tipo = 'proprietario' AND fase IN ('Contatto', 'Incontro/Sopralluogo', 'Rivalutazione', 'Presa in carico'))
  ),
  UNIQUE (entita_tipo, fase)
);

-- Seed dei 7 combi fissi. Soglie immobili identiche ai valori hardcoded
-- rimossi da useAlerts.ts (nessuna regressione di comportamento). Soglie
-- proprietari: nessun valore precedente esisteva, stima ragionevole non
-- confermata dall'utente (stesso principio già usato per le soglie immobili
-- diverse da "In Vendita" quando furono introdotte, vedi commento storico in
-- useAlerts.ts) — da tarare se si rivela sbagliata in pratica. "Archivio" e
-- "Presa in carico" sono fasi terminali del rispettivo flusso operativo
-- (l'immobile archiviato non è più gestito attivamente; la pratica a "Presa
-- in carico" genera l'immobile e il presidio si sposta lì), quindi seedate
-- disattive di default: l'Admin può accenderle dalla UI se vuole comunque
-- monitorarle.
INSERT INTO public.alert_regole (entita_tipo, fase, giorni_soglia, destinatario, attiva) VALUES
  ('immobile', 'In Vendita', 60, 'tutti', true),
  ('immobile', 'Venduto', 45, 'tutti', true),
  ('immobile', 'Archivio', 90, 'tutti', false),
  ('proprietario', 'Contatto', 7, 'tutti', true),
  ('proprietario', 'Incontro/Sopralluogo', 10, 'tutti', true),
  ('proprietario', 'Rivalutazione', 14, 'tutti', true),
  ('proprietario', 'Presa in carico', 30, 'tutti', false);

-- RLS: lettura aperta a tutti gli agenti autenticati (il motore di alert gira
-- lato client per chiunque sia loggato, non solo Admin — ogni agente deve
-- poter calcolare i propri alert). Scrittura (le uniche mutazioni ammesse
-- sono UPDATE sulle 7 righe pre-seedate, niente INSERT/DELETE da client)
-- ristretta agli Admin via is_admin(), stessa funzione introdotta in Fase 6.
ALTER TABLE public.alert_regole ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated possono leggere alert_regole" ON public.alert_regole
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Solo Admin modifica alert_regole" ON public.alert_regole
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
