import { supabase } from '@/lib/supabase';
import type { FasePipeline } from '@/types';

// Shared by useImmobiliPipeline's spostaFase (moving between fasi) and
// PropertyWizard (creating a new immobile, which always starts in
// 'In Vendita'). Idempotent: upsert with ignoreDuplicates means re-running
// it for a fase already generated never clobbers existing 'Fatto' states.
export const generaChecklistPerFase = async (immobileId: string, fase: FasePipeline) => {
  const { data: catalogo, error: catalogoError } = await supabase
    .from('documenti_catalogo')
    .select('documento, sottofase')
    .eq('fase', fase);
  if (catalogoError) throw catalogoError;
  if (!catalogo || catalogo.length === 0) return;

  // Salviamo anche sottofase: senza questa colonna la card in Kanban
  // finiva sempre nell'ultima sottofase (derivaSottofase in
  // useImmobiliPipeline non trovava match e cadeva sul fallback).
  const { error: docError } = await supabase
    .from('immobile_documenti')
    .upsert(
      catalogo.map((c) => ({ immobile_id: immobileId, fase, documento: c.documento, sottofase: c.sottofase })),
      { onConflict: 'immobile_id,documento', ignoreDuplicates: true },
    );
  if (docError) throw docError;
};

export const upsertFasePipeline = async (immobileId: string, fase: FasePipeline) => {
  // updated_at va impostato esplicitamente: l'upsert PostgREST con onConflict
  // aggiorna solo le colonne presenti nel payload, quindi senza questo campo
  // resterebbe congelato alla creazione della riga. L'alert di stagnazione
  // (§3.6) dipende da questo timestamp per calcolare da quanto l'immobile è
  // nella fase corrente.
  const { error } = await supabase
    .from('immobile_pipeline_stato')
    .upsert(
      { immobile_id: immobileId, fase, updated_at: new Date().toISOString() },
      { onConflict: 'immobile_id' },
    );
  if (error) throw error;
};

// A new immobile has no immobile_pipeline_stato row yet: without this, its
// Kanban card sits in 'In Vendita' (the hook's default fallback) with an
// empty, uncreated checklist until the first manual drag-and-drop move.
export const creaPipelineIniziale = async (immobileId: string) => {
  await upsertFasePipeline(immobileId, 'In Vendita');
  await generaChecklistPerFase(immobileId, 'In Vendita');
};
