"use client";

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';
import { showError } from '@/utils/toast';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Search, Filter, Users, User, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import TaskModal, { TIPOLOGIA_CONFIG } from '@/components/TaskModal';

// ── Types ────────────────────────────────────────────────────────────────────

interface Task {
  id: string;
  lead_id: string;
  agente_id: string;
  tipologia: 'Chiamata' | 'WhatsApp' | 'Appuntamento';
  nota: string | null;
  data: string;
  ora: string | null;
  stato: 'Da fare' | 'In corso' | 'Completata';
  leads?: { nome: string; cognome: string };
}

interface AgentProfile {
  id: string;
  nome_completo: string | null;
  email: string | null;
}

type ViewMode = 'generale' | 'personale';

// ── Constants ────────────────────────────────────────────────────────────────

const STATI: Task['stato'][] = ['Da fare', 'In corso', 'Completata'];

const STATO_CONFIG: Record<Task['stato'], { badge: string }> = {
  'Da fare':    { badge: 'bg-amber-100 text-amber-700 border-amber-200' },
  'In corso':   { badge: 'bg-blue-100 text-blue-700 border-blue-200' },
  'Completata': { badge: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
};

const safeFormat = (date: any, fmt: string): string => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return format(d, fmt);
};

const getAgentName = (agent: AgentProfile): string =>
  agent.nome_completo ?? agent.email ?? agent.id.substring(0, 8);

const getAgentInitials = (agent: AgentProfile): string => {
  const name = agent.nome_completo ?? agent.email ?? agent.id;
  return name.substring(0, 2).toUpperCase();
};

// ── Task Row ─────────────────────────────────────────────────────────────────

interface TaskRowProps {
  task: Task;
  onToggleComplete: (task: Task) => void;
  onCycleStato: (task: Task) => void;
}

const TaskRow = React.memo(({ task, onToggleComplete, onCycleStato }: TaskRowProps) => {
  const cfg = TIPOLOGIA_CONFIG[task.tipologia];
  const Icon = cfg.icon;
  const isComplete = task.stato === 'Completata';
  return (
    <div className={cn('flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50/80 transition-colors group', isComplete && 'opacity-50')}>
      <button
        type="button"
        onClick={() => onToggleComplete(task)}
        className={cn(
          'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
          isComplete ? 'bg-[#94b0ab] border-[#94b0ab]' : 'border-gray-300 hover:border-[#94b0ab]'
        )}
      >
        {isComplete && <Check size={10} className="text-white" />}
      </button>
      <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', cfg.bg)}>
        <Icon size={13} className={cfg.color} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm font-bold text-gray-900 truncate', isComplete && 'line-through')}>
          {task.leads?.nome} {task.leads?.cognome}
        </p>
        <p className="text-xs text-gray-400">
          {task.ora ? task.ora.slice(0, 5) : safeFormat(task.data, 'dd/MM')}
          {task.nota && <span className="ml-2 text-gray-400 truncate">{task.nota.length > 40 ? task.nota.slice(0, 40) + '…' : task.nota}</span>}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onCycleStato(task)}
        className={cn(
          'text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border shrink-0 transition-opacity hover:opacity-80',
          STATO_CONFIG[task.stato].badge
        )}
      >
        {task.stato}
      </button>
    </div>
  );
});
TaskRow.displayName = 'TaskRow';

// ── Agent Column Card ─────────────────────────────────────────────────────────

interface AgentColumnProps {
  agent: AgentProfile;
  tasks: Task[];
  loading: boolean;
  onToggleComplete: (task: Task) => void;
  onCycleStato: (task: Task) => void;
}

const AgentColumn = React.memo(({ agent, tasks, loading, onToggleComplete, onCycleStato }: AgentColumnProps) => {
  const pending = tasks.filter(t => t.stato !== 'Completata').length;
  return (
    <Card className="rounded-[2rem] border-gray-100 shadow-sm flex flex-col overflow-hidden">
      <CardHeader className="px-6 py-5 border-b border-gray-50 flex-row items-center gap-3 space-y-0">
        <div className="w-10 h-10 rounded-2xl bg-[#94b0ab] text-white flex items-center justify-center font-black text-sm shrink-0 shadow-sm shadow-[#94b0ab]/20">
          {getAgentInitials(agent)}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-gray-900 truncate">{getAgentName(agent)}</h3>
          <p className="text-xs text-gray-400">{tasks.length} task{tasks.length !== 1 ? '' : ''}</p>
        </div>
        {pending > 0 && (
          <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2.5 py-1 rounded-full shrink-0">
            {pending} da fare
          </span>
        )}
      </CardHeader>
      <CardContent className="p-3 flex-1 space-y-1">
        {loading ? (
          <div className="py-12 text-center text-gray-300 animate-pulse text-sm">Caricamento...</div>
        ) : tasks.length === 0 ? (
          <div className="py-12 text-center text-gray-300 text-sm italic">Nessuna task per oggi</div>
        ) : (
          tasks.map(task => (
            <TaskRow key={task.id} task={task} onToggleComplete={onToggleComplete} onCycleStato={onCycleStato} />
          ))
        )}
      </CardContent>
    </Card>
  );
});
AgentColumn.displayName = 'AgentColumn';

