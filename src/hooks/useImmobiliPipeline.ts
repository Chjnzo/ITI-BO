import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { showError } from '@/utils/toast';
import { generaChecklistPerFase, upsertFasePipeline } from '@/lib/pipelineChecklist';
import type { FasePipeline } from '@/types';

export const FASI_PIPELINE: FasePipeline[] = ['In Vendita', 'Venduto', 'Archivio'];

export interface PipelineCard {
  id: string;
  titolo: string;
  prezzo?: number;
  citta: string;
  indirizzo: string;
  copertina_url?: string;
  proprietario_nome: string | null;
  fase: FasePipeline;
  docTotali: number;
  docCompletati: number;
}

interface RawImmobileRow {
  id: string;
  titolo: string;
  prezzo: number | null;
  citta: string;
  indirizzo: string;
  copertina_url: string | null;
  proprietario: { id: string; nome: string; cognome: string } | null;
  pipeline: { fase: FasePipeline } | null;
  documenti: { stato: 'Da fare' | 'Fatto'; fase: FasePipeline }[] | null;
}

const QUERY_KEY = ['immobili-pipeline'];

export const useImmobiliPipeline = () => {
  const queryClient = useQueryClient();

  const query = useQuery<PipelineCard[]>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('immobili')
        .select(`
          id, titolo, prezzo, citta, indirizzo, copertina_url,
          proprietario:leads!immobili_proprietario_id_fkey(id, nome, cognome),
          pipeline:immobile_pipeline_stato(fase),
          documenti:immobile_documenti(stato, fase)
        `)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return ((data ?? []) as unknown as RawImmobileRow[]).map((row) => {
        // Immobili creati prima dell'introduzione della pipeline (o dal Wizard,
        // che non crea ancora la riga) non hanno immobile_pipeline_stato:
        // li trattiamo come 'In Vendita' (prima fase rimasta dopo la rimozione
        // di 'Acquisizione', vedi migration
        // 20260827150000_remove_acquisizione_fase_immobili.sql) finché non
        // vengono spostati.
        const fase = row.pipeline?.fase ?? 'In Vendita';
        // La checklist mostrata/contata deve riflettere solo la fase corrente:
        // un immobile che ha già attraversato più fasi accumula righe in
        // immobile_documenti per ciascuna di esse, ma il progresso in Kanban
        // riguarda solo i documenti della fase in cui si trova ora.
        const documentiFaseCorrente = (row.documenti ?? []).filter((d) => d.fase === fase);
        return {
          id: row.id,
          titolo: row.titolo,
          prezzo: row.prezzo ?? undefined,
          citta: row.citta,
          indirizzo: row.indirizzo,
          copertina_url: row.copertina_url ?? undefined,
          proprietario_nome: row.proprietario ? `${row.proprietario.nome} ${row.proprietario.cognome}` : null,
          fase,
          docTotali: documentiFaseCorrente.length,
          docCompletati: documentiFaseCorrente.filter((d) => d.stato === 'Fatto').length,
        };
      });
    },
    staleTime: 30_000,
  });

  const spostaFase = useMutation({
    mutationFn: async ({ immobileId, fase }: { immobileId: string; fase: FasePipeline }) => {
      await upsertFasePipeline(immobileId, fase);
      // La checklist non si genera da sola: quando l'immobile entra in una
      // nuova fase vanno create le righe immobile_documenti previste da
      // documenti_catalogo per quella fase. generaChecklistPerFase è
      // idempotente: se l'immobile era già passato in questa fase in
      // precedenza (es. spostato avanti e indietro), gli stati già segnati
      // 'Fatto' non vengono toccati.
      await generaChecklistPerFase(immobileId, fase);
    },
    onMutate: async ({ immobileId, fase }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<PipelineCard[]>(QUERY_KEY);
      queryClient.setQueryData<PipelineCard[]>(QUERY_KEY, (old) =>
        (old ?? []).map((card) => (card.id === immobileId ? { ...card, fase } : card)),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEY, context.previous);
      }
      showError('Spostamento non riuscito.');
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      if (variables) {
        queryClient.invalidateQueries({ queryKey: ['immobile-documenti', variables.immobileId] });
      }
    },
  });

  return { ...query, spostaFase: spostaFase.mutate };
};
