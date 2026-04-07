"use client";

import React, { useEffect, useState, useCallback, useMemo, memo } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';
import { showError } from '@/utils/toast';
import { format, isToday, parseISO, startOfWeek, endOfWeek, addDays, subDays, addWeeks, subWeeks } from 'date-fns';
import { it } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Plus, Maximize2, ChevronLeft, ChevronRight, CalendarIcon, MapPin, AlignLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import EventFormModal, {
  type Appointment, type AgentProfile, TIPOLOGIA_COLORS,
} from '@/components/agenda/EventFormModal';
import AgentExpandModal from '@/components/agenda/AgentExpandModal';
import WeeklyPlanningView from '@/components/agenda/WeeklyPlanningView';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

// ── Timeline constants ────────────────────────────────────────────────────────

const HOUR_HEIGHT = 60; // px per hour
const DAY_START = 8;
const DAY_END = 20;
const TOTAL_HOURS = DAY_END - DAY_START;
const TIMELINE_HEIGHT = TOTAL_HOURS * HOUR_HEIGHT;
const HOURS = Array.from({ length: TOTAL_HOURS }, (_, i) => DAY_START + i);

// ── Helpers ───────────────────────────────────────────────────────────────────

const timeToMinutes = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

const getEventTop = (ora_inizio: string | null): number => {
  if (!ora_inizio) return 0;
  return Math.max(0, ((timeToMinutes(ora_inizio) - DAY_START * 60) / 60) * HOUR_HEIGHT);
};

const getEventHeight = (ora_inizio: string | null, ora_fine: string | null): number => {
  if (!ora_inizio) return HOUR_HEIGHT;
  const start = timeToMinutes(ora_inizio);
  const end = ora_fine ? timeToMinutes(ora_fine) : start + 60;
  return Math.max((Math.max(end - start, 30) / 60) * HOUR_HEIGHT, 28);
};

const snapToQuarter = (minutes: number): number => Math.round(minutes / 15) * 15;

