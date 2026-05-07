import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

const PAGE_SIZE = 10;

interface PropertiesResult {
  data: Record<string, unknown>[];
  count: number;
}

export const useProperties = (
  page: number,
  filter: 'active' | 'sold',
  searchQuery: string,
) => {
  return useQuery<PropertiesResult>({
    queryKey: ['properties', page, filter, searchQuery],
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from('immobili')
        .select('*', { count: 'exact' })
        .eq('is_deleted', false);

      if (filter === 'active') {
        query = query.neq('stato', 'Venduto');
      } else {
        query = query.eq('stato', 'Venduto');
      }

      if (searchQuery) {
        const escaped = searchQuery.replace(/[%_\\]/g, '\\$&');
        query = query.or(
          `titolo.ilike.%${escaped}%,citta.ilike.%${escaped}%,indirizzo.ilike.%${escaped}%,locali.ilike.%${escaped}%,descrizione.ilike.%${escaped}%`,
        );
      }

      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      return { data: (data ?? []) as Record<string, unknown>[], count: count ?? 0 };
    },
    staleTime: 30_000,
    placeholderData: prev => prev,
  });
};
