import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { differenceInCalendarDays } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { showError } from '@/utils/toast';
import type { FasePipeline, ImmobileAlert } from '@/types';

// Soglie di stagnazione per fase (giorni senza cambio fase prima di segnalare
// l'immobile come fermo). 60gg per "In Vendita" è il valore esplicito della
// spec (§3.6); gli altri sono una stima ragionevole per fasi più brevi — non
// confermata dall'utente, da tarare se si rivela sbagliata in pratica (vedi
// docs/DECISIONI.md). Archivio è fuori dal cruscotto operativo: nessun alert.
const SOGLIA_STAGNAZIONE_GIORNI: Record<FasePipeline, number | null> = {
  Acquisizione: 30,
  'In Vendita': 60,
  Venduto: 45,
  Archivio: null,
};

export interface AlertManuale extends ImmobileAlert {
  immobile: { titolo: string; indirizzo: string; citta: string } | null;
}

export interface AlertAutomatico {
  id: string;
  tipo: 'stagnazione' | 'documento_mancante';
  immobileId: string;
  immobileTitolo: string;
  immobileIndirizzo: string;
  immobileCitta: string;
  messaggio: string;
}

interface RawImmobileRow {
  id: string;
  titolo: string;
  indirizzo: string;
  citta: string;
  pipeline: { fase: FasePipeline; updated_at: string } | null;
  documenti: { documento: string; fase: FasePipeline }[] | null;
}

const MANUALI_QUERY_KEY = ['immobile-alert-manuali'];
const BASE_QUERY_KEY = ['immobili-alert-base'];
const CATALOGO_QUERY_KEY = ['documenti-catalogo-alert'];

export const useAlerts = () => {
  const queryClient = useQueryClient();

  const manuali = useQuery<AlertManuale[]>({
    queryKey: MANUALI_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('immobile_alert')
        .select('*, immobile:immobili(titolo, indirizzo, citta)')
        .eq('risolto', false)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AlertManuale[];
    },
    staleTime: 30_000,
  });

  // Base immobili + fase/updated_at + documenti effettivamente presenti:
  // dati minimi per calcolare gli alert automatici a runtime, senza righe
  // persistite (vedi docs/DECISIONI.md).
  const base = useQuery<RawImmobileRow[]>({
    queryKey: BASE_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('immobili')
        .select(`
          id, titolo, indirizzo, citta,
          pipeline:immobile_pipeline_stato(fase, updated_at),
          documenti:immobile_documenti(documento, fase)
        `)
        .eq('is_deleted', false);
      if (error) throw error;
      return (data ?? []) as unknown as RawImmobileRow[];
    },
    staleTime: 30_000,
  });

  const catalogo = useQuery<{ fase: FasePipeline; documento: string }[]>({
    queryKey: CATALOGO_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from('documenti_catalogo').select('fase, documento');
      if (error) throw error;
      return (data ?? []) as { fase: FasePipeline; documento: string }[];
    },
    staleTime: 5 * 60_000,
  });

  const automatici: AlertAutomatico[] = [];
  if (base.data && catalogo.data) {
    const catalogoPerFase = catalogo.data.reduce<Record<string, string[]>>((acc, c) => {
      (acc[c.fase] ??= []).push(c.documento);
      return acc;
    }, {});

    for (const immobile of base.data) {
      // Immobili senza riga immobile_pipeline_stato (mai spostati, o creati
      // prima della pipeline) sono trattati come 'Acquisizione', coerente col
      // fallback già usato in useImmobiliPipeline — ma senza updated_at non
      // c'è modo di calcolare la stagnazione, quindi restano esclusi da
      // quell'alert (non da quello documenti).
      const fase = immobile.pipeline?.fase ?? 'Acquisizione';

      const soglia = SOGLIA_STAGNAZIONE_GIORNI[fase];
      if (soglia !== null && immobile.pipeline?.updated_at) {
        const giorni = differenceInCalendarDays(new Date(), new Date(immobile.pipeline.updated_at));
        if (giorni >= soglia) {
          automatici.push({
            id: `stagnazione-${immobile.id}`,
            tipo: 'stagnazione',
            immobileId: immobile.id,
            immobileTitolo: immobile.titolo,
            immobileIndirizzo: immobile.indirizzo,
            immobileCitta: immobile.citta,
            messaggio: `Fermo in "${fase}" da ${giorni} giorni.`,
          });
        }
      }

      // Confronto per presenza di riga (non per stato 'Fatto'/'Da fare', già
      // visibile nella checklist del Kanban): segnala documenti previsti dal
      // catalogo per la fase corrente ma mai generati per questo immobile
      // (tipicamente perché il catalogo è stato aggiornato dopo la creazione
      // della checklist).
      const attesi = catalogoPerFase[fase] ?? [];
      const presenti = new Set(
        (immobile.documenti ?? []).filter((d) => d.fase === fase).map((d) => d.documento),
      );
      const mancanti = attesi.filter((doc) => !presenti.has(doc));
      if (mancanti.length > 0) {
        automatici.push({
          id: `documento-mancante-${immobile.id}`,
          tipo: 'documento_mancante',
          immobileId: immobile.id,
          immobileTitolo: immobile.titolo,
          immobileIndirizzo: immobile.indirizzo,
          immobileCitta: immobile.citta,
          messaggio: `Documento non ancora in checklist: ${mancanti.join(', ')}.`,
        });
      }
    }
  }

  const creaAlert = useMutation({
    mutationFn: async ({ immobileId, messaggio }: { immobileId: string; messaggio: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from('immobile_alert').insert({
        immobile_id: immobileId,
        messaggio,
        creato_da: userData.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MANUALI_QUERY_KEY }),
    onError: () => showError('Creazione alert non riuscita.'),
  });

  const risolviAlert = useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await supabase
        .from('immobile_alert')
        .update({ risolto: true, risolto_at: new Date().toISOString() })
        .eq('id', alertId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MANUALI_QUERY_KEY }),
    onError: () => showError('Risoluzione alert non riuscita.'),
  });

  return {
    manuali: manuali.data ?? [],
    automatici,
    isLoading: manuali.isLoading || base.isLoading || catalogo.isLoading,
    totalCount: (manuali.data?.length ?? 0) + automatici.length,
    creaAlert: creaAlert.mutate,
    risolviAlert: risolviAlert.mutate,
  };
};
