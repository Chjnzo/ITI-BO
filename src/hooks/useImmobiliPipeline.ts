import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { showError } from '@/utils/toast';
import { generaChecklistPerFase, upsertFasePipeline } from '@/lib/pipelineChecklist';
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
  // Sottofase corrente derivata dai documenti + date: primo gruppo (in ordine)
  // che ha almeno un doc "Da fare"; se tutti fatti resta l'ultimo gruppo. Per
  // Venduto, se data_atto è compilata la sottofase è sempre 'Archivio'.
  sottofase: Sottofase;
  docTotali: number;
  docCompletati: number;
  data_preliminare: string | null;
  data_atto: string | null;
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
  // FK proprietario_id ora punta a contatti(id). proprietari 1:1 con contatti
  // via id condiviso, quindi nesting: contatti → proprietari(nome, cognome).
  proprietario_contatto: { proprietari: { nome: string; cognome: string | null } | null } | null;
  pipeline: { fase: FasePipeline } | null;
  documenti: { stato: 'Da fare' | 'Fatto'; fase: FasePipeline; sottofase: Sottofase | null }[] | null;
}

const QUERY_KEY = ['immobili-pipeline'];

// Sottofase corrente = primo gruppo (in ordine spec) con almeno un doc "Da
// fare"; se tutti i gruppi sono completi resta l'ultimo. La funzione ignora i
// doc senza sottofase (edge case: catalogo aggiunto manualmente senza
// classificazione).
const derivaSottofase = (
  fase: FasePipeline,
  documenti: { stato: 'Da fare' | 'Fatto'; sottofase: Sottofase | null }[],
  dataAtto: string | null,
): Sottofase => {
  if (fase === 'Venduto' && dataAtto) return 'Archivio';
  const ordine: Sottofase[] =
    fase === 'In Vendita' ? SOTTOFASI_IN_VENDITA : SOTTOFASI_VENDUTO;
  // Nessun documento: card in prima sottofase (l'immobile è appena entrato
  // in questa fase). Se poi sarà popolata la checklist si sposta da sola.
  if (documenti.length === 0) return ordine[0];
  // Doc con sottofase NULL (schema vecchio o insert non aggiornato): li
  // consideriamo come "prima sottofase da fare" per non finire sull'ultima.
  const senzaSottofaseDaFare = documenti.some(
    (d) => d.sottofase === null && d.stato === 'Da fare',
  );
  if (senzaSottofaseDaFare) return ordine[0];
  for (const s of ordine) {
    const docsSottofase = documenti.filter((d) => d.sottofase === s);
    if (docsSottofase.some((d) => d.stato === 'Da fare')) return s;
  }
  return ordine[ordine.length - 1];
};

export const useImmobiliPipeline = () => {
  const queryClient = useQueryClient();

  const query = useQuery<PipelineCard[]>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('immobili')
        .select(`
          id, titolo, prezzo, citta, indirizzo, copertina_url,
          data_preliminare, data_atto, drive_folder_url,
          proprietario_contatto:contatti!immobili_proprietario_id_fkey(proprietari(nome, cognome)),
          pipeline:immobile_pipeline_stato(fase),
          documenti:immobile_documenti(stato, fase, sottofase)
        `)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return ((data ?? []) as unknown as RawImmobileRow[])
        // Gli immobili legacy pre-pivot non hanno immobile_pipeline_stato e
        // restano fuori dal Kanban: i nuovi immobili creati da PropertyWizard
        // (creaPipelineIniziale) hanno sempre la riga, quindi solo lo storico
        // pre-golive rimane invisibile qui — resta comunque in /immobili.
        .filter((row) => row.pipeline?.fase != null)
        .map((row) => {
          const fase = row.pipeline!.fase;
          const documentiFaseCorrente = (row.documenti ?? []).filter((d) => d.fase === fase);
          const sottofase = derivaSottofase(fase, documentiFaseCorrente, row.data_atto);
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
            docTotali: documentiFaseCorrente.length,
            docCompletati: documentiFaseCorrente.filter((d) => d.stato === 'Fatto').length,
            data_preliminare: row.data_preliminare,
            data_atto: row.data_atto,
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
      // documenti_catalogo per quella fase. Idempotente.
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

// Gate del passaggio In Vendita -> Venduto: tutti i documenti "In Vendita"
// devono essere 'Fatto' E data_preliminare compilata. Ritorna null se ok,
// altrimenti un messaggio descrittivo per l'utente.
export const controllaGateVenduto = (card: PipelineCard): string | null => {
  if (card.docTotali > 0 && card.docCompletati < card.docTotali) {
    return `Checklist "In Vendita" incompleta (${card.docCompletati}/${card.docTotali}). Completa tutti i documenti prima di passare a "Venduto".`;
  }
  if (!card.data_preliminare) {
    return 'Compila la data del preliminare prima di passare a "Venduto".';
  }
  return null;
};

// Solo per esplicitare che le sottofasi di In Vendita sono un tipo distinto
// da quelle di Venduto — utile ai componenti che iterano l'una o l'altra.
export type { SottofaseInVendita, SottofaseVenduto };
