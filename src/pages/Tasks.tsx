"use client";

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';
import { showError, showSuccess } from '@/utils/toast';
import { format, parseISO, isToday, isYesterday, isTomorrow, subDays, endOfWeek, endOfMonth, startOfDay, isBefore, isAfter, isSameDay } from 'date-fns';
import { it } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  Plus, Search, Check, CalendarIcon, User, StickyNote,
  ChevronDown, ChevronRight, Phone, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import TaskModal from '@/components/TaskModal';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { type AgentProfile } from '@/components/agenda/EventFormModal';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ContattoChild {
  id: string;
  nome: string;
  cognome: string | null;
  telefono: string | null;
}

interface Task {
  id: string;
  lead_id: string | null;
  contatto_id: string | null;
  agente_id: string;
  titolo: string | null;
  telefono: string | null;
  nota: string | null;
  data: string;
  ora: string | null;
  stato: 'Da fare' | 'Completata';
  colore: string | null;
  urgente: boolean;
  origine: 'contatti' | 'gestione';
  leads?: { id: string; nome: string; cognome: string } | null;
  // Embed 1:1 verso proprietari/acquirenti/collaboratori via contatti.id ===
  // tasks.contatto_id: PostgREST li restituisce come array (0 o 1 elemento).
  contatti?: {
    proprietari: ContattoChild[];
    acquirenti: ContattoChild[];
    collaboratori: ContattoChild[];
  } | null;
}

type ContattoTipo = 'proprietari' | 'acquirenti' | 'collaboratori';

