"use client";

import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog, DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, X, MapPin, AlignLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { showError } from '@/utils/toast';
import {
  format, startOfWeek, endOfWeek, addDays,
  startOfMonth, endOfMonth, eachDayOfInterval,
  isSameDay, isSameMonth, isToday,
  addWeeks, subWeeks, addMonths, subMonths,
} from 'date-fns';
import { it } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import EventFormModal, {
  type Appointment, type AgentProfile, TIPOLOGIA_COLORS,
} from './EventFormModal';

// ── Constants ─────────────────────────────────────────────────────────────────

const HOUR_HEIGHT = 52; // px per hour
const DAY_START = 8;    // 08:00
const DAY_END = 20;     // 20:00
const TOTAL_HOURS = DAY_END - DAY_START;
const TIMELINE_HEIGHT = TOTAL_HOURS * HOUR_HEIGHT;
const HOURS = Array.from({ length: TOTAL_HOURS }, (_, i) => DAY_START + i);
const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

// ── Helpers ───────────────────────────────────────────────────────────────────

const timeToMinutes = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

const getEventTop = (ora_inizio: string | null): number => {
  if (!ora_inizio) return 0;
  const minutes = timeToMinutes(ora_inizio);
  return Math.max(0, ((minutes - DAY_START * 60) / 60) * HOUR_HEIGHT);
};

const getEventHeight = (ora_inizio: string | null, ora_fine: string | null): number => {
  if (!ora_inizio) return HOUR_HEIGHT;
  const start = timeToMinutes(ora_inizio);
  const end = ora_fine ? timeToMinutes(ora_fine) : start + 60;
  const duration = Math.max(end - start, 30);
  return (duration / 60) * HOUR_HEIGHT;
};

const snapToQuarter = (minutes: number): number => Math.round(minutes / 15) * 15;

