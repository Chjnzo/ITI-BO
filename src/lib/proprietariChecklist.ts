import { supabase } from '@/lib/supabase';
import type { FaseProprietario } from '@/types';

// Analogo di src/lib/pipelineChecklist.ts ma per proprietari_pratiche: stesso
// pattern catalogo -> checklist, senza sottofase (la pipeline proprietari non
// ne ha) e senza upload Drive (solo spunta manuale, vedi migration
// 20260827150000_remove_acquisizione_fase_immobili.sql).
export const generaChecklistPraticaPerFase = async (praticaId: string, fase: FaseProprietario) => {
  const { data: catalogo, error: catalogoError } = await supabase
    .from('proprietari_documenti_catalogo')
    .select('documento')
    .eq('fase', fase);
  if (catalogoError) throw catalogoError;
  if (!catalogo || catalogo.length === 0) return;

  const { error: docError } = await supabase
    .from('proprietari_pratica_documenti')
    .upsert(
      catalogo.map((c) => ({ pratica_id: praticaId, fase, documento: c.documento })),
      { onConflict: 'pratica_id,documento', ignoreDuplicates: true },
    );
  if (docError) throw docError;
};
