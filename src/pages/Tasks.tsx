"use client";

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';
import { showError } from '@/utils/toast';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Search, Filter, List, LayoutDashboard, Check } from 'lucide-react';
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
  full_name: string | null;
  email: string | null;
}

// ── Constants ────────────────────────────────────────────────────────────────

const STATI: Task['stato'][] = ['Da fare', 'In corso', 'Completata'];

const STATO_CONFIG: Record<Task['stato'], { color: string; badge: string }> = {
  'Da fare':    { color: 'bg-amber-50/50 border-amber-100 text-amber-700',      badge: 'bg-amber-100 text-amber-700 border-amber-200' },
  'In corso':   { color: 'bg-blue-50/50 border-blue-100 text-blue-700',         badge: 'bg-blue-100 text-blue-700 border-blue-200' },
  'Completata': { color: 'bg-emerald-50/50 border-emerald-100 text-emerald-700', badge: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
};

const safeFormat = (date: any, fmt: string): string => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return format(d, fmt);
};

// ── Task Card (Board) ────────────────────────────────────────────────────────

interface TaskCardProps {
  task: Task;
  onCycleStato: (task: Task) => void;
}

const TaskCard = React.memo(({ task, onCycleStato }: TaskCardProps) => {
  const cfg = TIPOLOGIA_CONFIG[task.tipologia];
  const Icon = cfg.icon;
  const statoCfg = STATO_CONFIG[task.stato];
  return (
    <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md hover:border-[#94b0ab]/30 transition-all">
      <div className="flex items-center gap-2 mb-2">
        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', cfg.bg)}>
          <Icon size={14} className={cfg.color} />
        </div>
        <span className="font-bold text-gray-900 text-sm truncate">
          {task.leads?.nome} {task.leads?.cognome}
        </span>
      </div>
      <div className="text-xs text-gray-400 font-medium mb-2">
        {safeFormat(task.data, 'dd/MM/yyyy')}{task.ora ? ` — ${task.ora.slice(0, 5)}` : ''}
      </div>
      {task.nota && (
        <p className="text-xs text-gray-500 leading-relaxed mb-3 line-clamp-2">{task.nota}</p>
      )}
      <button
        type="button"
        onClick={() => onCycleStato(task)}
        className={cn(
          'text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border transition-opacity hover:opacity-80',
          statoCfg.badge
        )}
      >
        {task.stato}
      </button>
    </div>
  );
});
TaskCard.displayName = 'TaskCard';

// ── Main Page ────────────────────────────────────────────────────────────────

const Tasks = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [tipologiaFilter, setTipologiaFilter] = useState('Tutti');
  const [statoFilter, setStatoFilter] = useState('Tutti');
  const [dateFilter, setDateFilter] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [agentFilter, setAgentFilter] = useState('Tutti');
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
    const fetchProfiles = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email');
      if (!error && data && data.length > 0) {
        setAgents(data);
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setAgents([{ id: user.id, full_name: 'Tu', email: user.email ?? null }]);
        }
      }
    };
    fetchProfiles();
  }, []);

  const getAgentInitial = (agente_id: string): string => {
    const agent = agents.find(a => a.id === agente_id);
    if (agent?.full_name) return agent.full_name.substring(0, 2).toUpperCase();
    if (agent?.email) return agent.email.substring(0, 2).toUpperCase();
    return agente_id.substring(0, 2).toUpperCase();
  };

  const getAgentTitle = (agente_id: string): string => {
    const agent = agents.find(a => a.id === agente_id);
    return agent?.full_name ?? agent?.email ?? agente_id;
  };

  const cycleStato = async (task: Task) => {
    const nextStato = STATI[(STATI.indexOf(task.stato) + 1) % STATI.length];
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, stato: nextStato } : t));
    const { error } = await supabase.from('tasks').update({ stato: nextStato }).eq('id', task.id);
    if (error) {
      showError('Errore aggiornamento stato');
      fetchTasks();
    }
  };

  const toggleComplete = async (task: Task) => {
    const newStato: Task['stato'] = task.stato === 'Completata' ? 'Da fare' : 'Completata';
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, stato: newStato } : t));
    const { error } = await supabase.from('tasks').update({ stato: newStato }).eq('id', task.id);
    if (error) {
      showError('Errore aggiornamento stato');
      fetchTasks();
    }
  };

  const filteredTasks = useMemo(() => {
    const filtered = tasks.filter(task => {
      const leadName = `${task.leads?.nome ?? ''} ${task.leads?.cognome ?? ''}`.toLowerCase();
      const matchesSearch = !searchQuery
        || leadName.includes(searchQuery.toLowerCase())
        || (task.nota?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
      const matchesTipologia = tipologiaFilter === 'Tutti' || task.tipologia === tipologiaFilter;
      const matchesStato = statoFilter === 'Tutti' || task.stato === statoFilter;
      const matchesDate = !dateFilter || task.data === dateFilter;
      const matchesAgent = agentFilter === 'Tutti' || task.agente_id === agentFilter;
      return matchesSearch && matchesTipologia && matchesStato && matchesDate && matchesAgent;
    });

    return filtered.sort((a, b) => {
      const aComplete = a.stato === 'Completata';
      const bComplete = b.stato === 'Completata';
      if (aComplete !== bComplete) return aComplete ? 1 : -1;
      return (a.data ?? '').localeCompare(b.data ?? '');
    });
  }, [tasks, searchQuery, tipologiaFilter, statoFilter, dateFilter, agentFilter]);

  const tasksByStato = useMemo(() => {
    const map = new Map<Task['stato'], Task[]>();
    STATI.forEach(s => map.set(s, []));
    for (const task of filteredTasks) {
      map.get(task.stato)?.push(task);
    }
    return map;
  }, [filteredTasks]);

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
          {agents.length > 1 && (
            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger className="h-12 w-[140px] rounded-xl border-gray-100">
                <SelectValue placeholder="Agente" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="Tutti">Tutti</SelectItem>
                {agents.map(a => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.full_name ?? a.email ?? a.id.substring(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* View Tabs */}
      <Tabs defaultValue="lista">
        <TabsList className="bg-white border border-gray-100 p-1.5 rounded-2xl h-14 mb-8 flex justify-start gap-1 w-fit">
          <TabsTrigger
            value="lista"
            className="rounded-xl px-8 h-full data-[state=active]:bg-[#94b0ab] data-[state=active]:text-white font-bold gap-2"
          >
            <List size={18} /> Lista
          </TabsTrigger>
          <TabsTrigger
            value="board"
            className="rounded-xl px-8 h-full data-[state=active]:bg-[#94b0ab] data-[state=active]:text-white font-bold gap-2"
          >
            <LayoutDashboard size={18} /> Board
          </TabsTrigger>
        </TabsList>

        {/* LISTA TAB */}
        <TabsContent value="lista">
          <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden">
            {loading ? (
              <div className="py-20 text-center text-gray-300 animate-pulse font-medium">Caricamento...</div>
            ) : filteredTasks.length === 0 ? (
              <div className="py-20 text-center text-gray-400 text-sm">Nessuna task trovata.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gray-50/50 border-b border-gray-100">
                      {['', 'Tipologia', 'Lead', 'Data e Ora', 'Nota', 'Agente'].map((col, i) => (
                        <th key={i} className="px-8 py-5 text-xs font-bold uppercase tracking-widest text-gray-400 whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredTasks.map(task => {
                      const cfg = TIPOLOGIA_CONFIG[task.tipologia];
                      const Icon = cfg.icon;
                      const isComplete = task.stato === 'Completata';
                      return (
                        <tr key={task.id} className={cn("hover:bg-gray-50/30 transition-colors", isComplete && 'opacity-50')}>
                          <td className="px-8 py-4">
                            <button
                              type="button"
                              onClick={() => toggleComplete(task)}
                              className={cn(
                                'w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all',
                                isComplete
                                  ? 'bg-[#94b0ab] border-[#94b0ab]'
                                  : 'border-gray-300 hover:border-[#94b0ab]'
                              )}
                            >
                              {isComplete && <Check size={12} className="text-white" />}
                            </button>
                          </td>
                          <td className="px-8 py-4">
                            <div className="flex items-center gap-2">
                              <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', cfg.bg)}>
                                <Icon size={14} className={cfg.color} />
                              </div>
                              <span className="text-sm font-semibold text-gray-700">{task.tipologia}</span>
                            </div>
                          </td>
                          <td className="px-8 py-4">
                            <span className="text-sm font-bold text-gray-900">
                              {task.leads?.nome} {task.leads?.cognome}
                            </span>
                          </td>
                          <td className="px-8 py-4 whitespace-nowrap">
                            <span className="text-sm text-gray-600">
                              {safeFormat(task.data, 'dd/MM/yyyy')}
                              {task.ora && <span className="text-gray-400 ml-1">— {task.ora.slice(0, 5)}</span>}
                            </span>
                          </td>
                          <td className="px-8 py-4 max-w-[220px]">
                            <span className={cn("text-sm text-gray-500 truncate block", isComplete && 'line-through')}>
                              {task.nota ? (task.nota.length > 50 ? task.nota.slice(0, 50) + '…' : task.nota) : '—'}
                            </span>
                          </td>
                          <td className="px-8 py-4">
                            <div
                              className="w-7 h-7 rounded-full bg-[#94b0ab] text-white flex items-center justify-center text-[9px] font-black shadow-sm"
                              title={getAgentTitle(task.agente_id)}
                            >
                              {getAgentInitial(task.agente_id)}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* BOARD TAB */}
        <TabsContent value="board">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 min-h-[400px]">
            {STATI.map(stato => {
              const statoCfg = STATO_CONFIG[stato];
              const col = tasksByStato.get(stato) ?? [];
              return (
                <div key={stato} className="flex flex-col h-full">
                  <div className={cn('flex items-center justify-between px-5 py-4 rounded-2xl border mb-4', statoCfg.color)}>
                    <h2 className="font-black uppercase tracking-widest text-xs">{stato}</h2>
                    <span className="bg-white/60 text-xs font-bold px-2 py-0.5 rounded-full">{col.length}</span>
                  </div>
                  <div className="flex-1 bg-gray-50/50 rounded-[2rem] p-4 border border-gray-100 space-y-3 overflow-y-auto">
                    {col.map(task => (
                      <TaskCard key={task.id} task={task} onCycleStato={cycleStato} />
                    ))}
                    {col.length === 0 && (
                      <div className="py-10 text-center text-gray-300 italic text-sm">Nessuna task</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      <TaskModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSaved={() => { setIsModalOpen(false); fetchTasks(); }}
      />
    </AdminLayout>
  );
};

export default Tasks;