const minutesToTimeStr = (totalMinutes: number): string => {
  const clamped = Math.max(DAY_START * 60, Math.min(DAY_END * 60 - 15, totalMinutes));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const getAgentInitials = (agent: AgentProfile): string =>
  (agent.nome_completo ?? agent.id).substring(0, 2).toUpperCase();

// ── AgentDayColumn ────────────────────────────────────────────────────────────

interface AgentDayColumnProps {
  agent: AgentProfile;
  events: Appointment[];
  selectedDate: string;
  loading: boolean;
  onEventClick: (event: Appointment) => void;
  onSlotClick: (agentId: string, time: string) => void;
  onExpand: (agent: AgentProfile) => void;
}

const AgentDayColumn = memo(({
  agent, events, selectedDate, loading, onEventClick, onSlotClick, onExpand,
}: AgentDayColumnProps) => {
  const agentColor = agent.colore_calendario ?? '#94b0ab';

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-event-block]')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top + e.currentTarget.scrollTop;
    const rawMinutes = DAY_START * 60 + (y / HOUR_HEIGHT) * 60;
    const snapped = snapToQuarter(rawMinutes);
    onSlotClick(agent.id, minutesToTimeStr(snapped));
  };

  const parsedDate = parseISO(selectedDate);
  const isSelectedToday = isToday(parsedDate);
  const dateLabel = format(parsedDate, 'EEE d MMM', { locale: it });

  return (
    <Card className="flex-1 min-h-0 rounded-[2rem] border-gray-100 shadow-sm flex flex-col overflow-hidden">
      {/* Column header */}
      <CardHeader className="px-5 py-4 border-b border-gray-50 flex-row items-center gap-3 space-y-0 shrink-0">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-white text-xs shrink-0 shadow-sm"
          style={{ backgroundColor: agentColor }}
        >
          {getAgentInitials(agent)}
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn('text-xs capitalize', isSelectedToday ? 'text-[#94b0ab] font-semibold' : 'text-gray-400')}>
            {dateLabel} · {events.length} eventi
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onExpand(agent)}
          className="h-8 w-8 rounded-xl text-gray-400 hover:text-gray-700 shrink-0"
          title="Espandi calendario"
        >
          <Maximize2 size={13} />
        </Button>
      </CardHeader>

      {/* Timeline body */}
      <CardContent className="flex-1 overflow-y-auto p-0 min-h-0 scrollbar-column">
        {loading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="pt-6">
          <div
            className="relative cursor-pointer"
            style={{ height: TIMELINE_HEIGHT }}
            onClick={handleTimelineClick}
          >
            {/* Hour lines + labels */}
            {HOURS.map(h => (
              <React.Fragment key={h}>
                <div
                  className="absolute left-0 right-0 border-t border-gray-100 flex items-start"
                  style={{ top: (h - DAY_START) * HOUR_HEIGHT }}
                >
                  <span className="text-[9px] text-gray-300 font-medium pl-2 pt-0.5 leading-none select-none">
                    {String(h).padStart(2, '0')}:00
                  </span>
                </div>
                {/* Half-hour line */}
                <div
                  className="absolute left-8 right-0 border-t border-gray-50"
                  style={{ top: (h - DAY_START) * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
                />
              </React.Fragment>
            ))}

            {/* Event blocks */}
            {events.map(event => {
              const colors = TIPOLOGIA_COLORS[event.tipologia] ?? TIPOLOGIA_COLORS['Altro'];
              const top = getEventTop(event.ora_inizio);
              const height = getEventHeight(event.ora_inizio, event.ora_fine);
              return (
                <div
                  key={event.id}
                  data-event-block
                  onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
                  className="absolute left-14 right-2 rounded-xl px-2 py-1.5 overflow-hidden cursor-pointer hover:brightness-95 transition-all border"
                  style={{
                    top,
                    height,
                    backgroundColor: colors.bg,
                    borderColor: colors.border,
                    minHeight: 28,
                  }}
                >
                  {/* Agent initials badge */}
                  <span
                    className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-black text-white shrink-0"
                    style={{ backgroundColor: agentColor }}
                  >
                    {getAgentInitials(agent)}
                  </span>

                  {/* Time + tipologia */}
                  <p
                    className="text-[10px] font-bold leading-tight truncate"
                    style={{ color: colors.text }}
                  >
                    {event.ora_inizio?.slice(0, 5)}{event.ora_inizio ? ' · ' : ''}{event.tipologia}
                  </p>

                  {/* Lead name */}
                  {height > 38 && event.leads && (
                    <p className="text-[9px] leading-tight truncate opacity-75 mt-0.5" style={{ color: colors.text }}>
                      {event.leads.nome} {event.leads.cognome}
                    </p>
                  )}

                  {/* Property */}
                  {height > 52 && event.immobili?.titolo && (
                    <p className="flex items-center gap-0.5 text-[9px] leading-tight truncate opacity-70 mt-0.5" style={{ color: colors.text }}>
                      <MapPin size={8} className="shrink-0" />
                      {event.immobili.titolo}
                    </p>
                  )}

                  {/* Notes */}
                  {height > 68 && event.note && (
                    <p className="flex items-start gap-0.5 text-[9px] leading-tight line-clamp-2 opacity-60 mt-0.5" style={{ color: colors.text }}>
                      <AlignLeft size={8} className="shrink-0 mt-px" />
                      {event.note}
                    </p>
                  )}
                </div>
              );
            })}

            {/* Empty state */}
            {events.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <p className="text-xs text-gray-300 italic">Nessun appuntamento</p>
              </div>
            )}
          </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
});
AgentDayColumn.displayName = 'AgentDayColumn';

// ── Main Page ─────────────────────────────────────────────────────────────────

interface FormModalState {
  open: boolean;
  event?: Appointment;
  defaultAgentId?: string;
  defaultDate?: string;
  defaultTimeStart?: string;
}

interface ExpandState {
  open: boolean;
  agent: AgentProfile | null;
}

