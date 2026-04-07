"use client";

import React, { useState, useMemo, memo } from 'react';
import { format, isToday, parseISO, startOfWeek, addDays } from 'date-fns';
import { it } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { type Appointment, type AgentProfile, TIPOLOGIA_COLORS } from '@/components/agenda/EventFormModal';

// ── Constants ─────────────────────────────────────────────────────────────────

const HOUR_HEIGHT = 60;
const DAY_START = 8;
const DAY_END = 20;
const TOTAL_HOURS = DAY_END - DAY_START;
const TIMELINE_HEIGHT = TOTAL_HOURS * HOUR_HEIGHT;
const HOURS = Array.from({ length: TOTAL_HOURS }, (_, i) => DAY_START + i);
const DAY_HEADER_HEIGHT = 52;
const TIMELINE_TOP_PADDING = 24;

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

const hexWithOpacity = (hex: string, opacity: number): string => {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return `rgba(148,176,171,${opacity})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${opacity})`;
};

// ── Lane layout algorithm ─────────────────────────────────────────────────────

interface PositionedEvent extends Appointment {
  lane: number;
  totalLanes: number;
}

const layoutEvents = (events: Appointment[]): PositionedEvent[] => {
  const sorted = [...events].sort((a, b) => {
    if (!a.ora_inizio && !b.ora_inizio) return 0;
    if (!a.ora_inizio) return 1;
    if (!b.ora_inizio) return -1;
    return a.ora_inizio.localeCompare(b.ora_inizio);
  });

  // Each lane tracks the end-time (minutes) of its last event
  const laneEnds: number[] = [];
  const eventLanes: number[] = [];

  for (const event of sorted) {
    const start = event.ora_inizio ? timeToMinutes(event.ora_inizio) : DAY_START * 60;
    const end = event.ora_fine ? timeToMinutes(event.ora_fine) : start + 60;

    let assigned = -1;
    for (let i = 0; i < laneEnds.length; i++) {
      if (laneEnds[i] <= start) { assigned = i; break; }
    }
    if (assigned === -1) {
      assigned = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[assigned] = end;
    }
    eventLanes.push(assigned);
  }

  return sorted.map((event, i) => {
    const start = event.ora_inizio ? timeToMinutes(event.ora_inizio) : DAY_START * 60;
    const end = event.ora_fine ? timeToMinutes(event.ora_fine) : start + 60;
    let maxLane = eventLanes[i];
    for (let j = 0; j < sorted.length; j++) {
      const oStart = sorted[j].ora_inizio ? timeToMinutes(sorted[j].ora_inizio!) : DAY_START * 60;
      const oEnd = sorted[j].ora_fine ? timeToMinutes(sorted[j].ora_fine!) : oStart + 60;
      if (oStart < end && oEnd > start) maxLane = Math.max(maxLane, eventLanes[j]);
    }
    return { ...event, lane: eventLanes[i], totalLanes: maxLane + 1 };
  });
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface WeeklyPlanningViewProps {
  events: Appointment[];
  agents: AgentProfile[];
  visibleAgents: AgentProfile[];
  selectedDate: string;
  loading: boolean;
  onEventClick: (event: Appointment) => void;
  onSlotClick: (date: string, time: string) => void;
}

// ── DayColumn ─────────────────────────────────────────────────────────────────

interface DayColumnProps {
  day: Date;
  events: Appointment[];
  agentColorMap: Map<string, string>;
  agentNameMap: Map<string, string>;
  loading: boolean;
  onEventClick: (event: Appointment) => void;
  onSlotClick: (date: string, time: string) => void;
}

const DayColumn = memo(({
  day, events, agentColorMap, agentNameMap, loading, onEventClick, onSlotClick,
}: DayColumnProps) => {
  const dateStr = format(day, 'yyyy-MM-dd');
  const today = isToday(day);

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-event-block]')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const rawMinutes = DAY_START * 60 + (y / HOUR_HEIGHT) * 60;
    const snapped = snapToQuarter(rawMinutes);
    onSlotClick(dateStr, minutesToTimeStr(snapped));
  };

  const laid = layoutEvents(events);

  return (
    <div className="flex-1 border-l border-gray-100 min-w-0 flex flex-col">
      {/* Sticky day header */}
      <div
        className={cn(
          'sticky top-0 bg-white z-10 flex flex-col items-center justify-center border-b border-gray-50 shrink-0',
        )}
        style={{ height: DAY_HEADER_HEIGHT }}
      >
        <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
          {format(day, 'EEE', { locale: it })}
        </span>
        <span
          className={cn(
            'text-sm font-black leading-none mt-0.5',
            today ? 'text-[#94b0ab]' : 'text-gray-700',
          )}
        >
          {format(day, 'd')}
        </span>
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="flex-1 p-2 space-y-2">
          {[1, 2].map(i => <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
      ) : (
        <div style={{ paddingTop: TIMELINE_TOP_PADDING }}>
        <div
          className="relative cursor-pointer"
          style={{ height: TIMELINE_HEIGHT }}
          onClick={handleTimelineClick}
        >
          {/* Hour lines */}
          {HOURS.map(h => (
            <React.Fragment key={h}>
              <div
                className="absolute left-0 right-0 border-t border-gray-100"
                style={{ top: (h - DAY_START) * HOUR_HEIGHT }}
              />
              <div
                className="absolute left-0 right-0 border-t border-gray-50"
                style={{ top: (h - DAY_START) * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
              />
            </React.Fragment>
          ))}

          {/* Today highlight */}
          {today && (
            <div className="absolute inset-0 bg-[#94b0ab]/[0.03] pointer-events-none" />
          )}

          {/* Event blocks */}
          {laid.map(event => {
            const colors = TIPOLOGIA_COLORS[event.tipologia] ?? TIPOLOGIA_COLORS['Altro'];
            const agentColor = agentColorMap.get(event.agente_id) ?? '#94b0ab';
            const initials = (agentNameMap.get(event.agente_id) ?? '?').substring(0, 2).toUpperCase();
            const top = getEventTop(event.ora_inizio);
            const height = getEventHeight(event.ora_inizio, event.ora_fine);
            const leftPct = (event.lane / event.totalLanes) * 100;
            const widthPct = (1 / event.totalLanes) * 100;

            return (
              <div
                key={event.id}
                data-event-block
                onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
                className="absolute rounded-lg border overflow-hidden cursor-pointer hover:brightness-95 transition-all px-1.5 py-1"
                style={{
                  top,
                  height,
                  minHeight: 24,
                  left: `calc(${leftPct}% + 1px)`,
                  width: `calc(${widthPct}% - 2px)`,
                  backgroundColor: colors.bg,
                  borderColor: colors.border,
                }}
              >
                <p
                  className="text-[9px] font-bold leading-tight truncate"
                  style={{ color: colors.text }}
                >
                  {event.ora_inizio?.slice(0, 5)}{event.ora_inizio ? ' · ' : ''}{event.tipologia}
                </p>
                {height > 36 && (
                  <p
                    className="text-[8px] leading-tight truncate opacity-80"
                    style={{ color: colors.text }}
                  >
                    {event.leads
                      ? `${event.leads.nome} ${event.leads.cognome}`
                      : event.immobili?.titolo ?? ''}
                  </p>
                )}
                {/* Agent initials badge */}
                <span
                  className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-black text-white shrink-0"
                  style={{ backgroundColor: agentColor }}
                >
                  {initials}
                </span>
              </div>
            );
          })}

          {/* Empty state dot */}
          {events.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-[9px] text-gray-200">—</span>
            </div>
          )}
        </div>
        </div>
      )}
    </div>
  );
});
DayColumn.displayName = 'DayColumn';