// ── Main Page ────────────────────────────────────────────────────────────────

const Tasks = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('generale');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [tipologiaFilter, setTipologiaFilter] = useState('Tutti');
  const [statoFilter, setStatoFilter] = useState('Tutti');
  const [dateFilter, setDateFilter] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [agents, setAgents] = useState<AgentProfile[]>([]);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('tasks')
      .select('id, lead_id, agente_id, tipologia, nota, data, ora, stato, leads(nome, cognome)')
      .order('data', { ascending: true });
    if (error) {
      showError('Errore nel caricamento task');
    } else {
      setTasks((data as any) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);

      const { data, error } = await supabase.from('profili_agenti').select('id, nome_completo, email');
      if (!error && data && data.length > 0) {
        setAgents(data);
      } else if (user) {
        setAgents([{ id: user.id, nome_completo: 'Tu', email: user.email ?? null }]);
      }
    };
    init();
  }, []);

  const cycleStato = async (task: Task) => {
    const nextStato = STATI[(STATI.indexOf(task.stato) + 1) % STATI.length];
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, stato: nextStato } : t));
    const { error } = await supabase.from('tasks').update({ stato: nextStato }).eq('id', task.id);
    if (error) { showError('Errore aggiornamento stato'); fetchTasks(); }
  };

  const toggleComplete = async (task: Task) => {
    const newStato: Task['stato'] = task.stato === 'Completata' ? 'Da fare' : 'Completata';
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, stato: newStato } : t));
    const { error } = await supabase.from('tasks').update({ stato: newStato }).eq('id', task.id);
    if (error) { showError('Errore aggiornamento stato'); fetchTasks(); }
  };

  // Base filtered tasks (all filters except agent — agent is handled per-view)
  const filteredTasks = useMemo(() => {
    return tasks
      .filter(task => {
        const leadName = `${task.leads?.nome ?? ''} ${task.leads?.cognome ?? ''}`.toLowerCase();
        const matchesSearch = !searchQuery
          || leadName.includes(searchQuery.toLowerCase())
          || (task.nota?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
        const matchesTipologia = tipologiaFilter === 'Tutti' || task.tipologia === tipologiaFilter;
        const matchesStato = statoFilter === 'Tutti' || task.stato === statoFilter;
        const matchesDate = !dateFilter || task.data === dateFilter;
        return matchesSearch && matchesTipologia && matchesStato && matchesDate;
      })
      .sort((a, b) => {
        const aComplete = a.stato === 'Completata';
        const bComplete = b.stato === 'Completata';
        if (aComplete !== bComplete) return aComplete ? 1 : -1;
        return (a.ora ?? '').localeCompare(b.ora ?? '');
      });
  }, [tasks, searchQuery, tipologiaFilter, statoFilter, dateFilter]);

  // Per-agent tasks for Visione Generale
  const tasksByAgent = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const agent of agents) map.set(agent.id, []);
    for (const task of filteredTasks) {
      if (map.has(task.agente_id)) {
        map.get(task.agente_id)!.push(task);
      }
    }
    return map;
  }, [filteredTasks, agents]);

  // Tasks for Visione Personale
  const personalTasks = useMemo(() =>
    filteredTasks.filter(t => t.agente_id === currentUserId),
    [filteredTasks, currentUserId]
  );

  const pendingPersonal = personalTasks.filter(t => t.stato !== 'Completata').length;

  return (
    <AdminLayout>
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900">Task</h1>
          <p className="text-gray-500 mt-1 font-medium">Attività pianificate per i tuoi lead.</p>
        </div>
        <Button
          onClick={() => setIsModalOpen(true)}
          className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-2xl px-8 h-14 shadow-lg shadow-[#94b0ab]/20 font-bold"
        >
          <Plus className="mr-2" size={20} /> Nuova Task
        </Button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-[2rem] border border-gray-100 shadow-sm mb-8 flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
          <Input
            placeholder="Cerca per lead o nota..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-12 pl-11 rounded-xl border-gray-100 bg-slate-50/50"
          />
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
          <Filter size={16} className="text-gray-400 shrink-0" />
          <Input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="h-12 w-[160px] rounded-xl border-gray-100 bg-slate-50/50"
          />
          <Select value={tipologiaFilter} onValueChange={setTipologiaFilter}>
            <SelectTrigger className="h-12 w-[160px] rounded-xl border-gray-100">
              <SelectValue placeholder="Tipologia" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="Tutti">Tutti</SelectItem>
              <SelectItem value="Chiamata">Chiamata</SelectItem>
              <SelectItem value="WhatsApp">WhatsApp</SelectItem>
              <SelectItem value="Appuntamento">Appuntamento</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statoFilter} onValueChange={setStatoFilter}>
            <SelectTrigger className="h-12 w-[150px] rounded-xl border-gray-100">
              <SelectValue placeholder="Stato" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="Tutti">Tutti</SelectItem>
              {STATI.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* View Toggle */}
      <div className="bg-white border border-gray-100 p-1.5 rounded-2xl h-14 mb-8 flex gap-1 w-fit shadow-sm">
        <button
          type="button"
          onClick={() => setViewMode('generale')}
          className={cn(
            'rounded-xl px-8 h-full font-bold text-sm flex items-center gap-2 transition-all',
            viewMode === 'generale'
              ? 'bg-[#94b0ab] text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          )}
        >
          <Users size={17} /> Visione Generale
        </button>
        <button
          type="button"
          onClick={() => setViewMode('personale')}
          className={cn(
            'rounded-xl px-8 h-full font-bold text-sm flex items-center gap-2 transition-all',
            viewMode === 'personale'
              ? 'bg-[#94b0ab] text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          )}
        >
          <User size={17} /> Visione Personale
        </button>
      </div>

      {/* VISIONE GENERALE — 3-column agent grid */}
      {viewMode === 'generale' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {agents
            .filter(a => a.nome_completo?.toLowerCase() !== 'marco')
            .map(agent => (
              <AgentColumn
                key={agent.id}
                agent={agent}
                tasks={tasksByAgent.get(agent.id) ?? []}
                loading={loading}
                onToggleComplete={toggleComplete}
                onCycleStato={cycleStato}
              />
            ))}
          {agents.length === 0 && loading && (
            <div className="col-span-3 py-20 text-center text-gray-300 animate-pulse">Caricamento...</div>
          )}
        </div>
      )}

      {/* VISIONE PERSONALE — single centered card */}
      {viewMode === 'personale' && (
        <div className="max-w-2xl mx-auto">
          <Card className="rounded-[2rem] border-gray-100 shadow-sm overflow-hidden">
            <CardHeader className="px-6 py-5 border-b border-gray-50 flex-row items-center gap-3 space-y-0">
              <div className="w-10 h-10 rounded-2xl bg-[#94b0ab] text-white flex items-center justify-center font-black text-sm shrink-0 shadow-sm shadow-[#94b0ab]/20">
                {currentUserId
                  ? getAgentInitials(agents.find(a => a.id === currentUserId) ?? { id: currentUserId, nome_completo: null, email: null })
                  : '?'
                }
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-gray-900">Le mie task</h3>
                <p className="text-xs text-gray-400">{personalTasks.length} task totali</p>
              </div>
              {pendingPersonal > 0 && (
                <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2.5 py-1 rounded-full shrink-0">
                  {pendingPersonal} da fare
                </span>
              )}
            </CardHeader>
            <CardContent className="p-3">
              {loading ? (
                <div className="py-16 text-center text-gray-300 animate-pulse text-sm">Caricamento...</div>
              ) : personalTasks.length === 0 ? (
                <div className="py-16 text-center text-gray-400 text-sm">Nessuna task trovata per i filtri selezionati.</div>
              ) : (
                <div className="space-y-1">
                  {personalTasks.map(task => (
                    <TaskRow key={task.id} task={task} onToggleComplete={toggleComplete} onCycleStato={cycleStato} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <TaskModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSaved={() => { setIsModalOpen(false); fetchTasks(); }}
      />
    </AdminLayout>
  );
};

export default Tasks;