const Agenda = () => {
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [viewMode, setViewMode] = useState<'giornaliera' | 'planning'>('giornaliera');
  const [events, setEvents] = useState<Appointment[]>([]);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [properties, setProperties] = useState<{ id: string; titolo: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [formModal, setFormModal] = useState<FormModalState>({ open: false });
  const [expandState, setExpandState] = useState<ExpandState>({ open: false, agent: null });

  // Fetch agents + properties once on mount
  useEffect(() => {
    const init = async () => {
      const [{ data: { user } }, { data: agentsData }, { data: propsData }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('profili_agenti').select('id, nome_completo, colore_calendario'),
        supabase.from('immobili').select('id, titolo').neq('stato', 'Venduto').order('titolo'),
      ]);
      if (user) setCurrentUserId(user.id);
      setAgents((agentsData as AgentProfile[]) || []);
      setProperties(propsData || []);
    };
    init();
  }, []);

  // Fetch events — single day or full week depending on viewMode
  const fetchEvents = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('appuntamenti')
      .select('*, leads(nome, cognome), immobili(titolo)')
      .order('ora_inizio');

    if (viewMode === 'giornaliera') {
      query = query.eq('data', selectedDate);
    } else {
      const monday = format(startOfWeek(parseISO(selectedDate), { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const sunday = format(endOfWeek(parseISO(selectedDate), { weekStartsOn: 1 }), 'yyyy-MM-dd');
      query = query.gte('data', monday).lte('data', sunday);
    }

    const { data, error } = await query;
    if (error) {
      showError('Errore caricamento appuntamenti');
    } else {
      setEvents((data as Appointment[]) || []);
    }
    setLoading(false);
  }, [selectedDate, viewMode]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // Agents visible in the board (exclude Marco, current user first)
  const visibleAgents = useMemo(() => {
    const filtered = agents.filter(a => a.nome_completo?.toLowerCase() !== 'marco');
    if (!currentUserId) return filtered;
    return [
      ...filtered.filter(a => a.id === currentUserId),
      ...filtered.filter(a => a.id !== currentUserId),
    ];
  }, [agents, currentUserId]);

  // Events grouped by agent
  const eventsByAgent = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of visibleAgents) map.set(a.id, []);
    for (const e of events) {
      if (map.has(e.agente_id)) map.get(e.agente_id)!.push(e);
    }
    return map;
  }, [events, visibleAgents]);

  const openNewEvent = () =>
    setFormModal({ open: true, defaultDate: selectedDate });

  const openEventEdit = (event: Appointment) =>
    setFormModal({ open: true, event });

  const openSlotCreate = (agentId: string, time: string) =>
    setFormModal({ open: true, defaultAgentId: agentId, defaultDate: selectedDate, defaultTimeStart: time });

  const openDateSlotCreate = (date: string, time: string) =>
    setFormModal({ open: true, defaultDate: date, defaultTimeStart: time });

  const openExpand = (agent: AgentProfile) =>
    setExpandState({ open: true, agent });

  const parsedDate = parseISO(selectedDate);
  const isSelectedToday = isToday(parsedDate);
  const headerDateLabel = format(parsedDate, "EEEE d MMMM yyyy", { locale: it });

  return (
    <AdminLayout fullHeight>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 shrink-0">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-gray-900">Agenda</h1>
            <p className="text-gray-500 mt-1 font-medium capitalize">
              {isSelectedToday ? (
                <span>
                  <span className="text-[#94b0ab] font-bold">Oggi</span>
                  {' · '}{headerDateLabel}
                </span>
              ) : headerDateLabel}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* View mode toggle */}
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'giornaliera' | 'planning')} className="w-auto">
              <TabsList className="grid w-[220px] grid-cols-2 rounded-full p-1 bg-muted/50 border border-gray-100">
                <TabsTrigger value="giornaliera" className="rounded-full px-5 text-xs font-semibold data-[state=active]:bg-[#94b0ab] data-[state=active]:text-white">
                  Giorno
                </TabsTrigger>
                <TabsTrigger value="planning" className="rounded-full px-5 text-xs font-semibold data-[state=active]:bg-[#94b0ab] data-[state=active]:text-white">
                  Settimana
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Nav arrows */}
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 rounded-xl border-gray-200"
              onClick={() => setSelectedDate(format(
                viewMode === 'giornaliera'
                  ? subDays(parseISO(selectedDate), 1)
                  : subWeeks(parseISO(selectedDate), 1),
                'yyyy-MM-dd',
              ))}
            >
              <ChevronLeft size={16} />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 rounded-xl border-gray-200"
              onClick={() => setSelectedDate(format(
                viewMode === 'giornaliera'
                  ? addDays(parseISO(selectedDate), 1)
                  : addWeeks(parseISO(selectedDate), 1),
                'yyyy-MM-dd',
              ))}
            >
              <ChevronRight size={16} />
            </Button>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="h-11 w-[190px] justify-start text-left font-medium rounded-xl border-gray-200 bg-white hover:bg-gray-50 shadow-sm gap-2"
                >
                  <CalendarIcon size={15} className="text-[#94b0ab] shrink-0" />
                  {format(parseISO(selectedDate), 'd MMM yyyy', { locale: it })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 border-none rounded-2xl shadow-xl" align="end">
                <Calendar
                  mode="single"
                  selected={parseISO(selectedDate)}
                  onSelect={(date) => date && setSelectedDate(format(date, 'yyyy-MM-dd'))}
                  initialFocus
                  locale={it}
                />
              </PopoverContent>
            </Popover>
            <Button
              onClick={openNewEvent}
              className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-2xl px-7 h-11 shadow-lg shadow-[#94b0ab]/20 font-bold transition-all"
            >
              <Plus className="mr-2" size={16} /> Nuovo
            </Button>
          </div>
        </div>

        {/* Agent grid / Weekly planning — relative container so absolute fill works */}
        <div className="flex-1 min-h-0 relative">
          {viewMode === 'giornaliera' ? (
            <div className="absolute inset-0 flex gap-5 overflow-x-auto pb-4 snap-x">
              {visibleAgents.map(agent => (
                <div key={agent.id} className="min-w-[320px] flex-1 min-h-0 snap-center flex flex-col">
                  <AgentDayColumn
                    agent={agent}
                    events={eventsByAgent.get(agent.id) ?? []}
                    selectedDate={selectedDate}
                    loading={loading}
                    onEventClick={openEventEdit}
                    onSlotClick={openSlotCreate}
                    onExpand={openExpand}
                  />
                </div>
              ))}
              {visibleAgents.length === 0 && loading && (
                <div className="flex-1 flex items-center justify-center text-gray-300 animate-pulse text-sm">
                  Caricamento...
                </div>
              )}
            </div>
          ) : (
            <div className="absolute inset-0">
              <WeeklyPlanningView
                events={events}
                agents={agents}
                visibleAgents={visibleAgents}
                selectedDate={selectedDate}
                loading={loading}
                onEventClick={openEventEdit}
                onSlotClick={openDateSlotCreate}
              />
            </div>
          )}
        </div>

      </div>

      {/* Create / Edit modal */}
      <EventFormModal
        open={formModal.open}
        onClose={() => setFormModal({ open: false })}
        onSaved={() => { fetchEvents(); setFormModal({ open: false }); }}
        event={formModal.event}
        defaultAgentId={formModal.defaultAgentId}
        defaultDate={formModal.defaultDate}
        defaultTimeStart={formModal.defaultTimeStart}
        agents={agents}
        properties={properties}
      />

      {/* Expand modal */}
      <AgentExpandModal
        open={expandState.open}
        onClose={() => setExpandState({ open: false, agent: null })}
        onRefresh={fetchEvents}
        agent={expandState.agent}
        allAgents={agents}
        properties={properties}
      />
    </AdminLayout>
  );
};

export default Agenda;
