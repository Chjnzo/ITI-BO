"use client";

import React, { useMemo, memo, useRef } from 'react';
import { isToday, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { type Appointment, type AgentProfile, type TipologieMap, TIPOLOGIA_COLORS } from '@/components/agenda/EventFormModal';

// ── Constants ─────────────────────────────────────────────────────────────────

const HOUR_HEIGHT = 56;
const DAY_START = 8;
const DAY_END = 22;
const TOTAL_HOURS = DAY_END - DAY_START;
const TIMELINE_HEIGHT = TOTAL_HOURS * HOUR_HEIGHT;
const HOURS = Array.from({ length: TOTAL_HOURS }, (_, i) => DAY_START + i);
const AGENT_HEADER_HEIGHT = 56;
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

// ── Lane layout ───────────────────────────────────────────────────────────────

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

  const laneEnds: number[] = [];
  const eventLanes: number[] = [];

  for (const event of sorted) {
    const start = event.ora_inizio ? timeToMinutes(event.ora_inizio) : DAY_START * 60;
    const end = event.ora_fine ? timeToMinutes(event.ora_fine) : start + 60;
    let assigned = -1;
    for (let i = 0; i < laneEnds.length; i++) {
      if (laneEnds[i] <= start) { assigned = i; break; }
    }
    if (assigned === -1) { assigned = laneEnds.length; laneEnds.push(end); }
    else laneEnds[assigned] = end;
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

// ── AgentColumn ───────────────────────────────────────────────────────────────

interface AgentColumnProps {
  agent: AgentProfile;
  agentColor: string;
  events: Appointment[];
  dateStr: string;
  todayHighlight: boolean;
  loading: boolean;
  onSlotClick: (date: string, time: string, agentId: string) => void;
  onEventClick: (event: Appointment) => void;
  coloriMap?: TipologieMap;
}

const AgentColumn = memo(({
  agent, agentColor, events, dateStr, todayHighlight, loading, onSlotClick, onEventClick, coloriMap,
}: AgentColumnProps) => {
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-event-block]')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const rawMinutes = DAY_START * 60 + (y / HOUR_HEIGHT) * 60;
    onSlotClick(dateStr, minutesToTimeStr(snapToQuarter(rawMinutes)), agent.id);
  };

  const laid = layoutEvents(events);
  const firstName = agent.nome_completo?.split(' ')[0] ?? 'Agente';

  return (
    <div className="flex-1 border-l border-gray-200 min-w-0 flex flex-col" style={{ minWidth: 160 }}>
      {/* Agent header */}
      <div
        className="sticky top-0 bg-white z-10 flex flex-col items-center justify-center border-b border-gray-200 shrink-0 gap-1.5"
        style={{ height: AGENT_HEADER_HEIGHT }}
      >
        <div
          className="w-4 h-4 rounded-full ring-2 ring-white shrink-0"
          style={{ backgroundColor: agentColor, boxShadow: `0 0 0 2px ${agentColor}33` }}
        />
        <span
          className={cn('text-xs font-bold leading-none tracking-wide')}
          style={{ color: todayHighlight ? agentColor : '#374151' }}
        >
          {firstName}
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
                <div className="absolute left-0 right-0 border-t border-gray-200" style={{ top: (h - DAY_START) * HOUR_HEIGHT }} />
                <div
                  className="absolute left-0 right-0"
                  style={{ top: (h - DAY_START) * HOUR_HEIGHT + HOUR_HEIGHT / 2, borderTop: '1px dashed #e5e7eb' }}
                />
              </React.Fragment>
            ))}

            {todayHighlight && <div className="absolute inset-0 bg-[#94b0ab]/[0.03] pointer-events-none" />}

            {/* Event blocks */}
            {laid.map(event => {
              const cm = coloriMap ?? TIPOLOGIA_COLORS;
              const colors = cm[event.tipologia] ?? cm['Altro'] ?? TIPOLOGIA_COLORS['Altro'];
              const top = getEventTop(event.ora_inizio);
              const height = getEventHeight(event.ora_inizio, event.ora_fine);
              const leftPct = (event.lane / event.totalLanes) * 100;
              const widthPct = (1 / event.totalLanes) * 100;

              return (
                <div
                  key={event.id}
                  data-event-block
                  onClick={e => { e.stopPropagation(); onEventClick(event); }}
                  className="absolute rounded-lg overflow-hidden px-1.5 py-1 cursor-pointer hover:brightness-95 transition-all"
                  style={{
                    top,
                    height,
                    minHeight: 24,
                    left: `calc(${leftPct}% + 1px)`,
                    width: `calc(${widthPct}% - 2px)`,
                    backgroundColor: colors.bg,
                    borderLeft: `3px solid ${colors.border}`,
                    boxShadow: `0 1px 3px 0 ${colors.bg}55`,
                  }}
                >
                  <p className="text-[11.5px] font-bold leading-tight truncate" style={{ color: colors.text }}>
                    {event.ora_inizio?.slice(0, 5)}{event.ora_inizio ? ' · ' : ''}{event.tipologia}
                  </p>
                  {height > 42 && (
                    <p className="text-[11px] leading-tight truncate font-medium opacity-90" style={{ color: colors.text }}>
                      {event.leads
                        ? `${event.leads.nome} ${event.leads.cognome}`
                        : event.immobili?.titolo ?? ''}
                    </p>
                  )}
                </div>
              );
            })}

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
AgentColumn.displayName = 'AgentColumn';

