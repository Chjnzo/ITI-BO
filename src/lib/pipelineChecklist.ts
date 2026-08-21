import { supabase } from '@/lib/supabase';
import type { FasePipeline } from '@/types';

// Definita qui (non in useImmobiliPipeline.ts, che importa da questo file)
// per evitare un ciclo di import; useImmobiliPipeline la ri-esporta.
export const SOTTOFASI_PIPELINE: Record<FasePipeline, string[]> = {
  Acquisizione: ['Contatto', 'Incontro', 'Sopralluogo', 'Rivalutazione', 'Presa in carico'],
  'In Vendita': ['Burocratiche', 'Marketing', 'Appuntamenti'],
  Venduto: ['Vincolo', 'Preliminare', 'Rogito'],
  Archivio: [],
};

// Shared by useImmobiliPipeline's spostaFase (moving between fasi) and
// PropertyWizard (creating a new immobile, which always starts in
// 'Acquisizione'). Idempotent: upsert with ignoreDuplicates means re-running
// it for a fase already generated never clobbers existing 'Fatto' states.
export const generaChecklistPerFase = async (immobileId: string, fase: FasePipeline) => {
  const { data: catalogo, error: catalogoError } = await supabase
    .from('documenti_catalogo')
    .select('documento')
    .eq('fase', fase);
  if (catalogoError) throw catalogoError;
  if (!catalogo || catalogo.length === 0) return;

  const { error: docError } = await supabase
    .from('immobile_documenti')
    .upsert(
      catalogo.map((c) => ({ immobile_id: immobileId, fase, documento: c.documento })),
      { onConflict: 'immobile_id,documento', ignoreDuplicates: true },
    );
  if (docError) throw docError;
};

export const upsertFasePipeline = async (immobileId: string, fase: FasePipeline) => {
  // Entrando in una nuova fase la sottofase riparte sempre dalla prima della
  // lista (o null per Archivio, che non ne ha): l'avanzamento successivo è
  // manuale, non c'è auto-avanzamento legato alla checklist documenti.
  const sottofase = SOTTOFASI_PIPELINE[fase][0] ?? null;
  const { error } = await supabase
    .from('immobile_pipeline_stato')
    .upsert({ immobile_id: immobileId, fase, sottofase }, { onConflict: 'immobile_id' });
  if (error) throw error;
};

// A new immobile has no immobile_pipeline_stato row yet: without this, its
// Kanban card sits in 'Acquisizione' (the hook's default fallback) with an
// empty, uncreated checklist until the first manual drag-and-drop move.
export const creaPipelineIniziale = async (immobileId: string) => {
  await upsertFasePipeline(immobileId, 'Acquisizione');
  await generaChecklistPerFase(immobileId, 'Acquisizione');
};
