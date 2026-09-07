import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface KpiReportData {
  nuoviProprietari: number;
  nuoviAcquirenti: number;
  nuoviCollaboratori: number;
  immobiliAcquisiti: number;
  immobiliVenduti: number;
  valutazioniCompletate: number;
}

// contatti non ha un discriminatore "tipo": il tipo si ricava dall'esistenza
// della riga figlia (proprietari/acquirenti/collaboratori), stesso pattern
// usato altrove nel pivot (es. useProprietariPipeline). `agenteId` filtra
// direttamente su contatti.agente_id, colonna diretta — nessun join extra.
const countNuoviContatti = async (
  tabellaFiglia: 'proprietari' | 'acquirenti' | 'collaboratori',
  from: string,
  to: string,
  agenteId: string | null,
) => {
  let query = supabase
    .from('contatti')
    .select(`id, ${tabellaFiglia}!inner(id)`, { count: 'exact', head: true })
    .gte('created_at', from)
    .lte('created_at', to);
  if (agenteId) query = query.eq('agente_id', agenteId);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
};

// immobili/immobile_pipeline_stato non hanno una colonna agente diretta:
// l'unico collegamento affidabile a un agente passa da proprietari_pratiche
// (immobile_id) -> proprietari -> contatti.agente_id, stesso join già usato in
// useProprietariPipeline.ts. Filtro lato client (non dot-path server-side su
// risorse annidate a due livelli) per coerenza con quel pattern. Nota: copre
// solo gli immobili originati dal flusso pratiche proprietari — un immobile
// creato senza pratica (es. legacy, o manuale) resta non attribuibile e non
// rientra nel conteggio per singolo agente.
const immobiliIdsPerAgente = async (agenteId: string): Promise<string[]> => {
  const { data, error } = await supabase
    .from('proprietari_pratiche')
    .select('immobile_id, proprietari!inner(contatti(agente_id))')
    .not('immobile_id', 'is', null);
  if (error) throw error;
  return ((data ?? []) as unknown as { immobile_id: string; proprietari: { contatti: { agente_id: string | null } | null } | null }[])
    .filter((row) => row.proprietari?.contatti?.agente_id === agenteId)
    .map((row) => row.immobile_id);
};

export const useKpiReport = (from: string, to: string, agenteId: string | null = null) =>
  useQuery<KpiReportData>({
    queryKey: ['kpi-report', from, to, agenteId],
    queryFn: async () => {
      const toEnd = `${to}T23:59:59.999`;

      const immobileIds = agenteId ? await immobiliIdsPerAgente(agenteId) : null;
      // Nessun immobile attribuibile a questo agente: evita `.in('id', [])`,
      // che PostgREST non gestisce come "nessun risultato" ma come filtro vuoto.
      const nessunImmobileAttribuibile = immobileIds !== null && immobileIds.length === 0;

      const immobiliQuery = supabase.from('immobili').select('id', { count: 'exact', head: true })
        .gte('created_at', from).lte('created_at', toEnd);
      if (immobileIds) immobiliQuery.in('id', immobileIds);

      // "Venduto nel periodo" è approssimato dall'ultimo cambio fase
      // registrato (immobile_pipeline_stato non tiene uno storico dei
      // passaggi, solo l'ultimo aggiornamento) — sufficiente per un check
      // costante dell'andamento, non un report contabile.
      const vendutiQuery = supabase.from('immobile_pipeline_stato').select('id', { count: 'exact', head: true })
        .eq('fase', 'Venduto').gte('updated_at', from).lte('updated_at', toEnd);
      if (immobileIds) vendutiQuery.in('immobile_id', immobileIds);

      let valutazioniQuery = supabase.from('valutazioni').select('id', { count: 'exact', head: true })
        .eq('stato', 'Completata').gte('created_at', from).lte('created_at', toEnd);
      if (agenteId) valutazioniQuery = valutazioniQuery.eq('agente_id', agenteId);

      const [nuoviProprietari, nuoviAcquirenti, nuoviCollaboratori, immobiliRes, vendutiRes, valutazioniRes] =
        await Promise.all([
          countNuoviContatti('proprietari', from, toEnd, agenteId),
          countNuoviContatti('acquirenti', from, toEnd, agenteId),
          countNuoviContatti('collaboratori', from, toEnd, agenteId),
          nessunImmobileAttribuibile ? Promise.resolve({ count: 0, error: null }) : immobiliQuery,
          nessunImmobileAttribuibile ? Promise.resolve({ count: 0, error: null }) : vendutiQuery,
          valutazioniQuery,
        ]);

      if (immobiliRes.error) throw immobiliRes.error;
      if (vendutiRes.error) throw vendutiRes.error;
      if (valutazioniRes.error) throw valutazioniRes.error;

      return {
        nuoviProprietari,
        nuoviAcquirenti,
        nuoviCollaboratori,
        immobiliAcquisiti: immobiliRes.count ?? 0,
        immobiliVenduti: vendutiRes.count ?? 0,
        valutazioniCompletate: valutazioniRes.count ?? 0,
      };
    },
    enabled: !!from && !!to,
  });