// Estrae nome+telefono+tipo dal contatto collegato (nuovo modello) oppure dal
// lead legacy. Priorità al nuovo modello: se task.contatti ha un match in
// proprietari/acquirenti/collaboratori lo usiamo, altrimenti cadiamo su
// task.leads (task pre-pivot ancora agganciate a lead_id).
const getContactInfo = (task: Task): { name: string | null; phone: string | null; tipo: ContattoTipo | 'leads' | null; targetId: string | null } => {
  if (task.contatti) {
    const tipi: ContattoTipo[] = ['proprietari', 'acquirenti', 'collaboratori'];
    for (const t of tipi) {
      const row = task.contatti[t]?.[0];
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

// Buckets calendariali rigidi (no rolling). Non-completed only — le completate
// vanno nel cassetto a parte a prescindere dalla data.
type Bucket = 'scaduto' | 'oggi' | 'settimana' | 'mese' | 'oltre';

const bucketOf = (task: Task, now: Date): Bucket => {
  const d = parseISO(task.data);
  const today = startOfDay(now);
  if (isBefore(d, today)) return 'scaduto';
  if (isSameDay(d, today)) return 'oggi';
  const endWeek = endOfWeek(today, { weekStartsOn: 1 });
  if (!isAfter(d, endWeek)) return 'settimana';
  const endMonth = endOfMonth(today);
  if (!isAfter(d, endMonth)) return 'mese';
  return 'oltre';
};

const ORIGINE_BADGE: Record<'contatti' | 'gestione', { label: string; className: string }> = {
  contatti: { label: 'Contatti', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  gestione: { label: 'Gestione', className: 'bg-violet-50 text-violet-700 border-violet-200' },
};

// Config visiva delle 4 colonne fisse (etichetta + colori bordo/pallino/titolo).
// Rosso = urgenza scaduta, ambra = oggi, teal = questa settimana, gray = mese.
const BUCKET_CONFIG: Record<Bucket, { label: string; dotClass: string; titleClass: string; frameClass: string }> = {
  scaduto:   { label: 'Scaduto',        dotClass: 'bg-red-500',    titleClass: 'text-red-600',    frameClass: 'border-red-200 bg-red-50/30' },
  oggi:      { label: 'In scadenza oggi', dotClass: 'bg-amber-500', titleClass: 'text-amber-600',  frameClass: 'border-amber-200 bg-amber-50/30' },
  settimana: { label: 'Questa settimana', dotClass: 'bg-[#94b0ab]', titleClass: 'text-[#94b0ab]',  frameClass: 'border-[#94b0ab]/40 bg-[#94b0ab]/5' },
  mese:      { label: 'Questo mese',    dotClass: 'bg-gray-400',   titleClass: 'text-gray-500',   frameClass: 'border-gray-200 bg-gray-50/50' },
  oltre:     { label: 'Oltre',          dotClass: 'bg-gray-300',   titleClass: 'text-gray-400',   frameClass: 'border-gray-100 bg-white' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const hexWithOpacity = (hex: string, opacity: number): string => {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return `rgba(148,176,171,${opacity})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${opacity})`;
};

const formatDateHeader = (dateStr: string): string => {
  const d = parseISO(dateStr);
  if (isToday(d)) return 'Oggi';
  if (isTomorrow(d)) return 'Domani';
  if (isYesterday(d)) return 'Ieri';
  return format(d, 'EEEE d MMMM', { locale: it });
};

const groupByDate = (tasks: Task[]): Map<string, Task[]> => {
  const map = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!map.has(t.data)) map.set(t.data, []);
    map.get(t.data)!.push(t);
  }
  return map;
};

// ── TaskCard ──────────────────────────────────────────────────────────────────

interface TaskCardProps {
  task: Task;
  onToggleComplete: (task: Task) => void;
  onToggleUrgente: (task: Task) => void;
  onOpenLead: (task: Task) => void;
  onUpdateDate: (taskId: string, newDate: string) => void;
  onOpenDetail: (task: Task) => void;
}

const TaskCard = React.memo(({ task, onToggleComplete, onToggleUrgente, onOpenLead, onOpenDetail }: TaskCardProps) => {
  const isComplete = task.stato === 'Completata';
  const isUrgent = task.urgente && !isComplete;
  const contact = getContactInfo(task);
  const leadName = contact.name;
  const originBadge = ORIGINE_BADGE[task.origine] ?? ORIGINE_BADGE.contatti;
  const hasContactLink = contact.tipo !== null;

  const borderColor = isComplete ? '#6ee7b7' : isUrgent ? '#ef4444' : (task.colore ?? 'transparent');

  return (
    <div
      className={cn(
        'flex items-center gap-2.5 px-4 py-2 border-l-4 shadow-sm hover:shadow-md hover:bg-gray-50/80 transition-all group cursor-pointer',
        isComplete ? 'bg-slate-50/80' : isUrgent ? 'bg-red-50/70' : 'bg-white',
      )}
      style={{ borderLeftColor: borderColor }}
      onClick={() => onOpenDetail(task)}
    >
      {/* Checkbox */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleComplete(task); }}
        className={cn(
          'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
          isComplete ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 hover:border-[#94b0ab]',
        )}
      >
        {isComplete && <Check size={11} className="text-white" />}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {isUrgent && (
            <span className="flex items-center gap-0.5 text-[10px] font-black uppercase tracking-wide text-red-600 shrink-0">
              <AlertTriangle size={11} /> Urgente
            </span>
          )}
          <p className={cn('text-sm font-semibold truncate', isComplete ? 'line-through text-gray-400' : 'text-gray-800')}>
            {task.titolo || leadName || 'Task senza titolo'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn(
            'text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-md border shrink-0',
            originBadge.className,
          )}>
            {originBadge.label}
          </span>
          {leadName && task.titolo && (
            <span className="text-xs text-gray-500 truncate">{leadName}</span>
          )}
          {task.ora && (
            <span className="text-xs text-gray-400">{task.ora.slice(0, 5)}</span>
          )}
          {(task.telefono || contact.phone) && (
            <span className="text-xs font-semibold text-[#94b0ab]">{task.telefono || contact.phone}</span>
          )}
          {task.nota && (
            <span className="text-xs text-gray-400 truncate max-w-[180px]">{task.nota}</span>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          title={task.urgente ? 'Rimuovi urgenza' : 'Segna come urgente'}
          onClick={(e) => { e.stopPropagation(); onToggleUrgente(task); }}
          className={cn(
            'w-7 h-7 rounded-lg flex items-center justify-center transition-all shrink-0',
            task.urgente
              ? 'text-red-600 bg-red-100 hover:bg-red-200 opacity-100'
              : 'text-gray-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100',
          )}
        >
          <AlertTriangle size={13} />
        </button>
        {hasContactLink && (
          <button
            type="button"
            title="Apri scheda contatto"
            onClick={(e) => { e.stopPropagation(); onOpenLead(task); }}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-[#94b0ab] hover:bg-[#94b0ab]/10 transition-all opacity-0 group-hover:opacity-100 shrink-0"
          >
            <User size={13} />
          </button>
        )}
        {task.nota && (
          <button
            type="button"
            title="Modifica nota"
            onClick={(e) => { e.stopPropagation(); onOpenDetail(task); }}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-[#94b0ab] hover:bg-[#94b0ab]/10 transition-all opacity-0 group-hover:opacity-100 shrink-0"
          >
            <StickyNote size={13} />
          </button>
        )}
      </div>
    </div>
  );
});
TaskCard.displayName = 'TaskCard';

// ── Main Page ─────────────────────────────────────────────────────────────────

const Tasks = () => {
  const navigate = useNavigate();

  // Core data
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // UI state
  const [viewMode, setViewMode] = useState<'personale' | 'generale'>('personale');
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [beyondExpanded, setBeyondExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [origineFilter, setOrigineFilter] = useState<'tutte' | 'contatti' | 'gestione'>('tutte');
  const [hiddenAgents, setHiddenAgents] = useState<Set<string>>(new Set());
  const [taskDetail, setTaskDetail] = useState<Task | null>(null);
  const [taskDetailNota, setTaskDetailNota] = useState('');
  const [taskDetailTitolo, setTaskDetailTitolo] = useState('');
  const [taskDetailTelefono, setTaskDetailTelefono] = useState('');
  const [taskDetailDate, setTaskDetailDate] = useState<Date | undefined>(undefined);
  const [taskDetailSaving, setTaskDetailSaving] = useState(false);

  // Fetch current user + agents once on mount
  useEffect(() => {
    const init = async () => {
      const [{ data: { user } }, { data: agentsData }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('profili_agenti').select('id, nome_completo, colore_calendario'),
      ]);
      if (user) setCurrentUserId(user.id);
      setAgents((agentsData as AgentProfile[]) ?? []);
    };
    init();
  }, []);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');
    // Embed contatti + i 3 figli 1:1 (proprietari/acquirenti/collaboratori):
    // solo uno dei tre popolerà l'array per un dato contatto_id, in base a
    // quale scheda tipo esiste per quell'id. Serve per mostrare nome/telefono
    // sulle task post-pivot che oggi salvano contatto_id (non lead_id).
    const { data, error } = await supabase
      .from('tasks')
      .select(`
        id, titolo, telefono, lead_id, contatto_id, agente_id, nota, data, ora, stato, colore, urgente, origine,
        leads(id, nome, cognome),
        contatti(
          proprietari(id, nome, cognome, telefono),
          acquirenti(id, nome, cognome, telefono),
          collaboratori(id, nome, cognome, telefono)
        )
      `)
      .or(`stato.eq.Da fare,and(stato.eq.Completata,data.gte.${thirtyDaysAgo})`)
      .order('data', { ascending: true })
      .order('ora', { ascending: true, nullsFirst: true });
    if (error) {
      showError('Errore nel caricamento task');
    } else {
      setTasks((data as unknown as Task[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const toggleComplete = async (task: Task) => {
    const newStato: Task['stato'] = task.stato === 'Completata' ? 'Da fare' : 'Completata';
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, stato: newStato } : t));
    const { error } = await supabase.from('tasks').update({ stato: newStato }).eq('id', task.id);
    if (error) { showError('Errore aggiornamento stato'); fetchTasks(); }
  };

  const toggleUrgente = async (task: Task) => {
    const newUrgente = !task.urgente;
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, urgente: newUrgente } : t));
    const { error } = await supabase.from('tasks').update({ urgente: newUrgente }).eq('id', task.id);
    if (error) { showError('Errore aggiornamento urgenza'); fetchTasks(); }
  };

  const updateTaskDate = async (taskId: string, newDate: string) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, data: newDate } : t));
    const { error } = await supabase.from('tasks').update({ data: newDate }).eq('id', taskId);
    if (error) { showError('Errore aggiornamento data'); fetchTasks(); }
  };

  const openLeadProfile = (task: Task) => {
    const info = getContactInfo(task);
    if (!info.targetId || !info.tipo) return;
    if (info.tipo === 'leads') {
      // Legacy lead (pre-pivot): /leads è un redirect a /contatti, seguiamo
      // lo stesso protocollo del deep-link (openLeadId nello state).
      navigate('/contatti', { state: { openLeadId: info.targetId } });
    } else {
      // Post-pivot: apri la tab giusta in Contatti passando il tipo come
      // contattiTab e l'id come openLeadId — è il protocollo che Contatti.tsx
      // usa per riaprire una scheda dalla search globale.
      navigate('/contatti', { state: { contattiTab: info.tipo, openLeadId: info.targetId } });
    }
  };

  const openTaskDetail = (task: Task) => {
    setTaskDetail(task);
    setTaskDetailNota(task.nota || '');
    setTaskDetailTitolo(task.titolo || '');
    setTaskDetailTelefono(task.telefono || '');
    setTaskDetailDate(parseISO(task.data));
  };

  const saveTaskDetail = async () => {
    if (!taskDetail) return;
    setTaskDetailSaving(true);
    const newDate = taskDetailDate ? format(taskDetailDate, 'yyyy-MM-dd') : taskDetail.data;
    const { error } = await supabase.from('tasks')
      .update({ nota: taskDetailNota, titolo: taskDetailTitolo || null, telefono: taskDetailTelefono || null, data: newDate })
      .eq('id', taskDetail.id);
    if (error) {
      showError('Errore nel salvataggio');
    } else {
      setTasks(prev => prev.map(t =>
        t.id === taskDetail.id
          ? { ...t, nota: taskDetailNota, titolo: taskDetailTitolo || null, telefono: taskDetailTelefono || null, data: newDate }
          : t
      ));
      showSuccess('Task aggiornata');
      setTaskDetail(null);
    }
    setTaskDetailSaving(false);
  };

  // ── Derived data ─────────────────────────────────────────────────────────────

  // Base: all pending matching search + date filter + origine filter
  const filteredPending = useMemo(() => tasks.filter(t => {
    if (t.stato === 'Completata') return false;
    if (origineFilter !== 'tutte' && t.origine !== origineFilter) return false;
    const info = getContactInfo(t);
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q
      || (info.name?.toLowerCase().includes(q) ?? false)
      || (t.titolo?.toLowerCase().includes(q) ?? false)
      || (t.nota?.toLowerCase().includes(q) ?? false)
      || (t.telefono?.toLowerCase().includes(q) ?? false)
      || (info.phone?.toLowerCase().includes(q) ?? false);
    const matchesDate = !dateFilter || t.data === dateFilter;
    return matchesSearch && matchesDate;
  }), [tasks, searchQuery, dateFilter, origineFilter]);

  // Personale: filtered to current user
  const personalPending = useMemo(() =>
    filteredPending.filter(t => t.agente_id === currentUserId),
    [filteredPending, currentUserId],
  );

  // Bucketing 4 colonne + "oltre" (cassetto) sulle task Personale non completate.
  // `bucketOf` usa startOfDay(new Date()) → si ricalcola solo quando cambiano
  // le task; per stabilità la data "now" è fissata al render corrente.
  const personalBuckets = useMemo(() => {
    const now = new Date();
    const map: Record<Bucket, Task[]> = { scaduto: [], oggi: [], settimana: [], mese: [], oltre: [] };
    for (const t of personalPending) {
      map[bucketOf(t, now)].push(t);
    }
    return map;
  }, [personalPending]);

  const toggleAgentVisibility = useCallback((agentId: string) => {
    setHiddenAgents(prev => {
      const next = new Set(prev);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
      return next;
    });
  }, []);

  const visibleAgents = useMemo(
    () => agents.filter(a => !hiddenAgents.has(a.id)),
    [agents, hiddenAgents],
  );

  // Generale: tasks per agent
  const tasksByAgent = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const a of agents) map.set(a.id, []);
    for (const t of filteredPending) {
      if (map.has(t.agente_id)) map.get(t.agente_id)!.push(t);
    }
    return map;
  }, [filteredPending, agents]);

  // Completed tasks (shown only in Personale, nel cassetto in fondo).
  // Filtriamo per agente corrente e per origine, come le pending.
  const completedTasks = useMemo(() => tasks.filter(t => {
    if (t.stato !== 'Completata') return false;
    if (t.agente_id !== currentUserId) return false;
    if (origineFilter !== 'tutte' && t.origine !== origineFilter) return false;
    return true;
  }), [tasks, currentUserId, origineFilter]);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <AdminLayout fullHeight>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">

        {/* Header — Agenda style */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 shrink-0">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-gray-900">Task</h1>
            <p className="text-gray-500 mt-1 font-medium">
              {viewMode === 'personale'
                ? `${personalPending.length} in programma`
                : `${filteredPending.length} totali · ${visibleAgents.length} agenti`}
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* View toggle */}
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as typeof viewMode)}>
              <TabsList className="grid w-[240px] grid-cols-2 rounded-full p-1 bg-muted/50 border border-gray-100">
                <TabsTrigger value="personale" className="rounded-full px-4 text-xs font-semibold data-[state=active]:bg-[#94b0ab] data-[state=active]:text-white">
                  Personale
                </TabsTrigger>
                <TabsTrigger value="generale" className="rounded-full px-4 text-xs font-semibold data-[state=active]:bg-[#94b0ab] data-[state=active]:text-white">
                  Generale
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Origine filter (Contatti / Gestione / Tutte) */}
            <Tabs value={origineFilter} onValueChange={(v) => setOrigineFilter(v as typeof origineFilter)}>
              <TabsList className="grid w-[280px] grid-cols-3 rounded-full p-1 bg-muted/50 border border-gray-100">
                <TabsTrigger value="tutte" className="rounded-full px-3 text-xs font-semibold data-[state=active]:bg-gray-800 data-[state=active]:text-white">
                  Tutte
                </TabsTrigger>
                <TabsTrigger value="contatti" className="rounded-full px-3 text-xs font-semibold data-[state=active]:bg-sky-600 data-[state=active]:text-white">
                  Contatti
                </TabsTrigger>
                <TabsTrigger value="gestione" className="rounded-full px-3 text-xs font-semibold data-[state=active]:bg-violet-600 data-[state=active]:text-white">
                  Gestione
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Agent visibility toggles (Generale only) */}
            {viewMode === 'generale' && agents.map(agent => {
              const color = agent.colore_calendario ?? '#94b0ab';
              const isHidden = hiddenAgents.has(agent.id);
              return (
                <button
                  key={agent.id}
                  type="button"
                  title={isHidden ? `Mostra ${agent.nome_completo}` : `Nascondi ${agent.nome_completo}`}
                  onClick={() => toggleAgentVisibility(agent.id)}
                  className="rounded-xl px-3 py-1 text-xs font-bold border transition-all h-9"
                  style={{
                    backgroundColor: isHidden ? '#f3f4f6' : hexWithOpacity(color, 0.12),
                    borderColor: isHidden ? '#e5e7eb' : color,
                    color: isHidden ? '#9ca3af' : color,
                  }}
                >
                  {agent.nome_completo ?? agent.id}
                </button>
              );
            })}

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={15} />
              <Input
                placeholder="Cerca..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-11 pl-9 w-[200px] rounded-xl border-gray-200 bg-white"
              />
            </div>

            {/* Date filter */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'h-11 w-[130px] justify-start text-left font-normal rounded-xl border-gray-200 bg-white hover:bg-gray-50 gap-2',
                    !dateFilter && 'text-muted-foreground',
                  )}
                >
                  <CalendarIcon size={14} className="text-[#94b0ab] shrink-0" />
                  {dateFilter ? format(parseISO(dateFilter), 'd MMM', { locale: it }) : 'Data'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 border-none rounded-2xl shadow-xl" align="start">
                <Calendar
                  mode="single"
                  selected={dateFilter ? parseISO(dateFilter) : undefined}
                  onSelect={(date) => setDateFilter(date ? format(date, 'yyyy-MM-dd') : '')}
                  initialFocus
                  locale={it}
                />
              </PopoverContent>
            </Popover>
            {dateFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDateFilter('')}
                className="text-gray-400 hover:text-gray-600 rounded-xl h-11"
              >
                Reset
              </Button>
            )}

            {/* New task */}
            <Button
              onClick={() => setIsTaskModalOpen(true)}
              className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-2xl px-7 h-11 shadow-lg shadow-[#94b0ab]/20 font-bold transition-all"
            >
              <Plus className="mr-2" size={16} /> Nuova Task
            </Button>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 min-h-0 relative">

          {/* ── PERSONALE (4 colonne verticali per urgenza) ──────────────── */}
          {viewMode === 'personale' && (
            <div className="absolute inset-0 overflow-y-auto pb-10">
              {loading ? (
                <div className="py-20 text-center text-gray-300 animate-pulse">Caricamento...</div>
              ) : (
                <div className="flex flex-col gap-6">
                  {/* 4 colonne rigide: scaduto / oggi / settimana (lun-dom di
                      questa settimana) / mese (fino a fine mese corrente).
                      Task oltre fine mese finiscono nel cassetto "Oltre questo
                      mese" in fondo per non sparire del tutto. */}
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                    {(['scaduto', 'oggi', 'settimana', 'mese'] as Bucket[]).map((bucket) => {
                      const cfg = BUCKET_CONFIG[bucket];
                      const rows = personalBuckets[bucket];
                      return (
                        <div key={bucket} className="flex flex-col min-h-0">
                          <div className="flex items-center gap-2 px-1 mb-2">
                            <span className={cn(
                              'w-2 h-2 rounded-full',
                              cfg.dotClass,
                            )} />
                            <span className={cn(
                              'text-xs font-black uppercase tracking-widest',
                              cfg.titleClass,
                            )}>
                              {cfg.label}
                            </span>
                            <span className="ml-auto text-xs text-gray-300 font-medium tabular-nums">{rows.length}</span>
                          </div>
                          <div className={cn(
                            'rounded-2xl border shadow-sm overflow-hidden flex-1 min-h-[120px]',
                            cfg.frameClass,
                          )}>
                            {rows.length === 0 ? (
                              <div className="p-6 text-center text-xs text-gray-300 italic">—</div>
                            ) : (
                              <div className="divide-y divide-gray-50 bg-white">
                                {rows.map(task => (
                                  <TaskCard
                                    key={task.id}
                                    task={task}
                                    onToggleComplete={toggleComplete}
                                    onToggleUrgente={toggleUrgente}
                                    onOpenLead={openLeadProfile}
                                    onOpenDetail={openTaskDetail}
                                    onUpdateDate={updateTaskDate}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Cassetto: task oltre fine mese corrente. Con bucket rigidi
                      non entrano in nessuna colonna — evitiamo di farle
                      sparire. */}
                  {personalBuckets.oltre.length > 0 && (
                    <div>
                      <button
                        type="button"
                        onClick={() => setBeyondExpanded(v => !v)}
                        className="flex items-center gap-2 px-1 mb-2 text-xs font-bold uppercase tracking-widest text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        {beyondExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        <span>Oltre questo mese</span>
                        <span className="bg-gray-100 text-gray-500 text-[10px] font-bold px-2 py-0.5 rounded-full ml-1">
                          {personalBuckets.oltre.length}
                        </span>
                      </button>
                      {beyondExpanded && (
                        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden divide-y divide-gray-50">
                          {personalBuckets.oltre.map(task => (
                            <TaskCard
                              key={task.id}
                              task={task}
                              onToggleComplete={toggleComplete}
                              onToggleUrgente={toggleUrgente}
                              onOpenLead={openLeadProfile}
                              onOpenDetail={openTaskDetail}
                              onUpdateDate={updateTaskDate}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Cassetto Completate: sempre in fondo, chiuso di default. */}
                  {completedTasks.length > 0 && (
                    <div>
                      <button
                        type="button"
                        onClick={() => setCompletedExpanded(v => !v)}
                        className="flex items-center gap-2 px-1 mb-2 text-xs font-bold uppercase tracking-widest text-gray-300 hover:text-gray-500 transition-colors"
                      >
                        {completedExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        <span>Completate</span>
                        <span className="bg-gray-100 text-gray-400 text-[10px] font-bold px-2 py-0.5 rounded-full ml-1">
                          {completedTasks.length}
                        </span>
                      </button>
                      {completedExpanded && (
                        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden divide-y divide-gray-50">
                          {completedTasks.map(task => (
                            <TaskCard
                              key={task.id}
                              task={task}
                              onToggleComplete={toggleComplete}
                              onToggleUrgente={toggleUrgente}
                              onOpenLead={openLeadProfile}
                              onOpenDetail={openTaskDetail}
                              onUpdateDate={updateTaskDate}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {personalBuckets.scaduto.length + personalBuckets.oggi.length + personalBuckets.settimana.length + personalBuckets.mese.length + personalBuckets.oltre.length + completedTasks.length === 0 && (
                    <div className="py-20 text-center text-gray-300 italic">Nessuna task in programma</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── GENERALE ──────────────────────────────────────────────────── */}
          {viewMode === 'generale' && (
            <div className="absolute inset-0 flex gap-5 overflow-x-auto pb-4">
              {loading ? (
                <div className="flex-1 flex items-center justify-center text-gray-300 animate-pulse text-sm">
                  Caricamento...
                </div>
              ) : visibleAgents.map(agent => {
                const agentTasks = tasksByAgent.get(agent.id) ?? [];
                const color = agent.colore_calendario ?? '#94b0ab';
                const initials = (agent.nome_completo ?? agent.id).substring(0, 2).toUpperCase();
                const byDate = groupByDate(agentTasks);
                const dates = [...byDate.keys()].sort();

                return (
                  <div key={agent.id} className="flex-1 min-w-[350px] flex flex-col gap-3 min-h-0">
                    {/* Column header */}
                    <div className="flex items-center gap-3 px-1 shrink-0">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-white text-xs shrink-0 shadow-sm"
                        style={{ backgroundColor: color }}
                      >
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-gray-900 truncate">
                          {agent.nome_completo ?? agent.id}
                        </p>
                        <p className="text-xs text-gray-400">{agentTasks.length} task</p>
                      </div>
                    </div>

                    {/* Task list */}
                    <div className="flex-1 bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-y-auto min-h-0">
                      {agentTasks.length === 0 ? (
                        <div className="p-6 text-center text-xs text-gray-300 italic">Nessuna task</div>
                      ) : (
                        dates.map(dateStr => (
                          <div key={dateStr}>
                            <div className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-widest border-b border-gray-50 bg-gray-50/50">
                              {formatDateHeader(dateStr)}
                            </div>
                            <div className="divide-y divide-gray-50">
                              {byDate.get(dateStr)!.map(task => (
                                <TaskCard
                                  key={task.id}
                                  task={task}
                                  onToggleComplete={toggleComplete}
                              onToggleUrgente={toggleUrgente}
                                  onOpenLead={openLeadProfile}
                              onOpenDetail={openTaskDetail}
                                  onUpdateDate={updateTaskDate}
                                />
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </div>
      </div>

      <TaskModal
        open={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        onSaved={() => { setIsTaskModalOpen(false); fetchTasks(); }}
      />

      {/* Task Detail Modal */}
      <Dialog open={!!taskDetail} onOpenChange={(open) => { if (!open) setTaskDetail(null); }}>
        <DialogContent className="max-w-xl w-full border-none shadow-2xl p-0 overflow-hidden gap-0">
          {taskDetail && (() => {
            const leadName = getContactInfo(taskDetail).name;
            return (
              <>
                {/* Header */}
                <div className="px-5 py-4 flex items-center gap-3 bg-[#94b0ab]/10 border-b border-[#94b0ab]/15">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#94b0ab] mb-0.5">Task</p>
                    <input
                      value={taskDetailTitolo}
                      onChange={(e) => setTaskDetailTitolo(e.target.value)}
                      placeholder={leadName || 'Titolo task...'}
                      className="w-full bg-transparent text-sm font-bold text-gray-800 placeholder-gray-400 outline-none border-b border-transparent focus:border-[#94b0ab]/40 transition-colors pb-0.5"
                    />
                    {leadName && (
                      <p className="text-[11px] text-gray-500 truncate mt-0.5">{leadName}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="flex items-center gap-1 text-[11px] font-bold text-gray-600 hover:text-[#94b0ab] transition-colors"
                          title="Modifica data"
                        >
                          <CalendarIcon size={11} />
                          {taskDetailDate ? format(taskDetailDate, 'd MMM', { locale: it }) : '—'}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 border-none rounded-none shadow-xl" align="end">
                        <Calendar
                          mode="single"
                          selected={taskDetailDate}
                          onSelect={setTaskDetailDate}
                          initialFocus
                          locale={it}
                        />
                      </PopoverContent>
                    </Popover>
                    {taskDetail.ora && <p className="text-[11px] text-gray-400">{taskDetail.ora.slice(0, 5)}</p>}
                  </div>
                </div>
                {/* Body */}
                <div className="px-5 py-4 space-y-4 bg-white">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Numero di cellulare</Label>
                    <div className="flex items-center gap-2 h-10 px-3 rounded-xl border border-gray-200 bg-slate-50/60 focus-within:border-[#94b0ab] transition-colors">
                      <Phone size={13} className="text-[#94b0ab] shrink-0" />
                      <input
                        type="tel"
                        value={taskDetailTelefono}
                        onChange={(e) => setTaskDetailTelefono(e.target.value)}
                        placeholder="+39 333 1234567"
                        className="flex-1 bg-transparent text-[13px] outline-none text-gray-800 placeholder-gray-400"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Nota</Label>
                    <Textarea
                      value={taskDetailNota}
                      onChange={(e) => setTaskDetailNota(e.target.value)}
                      placeholder="Aggiungi una nota a questa task..."
                      className="rounded-xl border-gray-200 bg-slate-50/60 min-h-[90px] resize-none text-[13px] leading-relaxed"
                    />
                  </div>
                </div>
                <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setTaskDetail(null)} className="rounded-xl h-8 px-4 text-xs font-bold text-gray-500">
                    Annulla
                  </Button>
                  <Button size="sm" onClick={saveTaskDetail} disabled={taskDetailSaving} className="rounded-xl h-8 px-4 text-xs font-bold bg-[#94b0ab] hover:bg-[#7a948f] text-white">
                    {taskDetailSaving ? 'Salvataggio...' : 'Salva'}
                  </Button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default Tasks;
