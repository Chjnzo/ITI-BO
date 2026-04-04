"use client";

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';
import { showError } from '@/utils/toast';
import { format, parseISO, isToday, isYesterday, isTomorrow, subDays } from 'date-fns';
import { it } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Plus, Search, Check, CalendarIcon, User, StickyNote,
  ChevronDown, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import TaskModal, { TIPOLOGIA_CONFIG } from '@/components/TaskModal';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Task {
  id: string;
  lead_id: string | null;
  agente_id: string;
  tipologia: 'Chiamata' | 'WhatsApp' | 'Appuntamento' | null;
  titolo: string | null;
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

// ── TaskCard ──────────────────────────────────────────────────────────────────

interface TaskCardProps {
  task: Task;
  onToggleComplete: (task: Task) => void;
  onOpenLead: (task: Task) => void;
  onUpdateDate: (taskId: string, newDate: string) => void;
}

const TaskCard = React.memo(({ task, onToggleComplete, onOpenLead, onUpdateDate }: TaskCardProps) => {
  const [noteExpanded, setNoteExpanded] = useState(false);
  const [datePicker, setDatePicker] = useState(false);

  const isComplete = task.stato === 'Completata';
  const cfg = task.tipologia ? TIPOLOGIA_CONFIG[task.tipologia] : null;
  const Icon = cfg?.icon;

  const leadName = task.leads
    ? `${task.leads.nome} ${task.leads.cognome}`.trim()
    : null;

  return (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-3 border-l-4 hover:bg-gray-50/80 transition-colors group',
        isComplete ? 'border-l-red-400' : 'border-l-transparent',
      )}
    >
      {/* Checkbox */}
      <button
        type="button"
        onClick={() => onToggleComplete(task)}
        className={cn(
          'w-5 h-5 mt-0.5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
          isComplete ? 'bg-[#94b0ab] border-[#94b0ab]' : 'border-gray-300 hover:border-[#94b0ab]',
        )}
      >
        {isComplete && <Check size={10} className="text-white" />}
      </button>

      {/* Tipologia icon (for existing tasks that have tipologia) */}
      {Icon && cfg && (
        <div className={cn('w-7 h-7 mt-0.5 rounded-lg flex items-center justify-center shrink-0', cfg.bg)}>
          <Icon size={13} className={cfg.color} />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            'text-sm font-bold truncate cursor-pointer',
            isComplete ? 'line-through text-gray-400' : 'text-gray-900',
          )}
          onClick={() => task.lead_id && onOpenLead(task)}
        >
          {task.titolo || leadName || 'Task senza titolo'}
        </p>

        <div className="flex items-center gap-2 flex-wrap mt-0.5">
          {leadName && task.titolo && (
            <span className="text-xs text-gray-400 truncate">{leadName}</span>
          )}
          {task.ora && (
            <span className="text-xs text-gray-300">{task.ora.slice(0, 5)}</span>
          )}
          {/* Date chip — click to change */}
          <Popover open={datePicker} onOpenChange={setDatePicker}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="text-xs text-gray-300 hover:text-[#94b0ab] transition-colors"
              >
                {format(parseISO(task.data), 'd MMM', { locale: it })}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 border-none rounded-2xl shadow-xl" align="start">
              <Calendar
                mode="single"
                selected={parseISO(task.data)}
                onSelect={(date) => {
                  if (date) {
                    onUpdateDate(task.id, format(date, 'yyyy-MM-dd'));
                    setDatePicker(false);
                  }
                }}
                initialFocus
                locale={it}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Expanded note */}
        {noteExpanded && task.nota && (
          <p className="text-xs text-gray-500 mt-1.5 leading-relaxed bg-gray-50 rounded-lg px-3 py-2">
            {task.nota}
          </p>
        )}
      </div>

      {/* Quick actions */}
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {task.lead_id && (
          <button
            type="button"
            title="Apri scheda lead"
            onClick={() => onOpenLead(task)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-[#94b0ab] hover:bg-[#94b0ab]/10 transition-colors"
          >
            <User size={13} />
          </button>
        )}
        {task.nota && (
          <button
            type="button"
            title="Mostra nota"
            onClick={() => setNoteExpanded(v => !v)}
            className={cn(
              'w-7 h-7 rounded-lg flex items-center justify-center transition-colors',
              noteExpanded
                ? 'text-[#94b0ab] bg-[#94b0ab]/10'
                : 'text-gray-400 hover:text-[#94b0ab] hover:bg-[#94b0ab]/10',
            )}
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
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');
    const { data, error } = await supabase
      .from('tasks')
      .select('id, titolo, lead_id, agente_id, tipologia, nota, data, ora, stato, leads(id, nome, cognome)')
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

  const pendingTasks = useMemo(() => tasks.filter(t => {
    if (t.stato === 'Completata') return false;
    const leadName = `${t.leads?.nome ?? ''} ${t.leads?.cognome ?? ''}`.toLowerCase();
    const matchesSearch = !searchQuery
      || leadName.includes(searchQuery.toLowerCase())
      || (t.titolo?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
      || (t.nota?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
    const matchesDate = !dateFilter || t.data === dateFilter;
    return matchesSearch && matchesDate;
  }), [tasks, searchQuery, dateFilter]);

  const completedTasks = useMemo(() => tasks.filter(t => t.stato === 'Completata'), [tasks]);

  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of pendingTasks) {
      if (!map.has(task.data)) map.set(task.data, []);
      map.get(task.data)!.push(task);
    }
    return map;
  }, [pendingTasks]);

  const sortedDates = useMemo(() => [...tasksByDate.keys()].sort(), [tasksByDate]);

  return (
    <AdminLayout>
      <div className="flex flex-col min-h-0 max-w-3xl mx-auto w-full">

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-6">
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
        <div className="bg-white p-4 rounded-[2rem] border border-gray-100 shadow-sm mb-6 flex gap-3 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
            <Input
              placeholder="Cerca per titolo, lead o nota..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-12 pl-11 rounded-xl border-gray-100 bg-slate-50/50"
            />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'h-12 w-[150px] justify-start text-left font-normal rounded-xl border-gray-100 bg-slate-50/50 hover:bg-gray-100 gap-2',
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
              className="text-gray-400 hover:text-gray-600 rounded-xl h-12"
            >
              Reset
            </Button>
          )}
        </div>

        {/* Date-grouped task list */}
        <div className="space-y-6 pb-8">
          {loading ? (
            <div className="py-20 text-center text-gray-300 animate-pulse">Caricamento...</div>
          ) : sortedDates.length === 0 && pendingTasks.length === 0 ? (
            <div className="py-20 text-center text-gray-300 italic">Nessuna task in programma</div>
          ) : (
            sortedDates.map(dateStr => (
              <div key={dateStr}>
                {/* Date separator */}
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-xs font-black uppercase tracking-widest text-gray-500">
                    {formatDateHeader(dateStr)}
                  </span>
                  <span className="text-xs text-gray-300 font-medium">
                    {format(parseISO(dateStr), 'd MMM yyyy', { locale: it })}
                  </span>
                  <div className="flex-1 h-px bg-gray-100" />
                  <span className="text-xs text-gray-300">{tasksByDate.get(dateStr)!.length}</span>
                </div>
                <div className="bg-white rounded-[1.5rem] border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-50">
                  {tasksByDate.get(dateStr)!.map(task => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onToggleComplete={toggleComplete}
                      onOpenLead={openLeadProfile}
                      onUpdateDate={updateTaskDate}
                    />
                  ))}
                </div>
              </div>
            ))
          )}

          {/* Collapsible completed section */}
          {completedTasks.length > 0 && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setCompletedExpanded(v => !v)}
                className="flex items-center gap-2 text-sm font-bold text-gray-400 hover:text-gray-600 transition-colors mb-3"
              >
                {completedExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                Task completate ({completedTasks.length})
              </button>

              {completedExpanded && (
                <div className="bg-white rounded-[1.5rem] border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-50">
                  {completedTasks.map(task => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onToggleComplete={toggleComplete}
                      onOpenLead={openLeadProfile}
                      onUpdateDate={updateTaskDate}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

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