// ── Main Component ────────────────────────────────────────────────────────────

const WeeklyPlanningView = ({
  events, agents, visibleAgents, selectedDate, loading, onEventClick, onSlotClick,
}: WeeklyPlanningViewProps) => {
  const [hiddenAgentIds, setHiddenAgentIds] = useState<Set<string>>(new Set());

  const toggleAgent = (id: string) =>
    setHiddenAgentIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const weekDays = useMemo(() => {
    const monday = startOfWeek(parseISO(selectedDate), { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  }, [selectedDate]);

  const agentColorMap = useMemo(
    () => new Map(agents.map(a => [a.id, a.colore_calendario ?? '#94b0ab'])),
    [agents],
  );

  const agentNameMap = useMemo(
    () => new Map(agents.map(a => [a.id, a.nome_completo ?? a.id])),
    [agents],
  );

  const eventsByDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const e of events) {
      if (hiddenAgentIds.has(e.agente_id)) continue;
      const key = e.data;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [events, hiddenAgentIds]);

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Agent visibility pills */}
      <div className="flex flex-wrap gap-2 mb-3 shrink-0">
        {visibleAgents.map(agent => {
          const color = agentColorMap.get(agent.id) ?? '#94b0ab';
          const hidden = hiddenAgentIds.has(agent.id);
          return (
            <button
              key={agent.id}
              type="button"
              onClick={() => toggleAgent(agent.id)}
              className="rounded-xl px-3 py-1.5 text-xs font-bold border transition-all"
              style={{
                backgroundColor: hidden ? '#f3f4f6' : hexWithOpacity(color, 0.12),
                borderColor: hidden ? '#e5e7eb' : color,
                color: hidden ? '#9ca3af' : color,
              }}
            >
              {(agent.nome_completo ?? agent.id).substring(0, 2).toUpperCase()}
            </button>
          );
        })}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto rounded-[2rem] border border-gray-100 shadow-sm bg-white min-h-0">
        <div className="flex" style={{ minWidth: 670 }}>

          {/* Time gutter */}
          <div className="w-10 shrink-0 relative" style={{ paddingTop: DAY_HEADER_HEIGHT }}>
            {HOURS.map(h => (
              <div
                key={h}
                className="absolute left-0 w-full flex items-start justify-end pr-1.5"
                style={{ top: DAY_HEADER_HEIGHT + TIMELINE_TOP_PADDING + (h - DAY_START) * HOUR_HEIGHT - 6 }}
              >
                <span className="text-[9px] text-gray-300 font-medium leading-none select-none">
                  {String(h).padStart(2, '0')}
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDays.map(day => (
            <DayColumn
              key={format(day, 'yyyy-MM-dd')}
              day={day}
              events={eventsByDay.get(format(day, 'yyyy-MM-dd')) ?? []}
              agentColorMap={agentColorMap}
              agentNameMap={agentNameMap}
              loading={loading}
              onEventClick={onEventClick}
              onSlotClick={onSlotClick}
            />
          ))}

        </div>
      </div>

    </div>
  );
};

export default WeeklyPlanningView;