const minutesToTimeStr = (totalMinutes: number): string => {
  const clamped = Math.max(DAY_START * 60, Math.min(DAY_END * 60 - 15, totalMinutes));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

// ── EventBlock ────────────────────────────────────────────────────────────────

interface EventBlockProps {
  event: Appointment;
  onClick: (e: React.MouseEvent) => void;
}

const EventBlock = ({ event, onClick }: EventBlockProps) => {
  const colors = TIPOLOGIA_COLORS[event.tipologia] ?? TIPOLOGIA_COLORS['Altro'];
  const top = getEventTop(event.ora_inizio);
  const height = getEventHeight(event.ora_inizio, event.ora_fine);

  return (
    <div
      onClick={onClick}
      className="absolute left-0.5 right-0.5 rounded-lg px-1.5 py-1 overflow-hidden cursor-pointer hover:brightness-95 transition-all select-none border"
      style={{ top, height, backgroundColor: colors.bg, borderColor: colors.border, minHeight: 20 }}
    >
      {/* Time + tipologia */}
      <p className="text-[10px] font-bold leading-tight truncate" style={{ color: colors.text }}>
        {event.ora_inizio?.slice(0, 5)} {event.tipologia}
      </p>

      {/* Lead name */}
      {height > 32 && event.leads && (
        <p className="text-[9px] leading-tight truncate opacity-80 mt-px" style={{ color: colors.text }}>
          {event.leads.nome} {event.leads.cognome}
        </p>
      )}

      {/* Property */}
      {height > 46 && event.immobili?.titolo && (
        <p className="flex items-center gap-0.5 text-[9px] leading-tight truncate opacity-70 mt-px" style={{ color: colors.text }}>
          <MapPin size={7} className="shrink-0" />
          {event.immobili.titolo}
        </p>
      )}

      {/* Notes */}
      {height > 60 && event.note && (
        <p className="flex items-start gap-0.5 text-[9px] leading-tight line-clamp-1 opacity-60 mt-px" style={{ color: colors.text }}>
          <AlignLeft size={7} className="shrink-0 mt-px" />
          {event.note}
        </p>
      )}
    </div>
  );
};

// ── WeekView ──────────────────────────────────────────────────────────────────

interface WeekViewProps {
  days: Date[];
  events: Appointment[];
  onEventClick: (event: Appointment) => void;
  onSlotClick: (date: string, time: string) => void;
}

const WeekView = ({ days, events, onEventClick, onSlotClick }: WeekViewProps) => {
  const eventsForDay = (day: Date) =>
    events.filter(e => isSameDay(new Date(e.data), day));

  const handleColumnClick = (e: React.MouseEvent<HTMLDivElement>, day: Date) => {
    if ((e.target as HTMLElement).closest('[data-event-block]')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top + e.currentTarget.scrollTop;
    const rawMinutes = DAY_START * 60 + (y / HOUR_HEIGHT) * 60;
    const snapped = snapToQuarter(rawMinutes);
    onSlotClick(format(day, 'yyyy-MM-dd'), minutesToTimeStr(snapped));
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden min-h-0">
      {/* Day headers */}
      <div className="flex shrink-0 border-b border-gray-100 pb-3 mb-1">
        <div className="w-12 shrink-0" />
        {days.map(day => (
          <div key={day.toISOString()} className="flex-1 text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
              {format(day, 'EEE', { locale: it })}
            </p>
            <div className={cn(
              'w-7 h-7 rounded-full flex items-center justify-center mx-auto mt-0.5 text-sm font-bold',
              isToday(day) ? 'bg-[#94b0ab] text-white' : 'text-gray-800'
            )}>
              {format(day, 'd')}
            </div>
          </div>
        ))}
      </div>

      {/* Timeline grid */}
      <div className="flex flex-1 overflow-y-auto min-h-0">
        {/* Time labels */}
        <div className="w-12 shrink-0 relative" style={{ height: TIMELINE_HEIGHT }}>
          {HOURS.map(h => (
            <div
              key={h}
              className="absolute right-2 text-[9px] text-gray-400 font-medium -translate-y-1/2"
              style={{ top: (h - DAY_START) * HOUR_HEIGHT }}
            >
              {String(h).padStart(2, '0')}:00
            </div>
          ))}
        </div>

        {/* Day columns */}
        {days.map(day => (
          <div
            key={day.toISOString()}
            className="flex-1 relative border-l border-gray-100 cursor-pointer"
            style={{ height: TIMELINE_HEIGHT }}
            onClick={(e) => handleColumnClick(e, day)}
          >
            {/* Hour gridlines */}
            {HOURS.map(h => (
              <div
                key={h}
                className="absolute left-0 right-0 border-t border-gray-100"
                style={{ top: (h - DAY_START) * HOUR_HEIGHT }}
              />
            ))}
            {/* Half-hour lines */}
            {HOURS.map(h => (
              <div
                key={`${h}-half`}
                className="absolute left-0 right-0 border-t border-gray-50"
                style={{ top: (h - DAY_START) * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
              />
            ))}
            {/* Events */}
            {eventsForDay(day).map(event => (
              <div key={event.id} data-event-block>
                <EventBlock
                  event={event}
                  onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

// ── MonthView ─────────────────────────────────────────────────────────────────

interface MonthViewProps {
  currentDate: Date;
  events: Appointment[];
  onEventClick: (event: Appointment) => void;
  onSlotClick: (date: string, time: string) => void;
}

const MonthView = ({ currentDate, events, onEventClick, onSlotClick }: MonthViewProps) => {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const allDays = eachDayOfInterval({ start: calStart, end: calEnd });

  const eventsForDay = (day: Date) =>
    events.filter(e => isSameDay(new Date(e.data), day));

  return (
    <div className="flex-1 overflow-y-auto min-h-0">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-gray-100 mb-1">
        {DAY_LABELS.map(d => (
          <div key={d} className="text-center py-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {allDays.map(day => {
          const dayEvents = eventsForDay(day);
          const isCurrentMonth = isSameMonth(day, currentDate);
          return (
            <div
              key={day.toISOString()}
              className={cn(
                'border-t border-gray-100 min-h-[90px] p-1.5 cursor-pointer hover:bg-slate-50/50 transition-colors',
                !isCurrentMonth && 'opacity-40'
              )}
              onClick={() => onSlotClick(format(day, 'yyyy-MM-dd'), '09:00')}
            >
              <span className={cn(
                'text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full mb-1',
                isToday(day) ? 'bg-[#94b0ab] text-white' : 'text-gray-700'
              )}>
                {format(day, 'd')}
              </span>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map(event => {
                  const colors = TIPOLOGIA_COLORS[event.tipologia] ?? TIPOLOGIA_COLORS['Altro'];
                  return (
                    <div
                      key={event.id}
                      onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
                      className="rounded px-1 py-0.5 text-[9px] font-bold truncate cursor-pointer hover:brightness-95 border"
                      style={{ backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }}
                    >
                      {event.ora_inizio?.slice(0, 5)} {event.tipologia}
                    </div>
                  );
                })}
                {dayEvents.length > 3 && (
                  <p className="text-[9px] text-gray-400 font-medium pl-1">
                    +{dayEvents.length - 3} altri
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── AgentExpandModal ──────────────────────────────────────────────────────────

interface AgentExpandModalProps {
  open: boolean;
  onClose: () => void;
  onRefresh: () => void;
  agent: AgentProfile | null;
  allAgents: AgentProfile[];
  properties: { id: string; titolo: string }[];
}

const AgentExpandModal = ({
  open, onClose, onRefresh, agent, allAgents, properties,
}: AgentExpandModalProps) => {
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [expandEvents, setExpandEvents] = useState<Appointment[]>([]);
  const [formModal, setFormModal] = useState<{
    open: boolean;
    event?: Appointment;
    defaultDate?: string;
    defaultTime?: string;
  }>({ open: false });

  const fetchExpandEvents = useCallback(async () => {
    if (!agent) return;
    let rangeStart: string;
    let rangeEnd: string;
    if (viewMode === 'week') {
      const ws = startOfWeek(currentDate, { weekStartsOn: 1 });
      const we = endOfWeek(currentDate, { weekStartsOn: 1 });
      rangeStart = format(ws, 'yyyy-MM-dd');
      rangeEnd = format(we, 'yyyy-MM-dd');
    } else {
      rangeStart = format(startOfMonth(currentDate), 'yyyy-MM-dd');
      rangeEnd = format(endOfMonth(currentDate), 'yyyy-MM-dd');
    }
    const { data, error } = await supabase
      .from('appuntamenti')
      .select('*, leads(nome, cognome), immobili(titolo)')
      .eq('agente_id', agent.id)
      .gte('data', rangeStart)
      .lte('data', rangeEnd)
      .order('data')
      .order('ora_inizio');
    if (error) {
      showError('Errore caricamento appuntamenti');
    } else {
      setExpandEvents((data as Appointment[]) || []);
    }
  }, [agent, currentDate, viewMode]);

  useEffect(() => {
    if (open && agent) {
      setCurrentDate(new Date());
      setViewMode('week');
      fetchExpandEvents();
    }
  }, [open, agent]);

  useEffect(() => {
    if (open && agent) fetchExpandEvents();
  }, [currentDate, viewMode, fetchExpandEvents]);

  const periodLabel = viewMode === 'week'
    ? (() => {
        const ws = startOfWeek(currentDate, { weekStartsOn: 1 });
        const we = endOfWeek(currentDate, { weekStartsOn: 1 });
        return `${format(ws, 'd MMM', { locale: it })} – ${format(we, 'd MMM yyyy', { locale: it })}`;
      })()
    : format(currentDate, 'MMMM yyyy', { locale: it });

  const navigatePrev = () => {
    setCurrentDate(prev =>
      viewMode === 'week' ? subWeeks(prev, 1) : subMonths(prev, 1)
    );
  };

  const navigateNext = () => {
    setCurrentDate(prev =>
      viewMode === 'week' ? addWeeks(prev, 1) : addMonths(prev, 1)
    );
  };

  const weekDays = (() => {
    const ws = startOfWeek(currentDate, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  })();

  const agentColor = agent?.colore_calendario ?? '#94b0ab';
  const agentInitials = (agent?.nome_completo ?? '??').substring(0, 2).toUpperCase();

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-w-5xl w-[95vw] h-[90vh] rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden flex flex-col [&>button]:hidden">
          {/* Header */}
          <div className="flex items-center gap-4 px-8 pt-6 pb-4 border-b border-gray-100 shrink-0">
            {/* Agent avatar */}
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center font-black text-white text-sm shrink-0 shadow-sm"
              style={{ backgroundColor: agentColor }}
            >
              {agentInitials}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-gray-900 text-lg truncate">
                {agent?.nome_completo ?? ''}
              </h2>
            </div>

            {/* Navigation */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={navigatePrev}
                className="rounded-xl h-9 w-9 text-gray-500 hover:text-gray-800"
              >
                <ChevronLeft size={16} />
              </Button>
              <span className="text-sm font-semibold text-gray-700 min-w-[160px] text-center capitalize">
                {periodLabel}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={navigateNext}
                className="rounded-xl h-9 w-9 text-gray-500 hover:text-gray-800"
              >
                <ChevronRight size={16} />
              </Button>
            </div>

            {/* View toggle */}
            <div className="flex items-center bg-gray-100 rounded-xl p-1">
              <button
                onClick={() => setViewMode('week')}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
                  viewMode === 'week' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                )}
              >
                Settimana
              </button>
              <button
                onClick={() => setViewMode('month')}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
                  viewMode === 'month' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                )}
              >
                Mese
              </button>
            </div>

            {/* Close */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="rounded-xl h-9 w-9 text-gray-400 hover:text-gray-700 shrink-0"
            >
              <X size={16} />
            </Button>
          </div>

          {/* Calendar body */}
          <div className="flex-1 overflow-hidden min-h-0 px-6 pb-6 pt-4 flex flex-col">
            {viewMode === 'week' ? (
              <WeekView
                days={weekDays}
                events={expandEvents}
                onEventClick={(event) => setFormModal({ open: true, event })}
                onSlotClick={(date, time) => setFormModal({ open: true, defaultDate: date, defaultTime: time })}
              />
            ) : (
              <MonthView
                currentDate={currentDate}
                events={expandEvents}
                onEventClick={(event) => setFormModal({ open: true, event })}
                onSlotClick={(date, time) => setFormModal({ open: true, defaultDate: date, defaultTime: time })}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Nested EventFormModal */}
      <EventFormModal
        open={formModal.open}
        onClose={() => setFormModal({ open: false })}
        onSaved={() => { fetchExpandEvents(); onRefresh(); setFormModal({ open: false }); }}
        event={formModal.event}
        defaultAgentId={agent?.id}
        defaultDate={formModal.defaultDate}
        defaultTimeStart={formModal.defaultTime}
        agents={allAgents}
        properties={properties}
      />
    </>
  );
};

export default AgentExpandModal;
