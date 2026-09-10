import { supabase } from '@/lib/supabase';
import type { FasePipeline, Sottofase } from '@/types';

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

  const { error: docError } = await supabase
    .from('immobile_documenti')
    .upsert(
      catalogo.map((c) => ({ immobile_id: immobileId, fase, documento: c.documento, sottofase: c.sottofase })),
      { onConflict: 'immobile_id,documento', ignoreDuplicates: true },
    );
  if (docError) throw docError;
};

// Upsert fase + sottofase in un solo colpo — la colonna sottofase è NOT NULL
// (default 'Preparazione'), quindi passiamo sempre un valore coerente con la
// fase (defaultSottofase in useImmobiliPipeline).
export const upsertFasePipeline = async (immobileId: string, fase: FasePipeline, sottofase: Sottofase) => {
  const { error } = await supabase
    .from('immobile_pipeline_stato')
    .upsert(
      { immobile_id: immobileId, fase, sottofase, updated_at: new Date().toISOString() },
      { onConflict: 'immobile_id' },
    );
  if (error) throw error;
};

// Solo cambio sottofase (drag&drop tra colonne nel kanban della stessa
// sezione): la fase resta invariata, aggiorniamo solo sottofase + timestamp.
export const upsertSottofasePipeline = async (immobileId: string, sottofase: Sottofase) => {
  const { error } = await supabase
    .from('immobile_pipeline_stato')
    .update({ sottofase, updated_at: new Date().toISOString() })
    .eq('immobile_id', immobileId);
  if (error) throw error;
};

// A new immobile has no immobile_pipeline_stato row yet: without this, its
// Kanban card sits in 'In Vendita' (the hook's default fallback) with an
// empty, uncreated checklist until the first manual drag-and-drop move.
// Chiama anche l'Edge Function drive-documenti/createFolder così l'immobile
// nasce già con la cartella Drive dedicata, senza aspettare il primo upload.
// Best-effort: eventuali errori vengono ignorati (lo Apps Script farà lazy
// fallback su lookup per nome al primo upload).
export const creaPipelineIniziale = async (immobileId: string) => {
  await upsertFasePipeline(immobileId, 'In Vendita', 'Preparazione');
  await generaChecklistPerFase(immobileId, 'In Vendita');
  try {
    await supabase.functions.invoke('drive-documenti', {
      body: { action: 'createFolder', immobileId },
    });
  } catch (_) {
    // volutamente ignorato
  }
};
