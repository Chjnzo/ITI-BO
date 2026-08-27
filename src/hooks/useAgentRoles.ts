import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { showError, showSuccess } from '@/utils/toast';

export interface AgentRoleRow {
  id: string;
  nome_completo: string | null;
  ruolo: 'Admin' | 'Agente' | 'Segreteria';
}

const QUERY_KEY = ['profili-agenti-tutti'];

// Solo per la pagina Impostazioni (Admin-only, vedi App.tsx adminOnly route +
// RLS/trigger enforcement in 20260827170000_ruoli_admin_enforcement.sql): un
// Admin cambia il ruolo di qualunque agente, un Agente/Segreteria non
// arriverebbe nemmeno a questa pagina (route guard) e comunque l'update
// verrebbe rifiutato lato DB.
export const useAgentRoles = () => {
  const queryClient = useQueryClient();

  const query = useQuery<AgentRoleRow[]>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profili_agenti')
        .select('id, nome_completo, ruolo')
        .order('nome_completo');
      if (error) throw error;
      return (data ?? []) as AgentRoleRow[];
    },
    staleTime: 30_000,
  });

  const aggiornaRuolo = useMutation({
    mutationFn: async ({ id, ruolo }: { id: string; ruolo: AgentRoleRow['ruolo'] }) => {
      const { error } = await supabase.from('profili_agenti').update({ ruolo }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess('Ruolo aggiornato.');
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['current-profile'] });
    },
    onError: () => showError('Aggiornamento ruolo non riuscito.'),
  });

  return { ...query, aggiornaRuolo: aggiornaRuolo.mutate };
};
