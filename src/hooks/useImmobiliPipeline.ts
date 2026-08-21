import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { showError } from '@/utils/toast';
import { generaChecklistPerFase, upsertFasePipeline, SOTTOFASI_PIPELINE } from '@/lib/pipelineChecklist';
import type { FasePipeline } from '@/types';

export const FASI_PIPELINE: FasePipeline[] = ['Acquisizione', 'In Vendita', 'Venduto', 'Archivio'];
export { SOTTOFASI_PIPELINE };

export interface PipelineCard {
  id: string;
  titolo: string;
  prezzo?: number;
  citta: string;
  indirizzo: string;
  copertina_url?: string;
  proprietario_nome: string | null;
  fase: FasePipeline;
  sottofase: string | null;
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
  pipeline: { fase: FasePipeline; sottofase: string | null } | null;
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
          pipeline:immobile_pipeline_stato(fase, sottofase),
          documenti:immobile_documenti(stato, fase)
        `)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return ((data ?? []) as unknown as RawImmobileRow[]).map((row) => {
        // Immobili creati prima dell'introduzione della pipeline (o dal Wizard,
        // che non crea ancora la riga) non hanno immobile_pipeline_stato:
        // li trattiamo come 'Acquisizione' finché non vengono spostati.
        const fase = row.pipeline?.fase ?? 'Acquisizione';
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
          sottofase: row.pipeline?.sottofase ?? null,
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
      const sottofase = SOTTOFASI_PIPELINE[fase][0] ?? null;
      queryClient.setQueryData<PipelineCard[]>(QUERY_KEY, (old) =>
        (old ?? []).map((card) => (card.id === immobileId ? { ...card, fase, sottofase } : card)),
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

  const aggiornaSottofase = useMutation({
    // upsert, non update: un immobile mai spostato manualmente in una fase
    // (es. dati pre-esistenti alla pipeline) non ha ancora una riga in
    // immobile_pipeline_stato — un plain update non troverebbe nulla da
    // aggiornare e fallirebbe silenziosamente (0 righe toccate, nessun errore).
    mutationFn: async ({ immobileId, fase, sottofase }: { immobileId: string; fase: FasePipeline; sottofase: string | null }) => {
      const { error } = await supabase
        .from('immobile_pipeline_stato')
        .upsert({ immobile_id: immobileId, fase, sottofase }, { onConflict: 'immobile_id' });
      if (error) throw error;
      // Stesso motivo di spostaFase: un immobile che non era mai passato da
      // un drag&drop non ha ancora righe in immobile_documenti per la fase
      // corrente. generaChecklistPerFase è idempotente, quindi chiamarla qui
      // non tocca nulla se la checklist esiste già.
      await generaChecklistPerFase(immobileId, fase);
    },
    onMutate: async ({ immobileId, sottofase }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<PipelineCard[]>(QUERY_KEY);
      queryClient.setQueryData<PipelineCard[]>(QUERY_KEY, (old) =>
        (old ?? []).map((card) => (card.id === immobileId ? { ...card, sottofase } : card)),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEY, context.previous);
      }
      showError('Aggiornamento sottofase non riuscito.');
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      if (variables) {
        queryClient.invalidateQueries({ queryKey: ['immobile-documenti', variables.immobileId] });
      }
    },
  });

  return { ...query, spostaFase: spostaFase.mutate, aggiornaSottofase: aggiornaSottofase.mutate };
};