// ── Main Component ────────────────────────────────────────────────────────────

interface AgentColumnsViewProps {
  events: Appointment[];
  agents: AgentProfile[];
  visibleAgents: AgentProfile[];
  selectedDate: string;
  loading: boolean;
  onEventClick: (event: Appointment) => void;
  onSlotClick: (date: string, time: string, agentId?: string) => void;
  coloriMap?: TipologieMap;
}

const AgentColumnsView = ({
  events, agents, visibleAgents, selectedDate, loading, onEventClick, onSlotClick, coloriMap,
}: AgentColumnsViewProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const todayHighlight = isToday(parseISO(selectedDate));

  const agentColorMap = useMemo(
    () => new Map(agents.map(a => [a.id, a.colore_calendario ?? '#94b0ab'])),
    [agents],
  );

  const eventsByAgent = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const e of events) {
      if (e.data !== selectedDate) continue;
      if (!map.has(e.agente_id)) map.set(e.agente_id, []);
      map.get(e.agente_id)!.push(e);
    }
    return map;
  }, [events, selectedDate]);

  const minWidth = Math.max(400, 40 + visibleAgents.length * 180);

  return (
    <div className="h-full overflow-hidden rounded-[2rem] border border-gray-200 shadow-sm bg-white flex flex-col">
      <div ref={scrollRef} className="flex-1 overflow-auto min-h-0">
        <div className="flex" style={{ minWidth }}>

          {/* Time gutter */}
          <div className="w-10 shrink-0 relative" style={{ paddingTop: AGENT_HEADER_HEIGHT }}>
            {HOURS.map(h => (
              <div
                key={h}
                className="absolute left-0 w-full flex items-start justify-end pr-1.5"
                style={{ top: AGENT_HEADER_HEIGHT + TIMELINE_TOP_PADDING + (h - DAY_START) * HOUR_HEIGHT - 6 }}
              >
                <span className="text-[12px] text-gray-500 font-semibold leading-none select-none tabular-nums">
                  {String(h).padStart(2, '0')}
                </span>
              </div>
            ))}
          </div>

          {/* Agent columns */}
          {visibleAgents.map(agent => (
            <AgentColumn
              key={agent.id}
              agent={agent}
              agentColor={agentColorMap.get(agent.id) ?? '#94b0ab'}
              events={eventsByAgent.get(agent.id) ?? []}
              dateStr={selectedDate}
              todayHighlight={todayHighlight}
              loading={loading}
              onSlotClick={onSlotClick}
              onEventClick={onEventClick}
              coloriMap={coloriMap}
            />
          ))}

        </div>
      </div>
    </div>
  );
};

export default AgentColumnsView;
