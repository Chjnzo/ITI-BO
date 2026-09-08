import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { showError, showSuccess } from '@/utils/toast';
import type { AlertRegola } from '@/types';

export const ALERT_REGOLE_QUERY_KEY = ['alert-regole'];

// Estratta a parte (invece di inline nel queryFn) così useAlerts.ts può
// condividere la stessa query key + stessa funzione di fetch: le regole
// servono sia qui (gestione Admin) sia lì (motore di calcolo alert per
// chiunque sia loggato), react-query dedupe la richiesta di rete tra i due.
export const fetchAlertRegole = async (): Promise<AlertRegola[]> => {
  const { data, error } = await supabase
    .from('alert_regole')
    .select('*')
    .order('entita_tipo')
    .order('fase');
  if (error) throw error;
  return (data ?? []) as AlertRegola[];
};

// Righe fisse pre-seedate (una per ogni combinazione valida entita_tipo/fase,
// vedi 20260827190000_alert_regole.sql) — sola lettura per tutti gli agenti
// (serve al motore di alert in useAlerts.ts), scrittura Admin-only via
// RLS/trigger (nessun controllo lato client aggiuntivo, stesso pattern di
// useAgentRoles.ts).
export const useAlertRegole = () => {
  const queryClient = useQueryClient();

  const query = useQuery<AlertRegola[]>({
    queryKey: ALERT_REGOLE_QUERY_KEY,
    queryFn: fetchAlertRegole,
    staleTime: 60_000,
  });

  const aggiornaRegola = useMutation({
    mutationFn: async ({
      id,
      giorni_soglia,
      destinatario,
      attiva,
    }: {
      id: string;
      giorni_soglia: number;
      destinatario: AlertRegola['destinatario'];
      attiva: boolean;
    }) => {
      const { error } = await supabase
        .from('alert_regole')
        .update({ giorni_soglia, destinatario, attiva, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess('Regola aggiornata.');
      queryClient.invalidateQueries({ queryKey: ALERT_REGOLE_QUERY_KEY });
    },
    onError: () => showError('Aggiornamento regola non riuscito.'),
  });

  return { ...query, aggiornaRegola: aggiornaRegola.mutate };
};
