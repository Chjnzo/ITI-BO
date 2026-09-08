"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';
import {
  Users, Calendar, ListTodo, Plus, X, Check, CheckCircle2, ArrowRight, AlertTriangle,
  BellOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, addDays } from 'date-fns';
import { it } from 'date-fns/locale';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import TaskModal from '@/components/TaskModal';
import EventFormModal, { type AgentProfile as EventAgentProfile } from '@/components/agenda/EventFormModal';
import { useAlerts } from '@/hooks/useAlerts';
import { showError } from '@/utils/toast';

interface AgentProfile {
  id: string;
  nome_completo: string | null;
  colore_calendario: string | null;
  avatar_url: string | null;
}

interface TodayAppointment {
  id: string;
  tipologia: string;
  ora_inizio: string | null;
  ora_fine: string | null;
  note: string | null;
  leads?: { nome: string; cognome: string } | null;
  immobili?: { titolo: string } | null;
}

interface PendingTask {
  id: string;
  titolo: string | null;
  stato: string;
  nota: string | null;
  data: string;
  ora: string | null;
  urgente: boolean;
  leads?: { nome: string; cognome: string } | null;
}

const ORIZZONTI_TASK = [
  { value: 'oggi', label: 'Oggi', giorni: 0 },
  { value: '5', label: '5 giorni', giorni: 5 },
  { value: '10', label: '10 giorni', giorni: 10 },
] as const;

const Dashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [stats, setStats] = useState({ activeLeads: 0, todayAppointments: 0, pendingTasks: 0 });
  const [todayAppointments, setTodayAppointments] = useState<TodayAppointment[]>([]);
  const [pendingTasks, setPendingTasks] = useState<PendingTask[]>([]);
  const [taskHorizon, setTaskHorizon] = useState<typeof ORIZZONTI_TASK[number]['value']>('oggi');
  const [fabOpen, setFabOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [agents, setAgents] = useState<EventAgentProfile[]>([]);
  const [properties, setProperties] = useState<{ id: string; titolo: string; copertina_url: string | null }[]>([]);

  const { manuali: alertManuali, automatici: alertAutomatici, isLoading: alertsLoading } = useAlerts();

  useEffect(() => {
    let aborted = false;
    const fetchAll = async () => {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user || aborted) { setLoading(false); return; }

      setCurrentUserId(user.id);

      const { data: prof, error: profError } = await supabase
        .from('profili_agenti')
        .select('id, nome_completo, colore_calendario, avatar_url, is_admin')
        .eq('id', user.id)
        .single();
      if (profError) showError('Errore nel caricamento del profilo agente');

      const profileData = prof as (AgentProfile & { is_admin?: boolean }) | null;
      setProfile(profileData);
      const admin = profileData?.is_admin ?? false;
      setIsAdmin(admin);

      const today = format(new Date(), 'yyyy-MM-dd');
      const horizon10 = format(addDays(new Date(), 10), 'yyyy-MM-dd');

      // Build queries (conditional filters before Promise.all)
      const activeLeadsQuery = supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .neq('stato', 'Chiuso');

      let todayAppCountQuery = supabase
        .from('appuntamenti')
        .select('*', { count: 'exact', head: true })
        .eq('data', today);
      if (!admin) todayAppCountQuery = todayAppCountQuery.eq('agente_id', user.id);

      let pendingTasksCountQuery = supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('stato', 'Da fare');
      if (!admin) pendingTasksCountQuery = pendingTasksCountQuery.eq('agente_id', user.id);

      const [
        { count: activeLeadsCount, error: activeLeadsError },
        { count: todayAppCount, error: todayAppCountError },
        { count: pendingTasksCount, error: pendingTasksCountError },
        { data: appsData, error: appsError },
        { data: tasksData, error: tasksError },
        { data: agentsData, error: agentsError },
        { data: propsData, error: propsError },
      ] = await Promise.all([
        activeLeadsQuery,
        todayAppCountQuery,
        pendingTasksCountQuery,
        supabase
          .from('appuntamenti')
          .select('id, tipologia, ora_inizio, ora_fine, note, leads(nome, cognome), immobili(titolo)')
          .eq('data', today)
          .eq('agente_id', user.id)
          .order('ora_inizio', { ascending: true }),
        supabase
          .from('tasks')
          .select('id, titolo, nota, data, ora, stato, urgente, leads(nome, cognome)')
          .neq('stato', 'Completata')
          .eq('agente_id', user.id)
          .lte('data', horizon10)
          .order('urgente', { ascending: false })
          .order('data', { ascending: true })
          .limit(30),
        supabase.from('profili_agenti').select('id, nome_completo, colore_calendario'),
        supabase.from('immobili').select('id, titolo, copertina_url').neq('stato', 'Venduto').order('titolo'),
      ]);

      if (aborted) return;
      if (activeLeadsError || todayAppCountError || pendingTasksCountError || appsError || tasksError || agentsError || propsError) {
        showError('Errore nel caricamento dei dati della dashboard');
      }
      setStats({
        activeLeads: activeLeadsCount ?? 0,
        todayAppointments: todayAppCount ?? 0,
        pendingTasks: pendingTasksCount ?? 0,
      });
      setTodayAppointments((appsData as unknown as TodayAppointment[]) ?? []);
      setPendingTasks((tasksData as unknown as PendingTask[]) ?? []);
      setAgents((agentsData as EventAgentProfile[]) ?? []);
      setProperties(propsData ?? []);
      setLoading(false);
    };
    fetchAll();
    return () => { aborted = true; };
  }, []);

  const displayedTasks = useMemo(() => {
    const giorni = ORIZZONTI_TASK.find(o => o.value === taskHorizon)?.giorni ?? 0;
    const limite = format(addDays(new Date(), giorni), 'yyyy-MM-dd');
    return pendingTasks.filter(t => t.data <= limite);
  }, [pendingTasks, taskHorizon]);

  const toggleTaskComplete = async (task: PendingTask) => {
    setPendingTasks(prev => prev.filter(t => t.id !== task.id));
    await supabase.from('tasks').update({ stato: 'Completata' }).eq('id', task.id);
  };

  const refetchTodayAppointments = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const today = format(new Date(), 'yyyy-MM-dd');
    const { data } = await supabase
      .from('appuntamenti')
      .select('id, tipologia, ora_inizio, ora_fine, note, leads(nome, cognome), immobili(titolo)')
      .eq('data', today)
      .eq('agente_id', user.id)
      .order('ora_inizio', { ascending: true });
    setTodayAppointments((data as unknown as TodayAppointment[]) ?? []);
  };

  const alertTotale = alertManuali.length + alertAutomatici.length;
  // Preview compatta: solo il conteggio di ciò che manca per immobile, per
  // arrivare in fretta alla pagina /alert dove c'è il dettaglio. Aggreghiamo
  // per immobile così una scheda con 5 doc mancanti conta 1 sola card qui.
  const alertPerImmobile = (() => {
    const map = new Map<string, { immobileId: string; titolo: string; indirizzo: string; count: number }>();
    for (const a of alertAutomatici.filter((x) => x.entita === 'immobile')) {
      const existing = map.get(a.entitaId);
      if (existing) existing.count += 1;
      else map.set(a.entitaId, { immobileId: a.entitaId, titolo: a.titolo, indirizzo: a.indirizzo, count: 1 });
    }
    for (const m of alertManuali) {
      const key = m.immobile_id;
      const existing = map.get(key);
      if (existing) existing.count += 1;
      else if (m.immobile) map.set(key, {
        immobileId: m.immobile_id,
        titolo: m.immobile.titolo,
        indirizzo: `${m.immobile.indirizzo}, ${m.immobile.citta}`,
        count: 1,
      });
    }
    return [...map.values()].slice(0, 5);
  })();

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Buongiorno' : hour < 18 ? 'Buon pomeriggio' : 'Buonasera';
  const firstName = profile?.nome_completo?.split(' ')[0] ?? '';
  const todayLabel = format(new Date(), "EEEE d MMMM yyyy", { locale: it });

  const statsCards = [
    {
      label: isAdmin ? 'Lead Attivi (totale)' : 'Miei Lead Attivi',
      value: stats.activeLeads,
      icon: Users,
      color: 'text-blue-500',
      bg: 'bg-blue-50',
    },
    {
      label: isAdmin ? 'Appuntamenti oggi (totale)' : 'Appuntamenti oggi',
      value: stats.todayAppointments,
      icon: Calendar,
      color: 'text-[#94b0ab]',
      bg: 'bg-[#94b0ab]/10',
    },
    {
      label: isAdmin ? 'Task in sospeso (totale)' : 'Miei Task in sospeso',
      value: stats.pendingTasks,
      icon: ListTodo,
      color: 'text-purple-500',
      bg: 'bg-purple-50',
    },
  ];

  return (
    <AdminLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-10">
        <div>
          <p className="text-sm font-medium text-gray-400 capitalize">{todayLabel}</p>
          {loading ? (
            <div className="h-10 w-64 bg-gray-100 rounded-xl animate-pulse mt-1" />
          ) : (
            <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 mt-1">
              {greeting}{firstName ? `, ${firstName}` : ''}.
            </h1>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        {statsCards.map((s, i) => (
          <div key={i} className="bg-white rounded-[2rem] shadow-sm p-6">
            <div className={cn('w-10 h-10 rounded-2xl flex items-center justify-center mb-4', s.bg)}>
              <s.icon className={cn('w-5 h-5', s.color)} />
            </div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{s.label}</p>
            {loading ? (
              <div className="h-10 w-16 bg-gray-100 rounded-lg animate-pulse mt-1" />
            ) : (
              <p className="text-4xl font-black text-gray-900 mt-1">{s.value}</p>
            )}
          </div>
        ))}
      </div>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

        {/* Appuntamenti di oggi */}
        <div className="bg-white rounded-[2rem] shadow-sm p-6 flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-5">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[#94b0ab]" />
              <h2 className="text-base font-bold text-gray-900">Appuntamenti di oggi</h2>
            </div>
            <button
              type="button"
              onClick={() => setEventModalOpen(true)}
              className="w-7 h-7 rounded-full flex items-center justify-center text-[#94b0ab] hover:bg-[#94b0ab]/10 transition-colors shrink-0"
              title="Nuovo appuntamento"
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="flex-1">
            {loading ? (
              <div className="space-y-3">
                {[1, 2].map(i => <div key={i} className="h-12 bg-gray-50 rounded-xl animate-pulse" />)}
              </div>
            ) : todayAppointments.length === 0 ? (
              <div className="py-8 flex flex-col items-center gap-2 text-center">
                <Calendar className="w-8 h-8 text-gray-200" />
                <p className="text-sm text-gray-400">Nessun appuntamento oggi</p>
              </div>
            ) : (
              <div className="space-y-3">
                {todayAppointments.map(app => (
                  <div key={app.id} className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#94b0ab] mt-2 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {app.leads
                          ? `${app.leads.nome} ${app.leads.cognome}`
                          : (app.immobili?.titolo ?? app.tipologia)}
                      </p>
                      <p className="text-xs text-gray-400">
                        {app.ora_inizio ? app.ora_inizio.slice(0, 5) : ''}
                        {app.ora_fine ? ` → ${app.ora_fine.slice(0, 5)}` : ''}
                        {app.ora_inizio && ' · '}
                        {app.tipologia}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => navigate('/agenda')}
            className="mt-5 flex items-center gap-1 text-xs font-bold text-[#94b0ab] hover:underline self-start"
          >
            Vedi agenda <ArrowRight size={12} />
          </button>
        </div>

        {/* Task in scadenza */}
        <div className="bg-white rounded-[2rem] shadow-sm p-6 flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
            <div className="flex items-center gap-2">
              <ListTodo className="w-5 h-5 text-[#94b0ab]" />
              <h2 className="text-base font-bold text-gray-900">Task in scadenza</h2>
            </div>
            <button
              type="button"
              onClick={() => setTaskModalOpen(true)}
              className="w-7 h-7 rounded-full flex items-center justify-center text-[#94b0ab] hover:bg-[#94b0ab]/10 transition-colors shrink-0"
              title="Nuova task"
            >
              <Plus size={16} />
            </button>
          </div>
          <Tabs value={taskHorizon} onValueChange={(v) => setTaskHorizon(v as typeof taskHorizon)} className="mb-4">
            <TabsList className="rounded-full p-1 bg-muted/50 border border-gray-100 h-auto">
              {ORIZZONTI_TASK.map(o => (
                <TabsTrigger key={o.value} value={o.value} className="rounded-full px-3 py-1 text-xs font-semibold data-[state=active]:bg-[#94b0ab] data-[state=active]:text-white">
                  {o.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="flex-1">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-10 bg-gray-50 rounded-xl animate-pulse" />)}
              </div>
            ) : displayedTasks.length === 0 ? (
              <div className="py-8 flex flex-col items-center gap-2 text-center">
                <CheckCircle2 className="w-8 h-8 text-gray-200" />
                <p className="text-sm text-gray-400">Nessuna task in scadenza</p>
              </div>
            ) : (
              <div className="space-y-3">
                {displayedTasks.map(task => {
                  const isToday = task.data === format(new Date(), 'yyyy-MM-dd');
                  const leadName = task.leads ? `${task.leads.nome} ${task.leads.cognome}` : null;
                  return (
                    <div
                      key={task.id}
                      className={cn(
                        'flex items-center gap-3',
                        task.urgente && 'bg-red-50/70 -mx-2 px-2 py-1.5 rounded-xl',
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {task.urgente && <AlertTriangle size={12} className="text-red-600 shrink-0" />}
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {task.titolo || leadName || 'Task'}
                          </p>
                        </div>
                        {!isToday && (
                          <p className="text-xs text-gray-400">
                            {format(new Date(task.data), 'd MMM', { locale: it })}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleTaskComplete(task)}
                        className="w-6 h-6 rounded-full border-2 border-gray-200 flex items-center justify-center shrink-0 hover:border-[#94b0ab] hover:bg-[#94b0ab]/10 transition-colors"
                        title="Segna come completata"
                      >
                        <Check size={11} className="text-gray-300" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => navigate('/tasks')}
            className="mt-5 flex items-center gap-1 text-xs font-bold text-[#94b0ab] hover:underline self-start"
          >
            Vedi tutti i task <ArrowRight size={12} />
          </button>
        </div>

        {/* Alert */}
        <div className="bg-white rounded-[2rem] shadow-sm p-6 flex flex-col">
          <div className="flex items-center gap-2 mb-5">
            <AlertTriangle className="w-5 h-5 text-[#94b0ab]" />
            <h2 className="text-base font-bold text-gray-900">Alert</h2>
            {alertTotale > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600">
                {alertTotale}
              </span>
            )}
          </div>
          <div className="flex-1">
            {alertsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-10 bg-gray-50 rounded-xl animate-pulse" />)}
              </div>
            ) : alertPerImmobile.length === 0 ? (
              <div className="py-8 flex flex-col items-center gap-2 text-center">
                <BellOff className="w-8 h-8 text-gray-200" />
                <p className="text-sm text-gray-400">Nessun alert attivo</p>
              </div>
            ) : (
              <div className="space-y-2">
                {alertPerImmobile.map(item => (
                  <button
                    key={item.immobileId}
                    type="button"
                    onClick={() => navigate('/gestione', { state: { openImmobileId: item.immobileId, gestioneTab: 'in-vendita' } })}
                    className="w-full text-left flex items-center gap-3 rounded-xl border border-gray-100 px-3 py-2.5 hover:border-[#94b0ab]/40 hover:bg-[#94b0ab]/5 transition-colors group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-[#94b0ab]/10 flex items-center justify-center shrink-0">
                      <AlertTriangle size={14} className="text-[#94b0ab]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{item.titolo}</p>
                      <p className="text-xs text-gray-400 truncate">{item.indirizzo}</p>
                    </div>
                    <span className="text-[0.65rem] font-bold text-red-600 bg-red-50 rounded-full px-2 py-0.5 shrink-0">
                      {item.count}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => navigate('/alert')}
            className="mt-5 flex items-center gap-1 text-xs font-bold text-[#94b0ab] hover:underline self-start"
          >
            Vedi tutti gli alert <ArrowRight size={12} />
          </button>
        </div>

      </div>

      {/* FAB - mobile only */}
      <div className="fixed bottom-6 right-6 z-50 md:hidden">
        {fabOpen && (
          <div className="fixed inset-0" onClick={() => setFabOpen(false)} />
        )}
        {fabOpen && (
          <div className="absolute bottom-16 right-0 flex flex-col gap-2 items-end">
            <button
              type="button"
              onClick={() => { setTaskModalOpen(true); setFabOpen(false); }}
              className="relative z-10 flex items-center gap-2 bg-white text-gray-800 text-sm font-semibold px-4 py-3 rounded-2xl shadow-lg border border-gray-100 whitespace-nowrap"
            >
              📋 Nuova Task
            </button>
            <button
              type="button"
              onClick={() => { setEventModalOpen(true); setFabOpen(false); }}
              className="relative z-10 flex items-center gap-2 bg-white text-gray-800 text-sm font-semibold px-4 py-3 rounded-2xl shadow-lg border border-gray-100 whitespace-nowrap"
            >
              📅 Nuovo Evento
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => setFabOpen(prev => !prev)}
          className="relative z-10 w-14 h-14 rounded-full bg-[#94b0ab] text-white shadow-lg flex items-center justify-center"
        >
          {fabOpen ? <X size={24} /> : <Plus size={24} />}
        </button>
      </div>

      <TaskModal
        open={taskModalOpen}
        onClose={() => setTaskModalOpen(false)}
        onSaved={() => setTaskModalOpen(false)}
      />

      <EventFormModal
        open={eventModalOpen}
        onClose={() => setEventModalOpen(false)}
        onSaved={() => { setEventModalOpen(false); refetchTodayAppointments(); }}
        defaultAgentId={currentUserId ?? undefined}
        defaultDate={format(new Date(), 'yyyy-MM-dd')}
        agents={agents}
        properties={properties}
      />
    </AdminLayout>
  );
};

export default Dashboard;
