"use client";

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';
import { showError, showSuccess } from '@/utils/toast';
import { format, parseISO, isToday, isYesterday, isTomorrow, subDays } from 'date-fns';
import { it } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  Plus, Search, Check, CalendarIcon, User, StickyNote,
  ChevronDown, ChevronRight, Phone,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import TaskModal from '@/components/TaskModal';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { type AgentProfile } from '@/components/agenda/EventFormModal';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Task {
  id: string;
  lead_id: string | null;
  agente_id: string;
  titolo: string | null;
  telefono: string | null;
  nota: string | null;
  data: string;
  ora: string | null;
  stato: 'Da fare' | 'Completata';
  leads?: { id: string; nome: string; cognome: string } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  onOpenLead: (task: Task) => void;
  onUpdateDate: (taskId: string, newDate: string) => void;
  onOpenDetail: (task: Task) => void;
}

const TaskCard = React.memo(({ task, onToggleComplete, onOpenLead, onUpdateDate, onOpenDetail }: TaskCardProps) => {
  const [datePicker, setDatePicker] = useState(false);

  const isComplete = task.stato === 'Completata';
  const leadName = task.leads ? `${task.leads.nome} ${task.leads.cognome}`.trim() : null;

  return (
    <div
      className={cn(
        'flex items-start gap-3 px-5 py-4 border-l-4 shadow-sm hover:shadow-md hover:bg-gray-50/80 transition-all group cursor-pointer',
        isComplete ? 'border-l-emerald-300 bg-slate-50/80' : 'border-l-transparent bg-white',
      )}
      onClick={() => onOpenDetail(task)}
    >
      {/* Checkbox */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleComplete(task); }}
        className={cn(
          'w-6 h-6 mt-0.5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
          isComplete ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 hover:border-[#94b0ab]',
        )}
      >
        {isComplete && <Check size={13} className="text-white" />}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={cn('text-base font-semibold truncate', isComplete ? 'line-through text-gray-400' : 'text-gray-800')}>
          {task.titolo || leadName || 'Task senza titolo'}
        </p>
        <div className="flex items-center gap-2 flex-wrap mt-0.5">
          {leadName && task.titolo && (
            <span className="text-sm text-gray-500 font-medium truncate">{leadName}</span>
          )}
          {task.ora && (
            <span className="text-sm text-gray-400 font-medium">{task.ora.slice(0, 5)}</span>
          )}
          <Popover open={datePicker} onOpenChange={setDatePicker}>
            <PopoverTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1 text-sm text-gray-400 hover:text-[#94b0ab] transition-colors"
              >
                <CalendarIcon size={12} className="shrink-0" />
                {format(parseISO(task.data), 'd MMM', { locale: it })}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 border-none rounded-2xl shadow-xl" align="start">
              <Calendar
                mode="single"
                selected={parseISO(task.data)}
                onSelect={(date) => {
                  if (date) { onUpdateDate(task.id, format(date, 'yyyy-MM-dd')); setDatePicker(false); }
                }}
                initialFocus
                locale={it}
              />
            </PopoverContent>
          </Popover>
        </div>
        {task.telefono && (
          <div className="flex items-center gap-1 mt-1">
            <Phone size={11} className="text-[#94b0ab] shrink-0" />
            <span className="text-sm font-semibold text-[#94b0ab]">{task.telefono}</span>
          </div>
        )}
        {task.nota && !task.telefono && (
          <p className="text-xs text-gray-400 mt-1 truncate">{task.nota}</p>
        )}
      </div>

      {/* Quick actions */}
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {task.lead_id && (
          <button
            type="button"
            title="Apri scheda lead"
            onClick={(e) => { e.stopPropagation(); onOpenLead(task); }}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-[#94b0ab] hover:bg-[#94b0ab]/10 transition-colors"
          >
            <User size={15} />
          </button>
        )}
        {task.nota && (
          <button
            type="button"
            title="Modifica nota"
            onClick={(e) => { e.stopPropagation(); onOpenDetail(task); }}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-[#94b0ab] hover:bg-[#94b0ab]/10 transition-colors"
          >
            <StickyNote size={15} />
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
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [taskDetail, setTaskDetail] = useState<Task | null>(null);
  const [taskDetailNota, setTaskDetailNota] = useState('');
  const [taskDetailTitolo, setTaskDetailTitolo] = useState('');
  const [taskDetailTelefono, setTaskDetailTelefono] = useState('');
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
    const { data, error } = await supabase
      .from('tasks')
      .select('id, titolo, telefono, lead_id, agente_id, nota, data, ora, stato, leads(id, nome, cognome)')
      .or(`stato.eq.Da fare,and(stato.eq.Completata,data.gte.${thirtyDaysAgo})`)
      .order('data', { ascending: true })
      .order('ora', { ascending: true, nullsFirst: true });
    if (error) {
      showError('Errore nel caricamento task');
    } else {
      setTasks((data as any) || []);
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

  const updateTaskDate = async (taskId: string, newDate: string) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, data: newDate } : t));
    const { error } = await supabase.from('tasks').update({ data: newDate }).eq('id', taskId);
    if (error) { showError('Errore aggiornamento data'); fetchTasks(); }
  };

  const openLeadProfile = (task: Task) => {
    if (task.leads?.id) {
      navigate('/leads', { state: { openLeadId: task.leads.id } });
    }
  };

  const openTaskDetail = (task: Task) => {
    setTaskDetail(task);
    setTaskDetailNota(task.nota || '');
    setTaskDetailTitolo(task.titolo || '');
    setTaskDetailTelefono(task.telefono || '');
  };

  const saveTaskDetail = async () => {
    if (!taskDetail) return;
    setTaskDetailSaving(true);
    const { error } = await supabase.from('tasks')
      .update({ nota: taskDetailNota, titolo: taskDetailTitolo || null, telefono: taskDetailTelefono || null })
      .eq('id', taskDetail.id);
    if (error) {
      showError('Errore nel salvataggio');
    } else {
      setTasks(prev => prev.map(t =>
        t.id === taskDetail.id
          ? { ...t, nota: taskDetailNota, titolo: taskDetailTitolo || null, telefono: taskDetailTelefono || null }
          : t
      ));
      showSuccess('Task aggiornata');
      setTaskDetail(null);
    }
    setTaskDetailSaving(false);
  };

  // ── Derived data ─────────────────────────────────────────────────────────────

  // Base: all pending matching search + date filter
  const filteredPending = useMemo(() => tasks.filter(t => {
    if (t.stato === 'Completata') return false;
    const leadName = `${t.leads?.nome ?? ''} ${t.leads?.cognome ?? ''}`.toLowerCase();
    const matchesSearch = !searchQuery
      || leadName.includes(searchQuery.toLowerCase())
      || (t.titolo?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
      || (t.nota?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
    const matchesDate = !dateFilter || t.data === dateFilter;
    return matchesSearch && matchesDate;
  }), [tasks, searchQuery, dateFilter]);

  // Personale: filtered to current user
  const personalPending = useMemo(() =>
    filteredPending.filter(t => t.agente_id === currentUserId),
    [filteredPending, currentUserId],
  );

  const personalByDate = useMemo(() => groupByDate(personalPending), [personalPending]);
  const sortedDates = useMemo(() => [...personalByDate.keys()].sort(), [personalByDate]);

  // Generale: tasks per agent
  const tasksByAgent = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const a of agents) map.set(a.id, []);
    for (const t of filteredPending) {
      if (map.has(t.agente_id)) map.get(t.agente_id)!.push(t);
    }
    return map;
  }, [filteredPending, agents]);

  // Completed tasks (shown only in Personale)
  const completedTasks = useMemo(() => tasks.filter(t => t.stato === 'Completata'), [tasks]);

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
                : `${filteredPending.length} totali · ${agents.length} agenti`}
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

          {/* ── PERSONALE ─────────────────────────────────────────────────── */}
          {viewMode === 'personale' && (
            <div className="absolute inset-0 overflow-y-auto pb-8">
              <div className="max-w-4xl mx-auto w-full space-y-5">
                {loading ? (
                  <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm py-20 text-center text-gray-300 animate-pulse">
                    Caricamento...
                  </div>
                ) : sortedDates.length === 0 ? (
                  <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm py-20 text-center text-gray-300 italic">
                    Nessuna task in programma
                  </div>
                ) : (
                  <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
                    {sortedDates.map((dateStr, idx) => (
                      <div key={dateStr} className={idx > 0 ? 'border-t border-gray-100' : ''}>
                        <div className="flex items-center gap-3 px-5 py-3 bg-gray-50/60">
                          <span className="text-sm font-black uppercase tracking-widest text-gray-600">
                            {formatDateHeader(dateStr)}
                          </span>
                          <span className="text-sm text-gray-400 font-medium">
                            {format(parseISO(dateStr), 'd MMM yyyy', { locale: it })}
                          </span>
                          <div className="flex-1 h-px bg-gray-100" />
                          <span className="text-xs text-gray-300">{personalByDate.get(dateStr)!.length}</span>
                        </div>
                        <div className="divide-y divide-gray-50">
                          {personalByDate.get(dateStr)!.map(task => (
                            <TaskCard
                              key={task.id}
                              task={task}
                              onToggleComplete={toggleComplete}
                              onOpenLead={openLeadProfile}
                              onOpenDetail={openTaskDetail}
                              onUpdateDate={updateTaskDate}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Completed (personal only) */}
                {completedTasks.length > 0 && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setCompletedExpanded(v => !v)}
                      className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-2xl text-sm font-bold text-gray-500 hover:text-gray-700 hover:bg-slate-100 transition-all mb-3 border border-slate-200"
                    >
                      {completedExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      <span>Task completate</span>
                      <span className="bg-slate-200 text-gray-600 text-xs font-bold px-2 py-0.5 rounded-full">
                        {completedTasks.length}
                      </span>
                    </button>
                    {completedExpanded && (
                      <div className="bg-slate-50/50 rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
                        {completedTasks.map(task => (
                          <TaskCard
                            key={task.id}
                            task={task}
                            onToggleComplete={toggleComplete}
                            onOpenLead={openLeadProfile}
                              onOpenDetail={openTaskDetail}
                            onUpdateDate={updateTaskDate}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── GENERALE ──────────────────────────────────────────────────── */}
          {viewMode === 'generale' && (
            <div className="absolute inset-0 flex gap-5 overflow-x-auto pb-4">
              {loading ? (
                <div className="flex-1 flex items-center justify-center text-gray-300 animate-pulse text-sm">
                  Caricamento...
                </div>
              ) : agents.map(agent => {
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
        <DialogContent className="sm:max-w-sm rounded-[1.5rem] border-none shadow-2xl p-0 overflow-hidden gap-0">
          {taskDetail && (() => {
            const leadName = taskDetail.leads ? `${taskDetail.leads.nome} ${taskDetail.leads.cognome}`.trim() : null;
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
                    <p className="text-[11px] font-bold text-gray-600">{format(parseISO(taskDetail.data), 'd MMM', { locale: it })}</p>
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
