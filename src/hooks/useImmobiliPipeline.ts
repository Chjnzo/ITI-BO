import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { showError } from '@/utils/toast';
import { generaChecklistPerFase, upsertFasePipeline, upsertSottofasePipeline } from '@/lib/pipelineChecklist';
import type {
  FasePipeline,
  Sottofase,
  SottofaseInVendita,
  SottofaseVenduto,
} from '@/types';
import { SOTTOFASI_IN_VENDITA, SOTTOFASI_VENDUTO } from '@/types';

export const FASI_PIPELINE: FasePipeline[] = ['In Vendita', 'Venduto'];

export interface PipelineCard {
  id: string;
  titolo: string;
  prezzo?: number;
  citta: string;
  indirizzo: string;
  copertina_url?: string;
  drive_folder_url: string | null;
  proprietario_nome: string | null;
  fase: FasePipeline;
  // Sottofase persistita su immobile_pipeline_stato.sottofase, spostabile
  // manualmente via drag&drop tra le colonne del kanban (non più derivata dai
  // documenti come in v1). I documenti si sommano tra sottofasi della stessa
  // sezione: la card resta dove l'utente l'ha messa fino a spostamento manuale
  // o passaggio automatico alla sezione successiva.
  sottofase: Sottofase;
  docTotali: number;
  docCompletati: number;
  data_preliminare: string | null;
  data_atto: string | null;
  pubblicato_sito: boolean;
}

interface RawImmobileRow {
  id: string;
  titolo: string;
  prezzo: number | null;
  citta: string;
  indirizzo: string;
  copertina_url: string | null;
  data_preliminare: string | null;
  data_atto: string | null;
  drive_folder_url: string | null;
  pubblicato_sito: boolean;
  proprietario_contatto: { proprietari: { nome: string; cognome: string | null } | null } | null;
  pipeline: { fase: FasePipeline; sottofase: Sottofase | null } | null;
  documenti: { stato: 'Da fare' | 'Fatto'; fase: FasePipeline; sottofase: Sottofase | null }[] | null;
}

const QUERY_KEY = ['immobili-pipeline'];

const defaultSottofase = (fase: FasePipeline): Sottofase =>
  fase === 'In Vendita' ? 'Preparazione' : 'Vincolo';

export const useImmobiliPipeline = () => {
  const queryClient = useQueryClient();

  const query = useQuery<PipelineCard[]>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('immobili')
        .select(`
          id, titolo, prezzo, citta, indirizzo, copertina_url,
          data_preliminare, data_atto, drive_folder_url, pubblicato_sito,
          proprietario_contatto:contatti!immobili_proprietario_id_fkey(proprietari(nome, cognome)),
          pipeline:immobile_pipeline_stato(fase, sottofase),
          documenti:immobile_documenti(stato, fase, sottofase)
        `)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return ((data ?? []) as unknown as RawImmobileRow[])
        .filter((row) => row.pipeline?.fase != null)
        .map((row) => {
          const fase = row.pipeline!.fase;
          const sottofase: Sottofase = (row.pipeline!.sottofase ?? defaultSottofase(fase)) as Sottofase;
          // Conteggio doc per sottofase corrente (progress bar della card
          // riflette solo la sottofase in cui la card si trova, così l'utente
          // sa cosa gli manca lì).
          const documentiFaseCorrente = (row.documenti ?? []).filter((d) => d.fase === fase);
          const documentiSottofase = documentiFaseCorrente.filter((d) => d.sottofase === sottofase);
          return {
            id: row.id,
            titolo: row.titolo,
            prezzo: row.prezzo ?? undefined,
            citta: row.citta,
            indirizzo: row.indirizzo,
            copertina_url: row.copertina_url ?? undefined,
            drive_folder_url: row.drive_folder_url,
            proprietario_nome: row.proprietario_contatto?.proprietari
              ? `${row.proprietario_contatto.proprietari.nome} ${row.proprietario_contatto.proprietari.cognome ?? ''}`.trim()
              : null,
            fase,
            sottofase,
            docTotali: documentiSottofase.length,
            docCompletati: documentiSottofase.filter((d) => d.stato === 'Fatto').length,
            data_preliminare: row.data_preliminare,
            data_atto: row.data_atto,
            pubblicato_sito: row.pubblicato_sito ?? false,
          };
        });
    },
    staleTime: 30_000,
  });

  // Spostamento tra sezioni (In Vendita ↔ Venduto): reset della sottofase alla
  // prima della nuova sezione, genera la checklist della fase se non c'è già.
  const spostaFase = useMutation({
    mutationFn: async ({ immobileId, fase }: { immobileId: string; fase: FasePipeline }) => {
      await upsertFasePipeline(immobileId, fase, defaultSottofase(fase));
      await generaChecklistPerFase(immobileId, fase);
    },
    onMutate: async ({ immobileId, fase }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<PipelineCard[]>(QUERY_KEY);
      queryClient.setQueryData<PipelineCard[]>(QUERY_KEY, (old) =>
        (old ?? []).map((card) => (card.id === immobileId ? { ...card, fase, sottofase: defaultSottofase(fase) } : card)),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(QUERY_KEY, context.previous);
      showError('Spostamento non riuscito.');
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      if (variables) queryClient.invalidateQueries({ queryKey: ['immobile-documenti', variables.immobileId] });
    },
  });

  // Spostamento tra sottofasi (stessa sezione): manuale, senza vincoli sulla
  // checklist. Aggiorna solo la colonna sottofase su immobile_pipeline_stato.
  const spostaSottofase = useMutation({
    mutationFn: async ({ immobileId, sottofase }: { immobileId: string; sottofase: Sottofase }) => {
      await upsertSottofasePipeline(immobileId, sottofase);
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
      if (context?.previous) queryClient.setQueryData(QUERY_KEY, context.previous);
      showError('Spostamento non riuscito.');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  return {
    ...query,
    spostaFase: spostaFase.mutate,
    spostaSottofase: spostaSottofase.mutate,
  };
};

// Gate del passaggio In Vendita -> Venduto: legacy, non più agganciato nella
// UI (utente chiede passaggio manuale/automatico basato sul completamento
// dell'ultima sottofase). Mantenuto per compatibilità in caso servisse.
export const controllaGateVenduto = (card: PipelineCard): string | null => {
  if (card.docTotali > 0 && card.docCompletati < card.docTotali) {
    return `Checklist incompleta (${card.docCompletati}/${card.docTotali}).`;
  }
  return null;
};

export type { SottofaseInVendita, SottofaseVenduto };
// SOTTOFASI_IN_VENDITA/SOTTOFASI_VENDUTO sono re-esportati dal barrel types.
void SOTTOFASI_IN_VENDITA;
void SOTTOFASI_VENDUTO;
