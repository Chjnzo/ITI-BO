"use client";

import React, { useEffect, useState, useCallback, useMemo, memo } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';
import { showError, showSuccess } from '@/utils/toast';
import { format, isToday, parseISO, startOfWeek, endOfWeek, addDays, addWeeks, subWeeks } from 'date-fns';
import { it } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Plus, ChevronLeft, ChevronRight, CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import EventFormModal, {
  type Appointment, type AgentProfile, type TipologiaRow, type TipologieMap, TIPOLOGIA_COLORS,
} from '@/components/agenda/EventFormModal';
import CategorieSheet from '@/components/agenda/CategorieSheet';
import WeeklyPlanningView from '@/components/agenda/WeeklyPlanningView';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';

// ── Main Page ─────────────────────────────────────────────────────────────────

interface FormModalState {
  open: boolean;
  event?: Appointment;
  defaultDate?: string;
  defaultTimeStart?: string;
}

const Agenda = () => {
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [events, setEvents] = useState<Appointment[]>([]);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [properties, setProperties] = useState<{ id: string; titolo: string; copertina_url: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [formModal, setFormModal] = useState<FormModalState>({ open: false });
  const [tipologieRows, setTipologieRows] = useState<TipologiaRow[]>([]);

  const fetchTipologie = useCallback(async () => {
    const { data } = await supabase
      .from('tipologie_appuntamenti')
      .select('*')
      .order('ordine');
    setTipologieRows((data as TipologiaRow[]) ?? []);
  }, []);

  // Fetch agents + properties + tipologie once on mount
  useEffect(() => {
    const init = async () => {
      const [{ data: { user } }, { data: agentsData }, { data: propsData }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('profili_agenti').select('id, nome_completo, colore_calendario'),
        supabase.from('immobili').select('id, titolo, copertina_url').neq('stato', 'Venduto').order('titolo'),
      ]);
      if (user) setCurrentUserId(user.id);
      setAgents((agentsData as AgentProfile[]) || []);
      setProperties(propsData || []);
    };
    init();
    fetchTipologie();
  }, [fetchTipologie]);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    const monday = format(startOfWeek(parseISO(selectedDate), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const sunday = format(endOfWeek(parseISO(selectedDate), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const { data, error } = await supabase
      .from('appuntamenti')
      .select('*, leads(nome, cognome, telefono), immobili(titolo)')
      .gte('data', monday)
      .lte('data', sunday)
      .order('ora_inizio');
    if (error) showError('Errore caricamento appuntamenti');
    else setEvents((data as Appointment[]) || []);
    setLoading(false);
  }, [selectedDate]);

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

  // Derived color map and tipologie list from DB rows
  const coloriMap = useMemo<TipologieMap>(() => {
    if (tipologieRows.length === 0) return TIPOLOGIA_COLORS;
    return Object.fromEntries(
      tipologieRows.map(t => [t.nome, { bg: t.colore_bg, border: t.colore_border, text: '#ffffff' }]),
    );
  }, [tipologieRows]);

  const tipologieList = useMemo(
    () => tipologieRows.map(t => t.nome),
    [tipologieRows],
  );

  const handleEventDrop = useCallback(async (event: Appointment, newDate: string, newOraInizio: string, newOraFine: string | null) => {
    setEvents(prev => prev.map(e => e.id === event.id
      ? { ...e, data: newDate, ora_inizio: newOraInizio, ora_fine: newOraFine }
      : e
    ));
    const { error } = await supabase
      .from('appuntamenti')
      .update({ data: newDate, ora_inizio: newOraInizio, ora_fine: newOraFine })
      .eq('id', event.id);
    if (error) {
      showError('Errore nello spostamento dell\'appuntamento');
      setEvents(prev => prev.map(e => e.id === event.id ? event : e));
    }
  }, []);

  const openNewEvent = () => setFormModal({ open: true, defaultDate: selectedDate });
  const openEventEdit = (event: Appointment) => setFormModal({ open: true, event });
  const openSlotCreate = (date: string, time: string) =>
    setFormModal({ open: true, defaultDate: date, defaultTimeStart: time });

  const parsedDate = parseISO(selectedDate);

  const periodLabel = useMemo(() => {
    const ws = startOfWeek(parsedDate, { weekStartsOn: 1 });
    const we = endOfWeek(parsedDate, { weekStartsOn: 1 });
    return `Settimana ${format(ws, 'd')}–${format(we, 'd MMMM yyyy', { locale: it })}`;
  }, [parsedDate]);

  return (
    <AdminLayout fullHeight wide>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">

        {/* Header — single row */}
        <div className="flex items-center justify-between mb-3 gap-4 shrink-0 flex-wrap">
          <div className="flex items-baseline gap-3 min-w-0">
            <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 shrink-0">Agenda</h1>
            <span className="text-sm font-semibold text-gray-400 capitalize truncate">{periodLabel}</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Nav arrows */}
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 rounded-xl border-gray-200"
              onClick={() => setSelectedDate(format(subWeeks(parseISO(selectedDate), 1), 'yyyy-MM-dd'))}
            >
              <ChevronLeft size={16} />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 rounded-xl border-gray-200"
              onClick={() => setSelectedDate(format(addWeeks(parseISO(selectedDate), 1), 'yyyy-MM-dd'))}
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
            <CategorieSheet onRefresh={() => { fetchTipologie(); fetchEvents(); }} />
            <Button
              onClick={openNewEvent}
              className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-2xl px-7 h-11 shadow-lg shadow-[#94b0ab]/20 font-bold transition-all"
            >
              <Plus className="mr-2" size={16} /> Nuovo
            </Button>
          </div>
        </div>

        {/* Weekly calendar */}
        <div className="flex-1 min-h-0 relative">
          <div className="absolute inset-0">
            <WeeklyPlanningView
              events={events}
              agents={agents}
              visibleAgents={visibleAgents}
              selectedDate={selectedDate}
              loading={loading}
              onEventClick={openEventEdit}
              onSlotClick={openSlotCreate}
              onEventDrop={handleEventDrop}
              coloriMap={coloriMap}
            />
          </div>
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
        coloriMap={coloriMap}
        tipologieList={tipologieList}
      />

    </AdminLayout>
  );
};

export default Agenda;
