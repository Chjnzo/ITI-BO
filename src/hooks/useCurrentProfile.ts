import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface CurrentProfile {
  id: string;
  nome_completo: string | null;
  ruolo: 'Admin' | 'Agente' | 'Segreteria';
}

// Il ruolo non è disponibile lato client come claim del JWT (vive solo su
// profili_agenti.ruolo, vedi migration 20260827170000_ruoli_admin_enforcement.sql),
// quindi va risolto con una query. Usato sia per mostrare/nascondere la voce
// "Impostazioni" in sidebar sia dalla route guard `adminOnly` in App.tsx.
export const useCurrentProfile = (options?: { enabled?: boolean }) => {
  return useQuery<CurrentProfile | null>({
    queryKey: ['current-profile'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await supabase
        .from('profili_agenti')
        .select('id, nome_completo, ruolo')
        .eq('id', user.id)
        .single();
      if (error) throw error;
      return data as CurrentProfile;
    },
    staleTime: 5 * 60_000,
    enabled: options?.enabled ?? true,
  });
};
