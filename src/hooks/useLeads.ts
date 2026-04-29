import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

const PAGE_SIZE = 50;

interface LeadsResult {
  data: Record<string, unknown>[];
  count: number;
}

export const useLeads = (page: number) => {
  return useQuery<LeadsResult>({
    queryKey: ['leads', page],
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, count, error } = await supabase
        .from('leads')
        .select(
          `id, nome, cognome, stato, tipo_cliente, stato_venditore, created_at,
           assegnato_a, telefono, email,
           lead_immobili(immobili(titolo))`,
          { count: 'exact' },
        )
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      const sanitized = (data ?? []).map(l => ({
        ...l,
        stato: l.stato === 'nuovo' ? 'Nuovo' : (l.stato ?? 'Nuovo'),
      }));
      return { data: sanitized as Record<string, unknown>[], count: count ?? 0 };
    },
    staleTime: 30_000,
    placeholderData: prev => prev,
  });
};
