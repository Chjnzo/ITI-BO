import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { showError } from '@/utils/toast';

// Hook condiviso per l'accesso alle task: centralizza query, select e
// mutation così tutte le viste (pagina Task, Dashboard, scheda proprietario/
// acquirente/collaboratore, scheda pratica proprietario, scheda immobile in
// gestione) leggono/scrivono le stesse righe con lo stesso schema, e una
// mutazione da una vista invalida automaticamente le altre.
//
// L'`origine` del filtro è tenuta nel DB per compat storica ma non è più
// esposta come pill/badge in UI (decisione utente 2026-09-14: le task devono
// "dialogare" tra le finestre invece che essere segmentate).

export interface TaskContattoChild {
  id: string;
  nome: string;
  cognome: string | null;
  telefono: string | null;
}

export interface TaskImmobile {
  id: string;
  titolo: string;
  indirizzo: string;
  citta: string;
}

export interface TaskRow {
  id: string;
  titolo: string | null;
  telefono: string | null;
  nota: string | null;
  data: string;
  ora: string | null;
  stato: 'Da fare' | 'Completata';
  colore: string | null;
  urgente: boolean;
  origine: 'contatti' | 'gestione';
  lead_id: string | null;
  contatto_id: string | null;
  immobile_id: string | null;
  agente_id: string;
  // Embed legacy per task pre-pivot ancora agganciate a lead_id.
  leads?: { id: string; nome: string; cognome: string } | null;
  // Embed 1:1 verso le 3 tabelle figlie di contatti. PostgREST restituisce
  // l'oggetto singolo (non array) quando rileva la relazione 1:1 via PK
  // condivisa, o `null` quando la riga figlio non esiste. Accettiamo entrambe
  // le forme per robustezza.
  contatti?: {
    proprietari: TaskContattoChild | TaskContattoChild[] | null;
    acquirenti: TaskContattoChild | TaskContattoChild[] | null;
    collaboratori: TaskContattoChild | TaskContattoChild[] | null;
  } | null;
  immobili?: TaskImmobile | null;
}

// Select riutilizzato ovunque. Se dovesse cambiare, un solo posto da toccare
// e tutte le viste restano allineate.
export const TASK_SELECT = `
  id, titolo, telefono, lead_id, contatto_id, immobile_id, agente_id, nota,
  data, ora, stato, colore, urgente, origine,
  leads(id, nome, cognome),
  contatti(
    proprietari(id, nome, cognome, telefono),
    acquirenti(id, nome, cognome, telefono),
    collaboratori(id, nome, cognome, telefono)
  ),
  immobili(id, titolo, indirizzo, citta)
`;

export type TaskScope =
  | { kind: 'all' }
  | { kind: 'agente'; agenteId: string }
  | { kind: 'contatto'; contattoId: string }
  | { kind: 'immobile'; immobileId: string };

export const taskQueryKey = (scope: TaskScope) => {
  switch (scope.kind) {
    case 'all': return ['tasks', 'all'] as const;
    case 'agente': return ['tasks', 'agente', scope.agenteId] as const;
    case 'contatto': return ['tasks', 'contatto', scope.contattoId] as const;
    case 'immobile': return ['tasks', 'immobile', scope.immobileId] as const;
  }
};

export interface UseTasksOptions {
  scope: TaskScope;
  /** Se true, esclude le task Completate (usato ad es. in Dashboard/pipeline). */
  onlyPending?: boolean;
  /** Se true, esclude le task soft-deleted (default true). */
  excludeDeleted?: boolean;
  enabled?: boolean;
}

export const useTasks = ({ scope, onlyPending = false, excludeDeleted = true, enabled = true }: UseTasksOptions) => {
  return useQuery<TaskRow[]>({
    queryKey: [...taskQueryKey(scope), { onlyPending, excludeDeleted }],
    enabled,
    queryFn: async () => {
      let query = supabase.from('tasks').select(TASK_SELECT);
      if (excludeDeleted) query = query.eq('is_deleted', false);
      if (onlyPending) query = query.neq('stato', 'Completata');
      if (scope.kind === 'agente') query = query.eq('agente_id', scope.agenteId);
      if (scope.kind === 'contatto') query = query.eq('contatto_id', scope.contattoId);
      if (scope.kind === 'immobile') query = query.eq('immobile_id', scope.immobileId);
      const { data, error } = await query
        .order('data', { ascending: true })
        .order('ora', { ascending: true, nullsFirst: true });
      if (error) throw error;
      return (data as unknown as TaskRow[]) ?? [];
    },
    staleTime: 30_000,
  });
};

// Invalidazione a tappeto della cache task: chiamata dopo ogni mutation
// (create/update/delete/toggle) per allineare tutte le viste — il costo di
// un refetch supplementare è trascurabile rispetto al rischio di mostrare
// dati stantii tra Dashboard/Task/schede.
export const useInvalidateTasks = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['tasks'] });
};

// Mutation di comodo: cambia stato Da fare ↔ Completata.
export const useToggleTaskStato = () => {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: async ({ id, currentStato }: { id: string; currentStato: TaskRow['stato'] }) => {
      const nuovo: TaskRow['stato'] = currentStato === 'Completata' ? 'Da fare' : 'Completata';
      const { error } = await supabase.from('tasks').update({ stato: nuovo }).eq('id', id);
      if (error) throw error;
      return nuovo;
    },
    onSuccess: invalidate,
    onError: () => showError('Aggiornamento task non riuscito.'),
  });
};

// Estrae dal record contatti embed il primo dei 3 figli (proprietari/
// acquirenti/collaboratori) presente: comodo per mostrare nome/telefono in
// UI senza duplicare la logica di priorità in ogni componente.
export type ContattoTipo = 'proprietari' | 'acquirenti' | 'collaboratori';

export interface TaskContactInfo {
  name: string | null;
  phone: string | null;
  tipo: ContattoTipo | 'leads' | null;
  targetId: string | null;
}

const firstOf = <T,>(v: T | T[] | null | undefined): T | null => {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
};

export const getTaskContactInfo = (task: TaskRow): TaskContactInfo => {
  if (task.contatti) {
    const tipi: ContattoTipo[] = ['proprietari', 'acquirenti', 'collaboratori'];
    for (const t of tipi) {
      const row = firstOf(task.contatti[t]);
      if (row) {
        return {
          name: `${row.nome} ${row.cognome ?? ''}`.trim(),
          phone: row.telefono,
          tipo: t,
          targetId: row.id,
        };
      }
    }
  }
  if (task.leads) {
    return {
      name: `${task.leads.nome} ${task.leads.cognome}`.trim(),
      phone: null,
      tipo: 'leads',
      targetId: task.leads.id,
    };
  }
  return { name: null, phone: null, tipo: null, targetId: null };
};
