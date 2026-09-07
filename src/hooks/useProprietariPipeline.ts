import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { showError } from '@/utils/toast';
import { upsertFasePipeline, generaChecklistPerFase } from '@/lib/pipelineChecklist';
import { generaChecklistPraticaPerFase } from '@/lib/proprietariChecklist';
import type { FaseProprietario } from '@/types';

export const FASI_PROPRIETARI: FaseProprietario[] = ['Incontro/Sopralluogo', 'Rivalutazione', 'Presa in carico'];

export interface PraticaCard {
  id: string;
  proprietario_id: string;
  via: string;
  tipologia: string | null;
  citta: string | null;
  fase: FaseProprietario;
  agente_id: string | null;
  proprietario_nome: string;
  proprietario_telefono: string | null;
  valutazione_stimata: number | null;
  immobile_id: string | null;
  updated_at: string;
  docTotali: number;
  docCompletati: number;
}

interface RawPraticaRow {
  id: string;
  proprietario_id: string;
  via: string;
  tipologia: string | null;
  citta: string | null;
  fase: FaseProprietario;
  valutazione_stimata: number | null;
  immobile_id: string | null;
  updated_at: string;
  proprietario: {
    nome: string;
    cognome: string | null;
    telefono: string | null;
    contatti: { agente_id: string | null } | null;
  } | null;
  documenti: { stato: 'Da fare' | 'Fatto'; fase: FaseProprietario }[] | null;
}

const QUERY_KEY = ['proprietari-pipeline'];

export const useProprietariPipeline = () => {
  const queryClient = useQueryClient();

  const query = useQuery<PraticaCard[]>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proprietari_pratiche')
        .select(`
          id, proprietario_id, via, tipologia, citta, fase, valutazione_stimata, immobile_id, updated_at,
          proprietario:proprietari!proprietari_pratiche_proprietario_id_fkey(nome, cognome, telefono, contatti(agente_id)),
          documenti:proprietari_pratica_documenti(stato, fase)
        `)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      return ((data ?? []) as unknown as RawPraticaRow[]).map((row) => {
        // Stesso criterio di useImmobiliPipeline: la checklist mostrata conta
        // solo i documenti della fase corrente (Incontro/Sopralluogo e
        // Rivalutazione non hanno documenti in catalogo, quindi restano 0/0).
        const documentiFaseCorrente = (row.documenti ?? []).filter((d) => d.fase === row.fase);
        return {
          id: row.id,
          proprietario_id: row.proprietario_id,
          via: row.via,
          tipologia: row.tipologia,
          citta: row.citta,
          fase: row.fase,
          agente_id: row.proprietario?.contatti?.agente_id ?? null,
          proprietario_nome: row.proprietario ? `${row.proprietario.nome} ${row.proprietario.cognome ?? ''}`.trim() : '',
          proprietario_telefono: row.proprietario?.telefono ?? null,
          valutazione_stimata: row.valutazione_stimata,
          immobile_id: row.immobile_id,
          updated_at: row.updated_at,
          docTotali: documentiFaseCorrente.length,
          docCompletati: documentiFaseCorrente.filter((d) => d.stato === 'Fatto').length,
        };
      });
    },
    staleTime: 30_000,
  });

  const spostaFase = useMutation({
    mutationFn: async ({ praticaId, fase }: { praticaId: string; fase: FaseProprietario }) => {
      const { error } = await supabase
        .from('proprietari_pratiche')
        .update({ fase, updated_at: new Date().toISOString() })
        .eq('id', praticaId);
      if (error) throw error;

      // Stesso motivo di spostaFase in useImmobiliPipeline: la checklist non
      // si genera da sola, va creata per la fase appena raggiunta. Idempotente.
      await generaChecklistPraticaPerFase(praticaId, fase);

      if (fase === 'Presa in carico') {
        await creaImmobileDaPratica(praticaId);
      }
    },
    onMutate: async ({ praticaId, fase }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<PraticaCard[]>(QUERY_KEY);
      queryClient.setQueryData<PraticaCard[]>(QUERY_KEY, (old) =>
        (old ?? []).map((card) => (card.id === praticaId ? { ...card, fase } : card)),
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
        queryClient.invalidateQueries({ queryKey: ['proprietari-pratica-documenti', variables.praticaId] });
      }
      if (variables?.fase === 'Presa in carico') {
        queryClient.invalidateQueries({ queryKey: ['immobili-pipeline'] });
      }
    },
  });

  return { ...query, spostaFase: spostaFase.mutate };
};

// Quando una pratica arriva a "Presa in carico" (presa d'incarico firmata) si
// crea automaticamente l'immobile corrispondente in gestione immobili,
// saltando la fase "Acquisizione" della pipeline immobili: l'acquisizione è
// appena avvenuta qui, nella pipeline proprietari. L'immobile entra
// direttamente in "In Vendita" come bozza (stato 'Bozza', stesso comportamento
// di default di PropertyWizard alla creazione — non tocchiamo `visibile`,
// resta il default true come per ogni altro immobile appena creato), da
// completare con foto/prezzo/dettagli tramite PropertyWizard. Idempotente: se
// la pratica ha già un immobile_id (es. spostata avanti e indietro sulla
// colonna "Presa in carico"), non ne crea un secondo.
const creaImmobileDaPratica = async (praticaId: string) => {
  const { data: pratica, error: praticaError } = await supabase
    .from('proprietari_pratiche')
    .select('id, via, tipologia, citta, immobile_id, valutazione_stimata, motivazione_vendita, scadenza_esclusiva')
    .eq('id', praticaId)
    .single();
  if (praticaError) throw praticaError;
  if (pratica.immobile_id) return;

  const baseSlug = (pratica.via || 'immobile').toLowerCase().trim().replace(/ /g, '-').replace(/[^\w-]+/g, '');
  const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 8)}`;

  const { data: immobile, error: immobileError } = await supabase
    .from('immobili')
    .insert({
      titolo: pratica.tipologia ? `${pratica.tipologia} in ${pratica.via}` : pratica.via,
      indirizzo: pratica.via,
      citta: pratica.citta,
      tipologia: pratica.tipologia,
      prezzo: pratica.valutazione_stimata,
      motivazione_vendita: pratica.motivazione_vendita,
      scadenza_esclusiva: pratica.scadenza_esclusiva,
      stato: 'Bozza',
      slug,
    })
    .select('id')
    .single();
  if (immobileError) throw immobileError;

  const { error: linkError } = await supabase
    .from('proprietari_pratiche')
    .update({ immobile_id: immobile.id })
    .eq('id', praticaId);
  if (linkError) throw linkError;

  // Stesso motivo di creaPipelineIniziale in PropertyWizard: senza questa riga
  // l'immobile arriverebbe in Kanban immobili senza immobile_pipeline_stato
  // (fallback 'Acquisizione' nell'hook, checklist vuota).
  await upsertFasePipeline(immobile.id, 'In Vendita');
  await generaChecklistPerFase(immobile.id, 'In Vendita');
};
