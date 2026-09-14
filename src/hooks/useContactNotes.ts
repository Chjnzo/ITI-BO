import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { showError } from '@/utils/toast';
import { useCurrentProfile } from './useCurrentProfile';

// Hook condiviso per le note di un contatto. Legge/scrive sempre sulla stessa
// tabella `lead_notes` (nome storico) tramite la colonna `contatto_id`
// aggiunta col pivot. È usato da:
//   - ProprietarioSchedaSheet (tab Note del proprietario)
//   - AcquirentiView (tab Note dell'acquirente)
//   - PraticaDetailSheet (tab Note della pratica → note del proprietario)
//   - PipelineDetailSheet (tab Note dell'immobile → note del proprietario)
// così le note "seguono" il contatto ovunque appaia, senza duplicati né
// finestre in cui spariscono.
//
// L'autore non è più la stringa hardcoded 'Agente': viene salvato il nome
// completo dell'utente loggato (o 'Agente' come fallback se il profilo non è
// ancora caricato), così ogni nota mostra chi l'ha scritta invece di
// un'etichetta generica.

export interface ContactNote {
  id: string;
  testo: string;
  autore: string;
  created_at: string;
}

const notesKey = (contattoId: string | null | undefined) =>
  ['contatto-note', contattoId] as const;

export const useContactNotes = (contattoId: string | null | undefined) => {
  return useQuery<ContactNote[]>({
    queryKey: notesKey(contattoId),
    enabled: !!contattoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_notes')
        .select('id, testo, autore, created_at')
        .eq('contatto_id', contattoId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ContactNote[];
    },
    staleTime: 15_000,
  });
};

export const useAddContactNote = (contattoId: string | null | undefined) => {
  const queryClient = useQueryClient();
  const { data: profile } = useCurrentProfile();
  const autoreFallback = profile?.nome_completo?.trim() || 'Agente';

  return useMutation({
    mutationFn: async (testo: string) => {
      if (!contattoId || !testo.trim()) return;
      const { error } = await supabase.from('lead_notes').insert({
        contatto_id: contattoId,
        testo: testo.trim(),
        autore: autoreFallback,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notesKey(contattoId) });
    },
    onError: () => showError('Impossibile salvare la nota.'),
  });
};
