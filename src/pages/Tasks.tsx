"use client";

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';
import { showError } from '@/utils/toast';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Search, Filter, Check, CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import TaskModal, { TIPOLOGIA_CONFIG } from '@/components/TaskModal';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';

// ── Types ────────────────────────────────────────────────────────────────────

interface Task {
  id: string;
  lead_id: string;
  agente_id: string;
  tipologia: 'Chiamata' | 'WhatsApp' | 'Appuntamento';
  nota: string | null;
  data: string;
  ora: string | null;
  stato: 'Da fare' | 'Completata';
  leads?: { nome: string; cognome: string };
}

interface AgentProfile {
  id: string;
  nome_completo: string | null;
  colore_calendario?: string | null;
}

// ── Constants ────────────────────────────────────────────────────────────────

const STATO_CONFIG: Record<Task['stato'], { badge: string }> = {
  'Da fare':    { badge: 'bg-amber-100 text-amber-700 border-amber-200' },
  'Completata': { badge: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
};

const safeFormat = (date: any, fmt: string): string => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return format(d, fmt);
};

const getAgentName = (agent: AgentProfile): string =>
  agent.nome_completo ?? agent.id.substring(0, 8);

const getAgentInitials = (agent: AgentProfile): string => {
  const name = agent.nome_completo ?? agent.id;
  return name.substring(0, 2).toUpperCase();
};

// ── Task Row ─────────────────────────────────────────────────────────────────

interface TaskRowProps {
  task: Task;
  onToggleComplete: (task: Task) => void;
}

const TaskRow = React.memo(({ task, onToggleComplete }: TaskRowProps) => {
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
      <span className={cn('text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border shrink-0', STATO_CONFIG[task.stato].badge)}>
        {task.stato}
      </span>
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
}

const AgentColumn = React.memo(({ agent, tasks, loading, onToggleComplete }: AgentColumnProps) => {
  const pending = tasks.filter(t => t.stato !== 'Completata').length;
  return (
    <Card
      className="h-full rounded-[2rem] border-gray-100 shadow-sm flex flex-col overflow-hidden"
    >
      <CardHeader className="px-6 py-5 border-b border-gray-50 flex-row items-center gap-3 space-y-0 shrink-0">
        <div className="w-10 h-10 rounded-2xl bg-[#94b0ab] text-white flex items-center justify-center font-black text-sm shrink-0 shadow-sm shadow-[#94b0ab]/20">
          {getAgentInitials(agent)}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-gray-900 truncate">{getAgentName(agent)}</h3>
          <p className="text-xs text-gray-400">{tasks.length} task</p>
        </div>
        {pending > 0 && (
          <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2.5 py-1 rounded-full shrink-0">
            {pending} da fare
          </span>
        )}
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto scrollbar-column p-3 min-h-0">
        {loading ? (
          <div className="py-12 text-center text-gray-300 animate-pulse text-sm">Caricamento...</div>
        ) : tasks.length === 0 ? (
          <div className="py-12 text-center text-gray-300 text-sm italic">Nessuna task per oggi</div>
        ) : (
          tasks.map(task => (
            <TaskRow key={task.id} task={task} onToggleComplete={onToggleComplete} />
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
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [tipologiaFilter, setTipologiaFilter] = useState('Tutti');
  const [statoFilter, setStatoFilter] = useState('Tutti');
  const [dateFilter, setDateFilter] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

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
      const { data, error } = await supabase.from('profili_agenti').select('id, nome_completo, colore_calendario');
      if (!error && data && data.length > 0) {
        setAgents(data);
      } else if (user) {
        setAgents([{ id: user.id, nome_completo: 'Tu' }]);
      }
    };
    init();
  }, []);

  const toggleComplete = async (task: Task) => {
    const newStato: Task['stato'] = task.stato === 'Completata' ? 'Da fare' : 'Completata';
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, stato: newStato } : t));
    const { error } = await supabase.from('tasks').update({ stato: newStato }).eq('id', task.id);
    if (error) { showError('Errore aggiornamento stato'); fetchTasks(); }
  };

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
      });
  }, [tasks, searchQuery, tipologiaFilter, statoFilter, dateFilter]);

  const sortByTime = (a: Task, b: Task) => {
    const aHasTime = !!a.ora;
    const bHasTime = !!b.ora;
    if (aHasTime !== bHasTime) return aHasTime ? 1 : -1;
    if (aHasTime && bHasTime) return a.ora!.localeCompare(b.ora!);
    return 0;
  };

  const tasksByAgent = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const agent of agents) map.set(agent.id, []);
    for (const task of filteredTasks) {
      if (map.has(task.agente_id)) {
        map.get(task.agente_id)!.push(task);
      }
    }
    for (const [id, list] of map) map.set(id, [...list].sort(sortByTime));
    return map;
  }, [filteredTasks, agents]);

  const visibleAgents = useMemo(() => {
    const filtered = agents.filter(a => a.nome_completo?.toLowerCase() !== 'marco');
    if (!currentUserId) return filtered;
    return [
      ...filtered.filter(a => a.id === currentUserId),
      ...filtered.filter(a => a.id !== currentUserId),
    ];
  }, [agents, currentUserId]);

  return (
    <AdminLayout fullHeight>
      <div className="flex flex-col flex-1 overflow-hidden min-h-0">

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-6 shrink-0">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-gray-900">Task</h1>
            <p className="text-gray-500 mt-1 font-medium">Attività pianificate per i tuoi lead.</p>
          </div>
          <Button
            onClick={() => setIsTaskModalOpen(true)}
            className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-2xl px-8 h-14 shadow-lg shadow-[#94b0ab]/20 font-bold"
          >
            <Plus className="mr-2" size={20} /> Nuova Task
          </Button>
        </div>

        {/* Filter Bar */}
        <div className="bg-white p-4 rounded-[2rem] border border-gray-100 shadow-sm mb-4 flex flex-col md:flex-row gap-4 items-center shrink-0">
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
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "h-12 w-[170px] justify-start text-left font-normal rounded-xl border-gray-100 bg-slate-50/50 hover:bg-gray-100 gap-2",
                    !dateFilter && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon size={14} className="text-[#94b0ab] shrink-0" />
                  {dateFilter ? format(parseISO(dateFilter), 'd MMM yyyy', { locale: it }) : "Filtra data"}
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
                <SelectItem value="Da fare">Da fare</SelectItem>
                <SelectItem value="Completata">Completata</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Agent Grid */}
        <div className="flex-1 overflow-hidden min-h-0">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full">
            {visibleAgents.map(agent => (
              <AgentColumn
                key={agent.id}
                agent={agent}
                tasks={tasksByAgent.get(agent.id) ?? []}
                loading={loading}
                onToggleComplete={toggleComplete}
              />
            ))}
            {agents.length === 0 && loading && (
              <div className="col-span-3 py-20 text-center text-gray-300 animate-pulse">Caricamento...</div>
            )}
          </div>
        </div>

        {/* New Task Modal */}
        <TaskModal
          open={isTaskModalOpen}
          onClose={() => setIsTaskModalOpen(false)}
          onSaved={() => { setIsTaskModalOpen(false); fetchTasks(); }}
        />

      </div>
    </AdminLayout>
  );
};

export default Tasks;
