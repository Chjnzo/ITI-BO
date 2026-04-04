"use client";

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';
import {
  Users, Calendar, ListTodo, Plus, X, Check, CheckCircle2, ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import { it } from 'date-fns/locale';
import TaskModal, { TIPOLOGIA_CONFIG } from '@/components/TaskModal';
import ProfileSettingsSheet from '@/components/ProfileSettingsSheet';
import { showSuccess } from '@/utils/toast';

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
  tipologia: 'Chiamata' | 'WhatsApp' | 'Appuntamento' | null;
  titolo: string | null;
  stato: string;
  nota: string | null;
  data: string;
  ora: string | null;
  leads?: { nome: string; cognome: string } | null;
}

interface RecentLead {
  id: string;
  nome: string;
  cognome: string;
  stato: string;
  created_at: string;
}

const STATO_LEAD_COLORS: Record<string, string> = {
  'Nuovo': 'bg-blue-50 text-blue-700',
  'In Trattativa': 'bg-amber-50 text-amber-700',
  'Visita Fissata': 'bg-purple-50 text-purple-700',
  'Chiuso': 'bg-emerald-50 text-emerald-700',
};

const Dashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [stats, setStats] = useState({ activeLeads: 0, todayAppointments: 0, pendingTasks: 0 });
  const [todayAppointments, setTodayAppointments] = useState<TodayAppointment[]>([]);
  const [pendingTasks, setPendingTasks] = useState<PendingTask[]>([]);
  const [recentLeads, setRecentLeads] = useState<RecentLead[]>([]);
  const [fabOpen, setFabOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const fetchAll = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      setUserId(user.id);

      const { data: prof } = await supabase
        .from('profili_agenti')
        .select('id, nome_completo, colore_calendario, avatar_url')
        .eq('id', user.id)
        .single();

      const profileData = prof as AgentProfile | null;
      setProfile(profileData);
      const admin = profileData?.nome_completo?.toLowerCase().includes('marco') ?? false;
      setIsAdmin(admin);

      const today = format(new Date(), 'yyyy-MM-dd');

      // Build queries (conditional filters before Promise.all)
      let activeLeadsQuery = supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .neq('stato', 'Chiuso');
      if (!admin) activeLeadsQuery = activeLeadsQuery.eq('assegnato_a', user.id);

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

      let recentLeadsQuery = supabase
        .from('leads')
        .select('id, nome, cognome, stato, created_at')
        .order('created_at', { ascending: false })
        .limit(5);
      if (!admin) recentLeadsQuery = recentLeadsQuery.eq('assegnato_a', user.id);

      const [
        { count: activeLeadsCount },
        { count: todayAppCount },
        { count: pendingTasksCount },
        { data: appsData },
        { data: tasksData },
        { data: leadsData },
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
          .select('id, titolo, tipologia, nota, data, ora, stato, leads(nome, cognome)')
          .eq('stato', 'Da fare')
          .eq('agente_id', user.id)
          .order('data', { ascending: true })
          .limit(5),
        recentLeadsQuery,
      ]);

      setStats({
        activeLeads: activeLeadsCount ?? 0,
        todayAppointments: todayAppCount ?? 0,
        pendingTasks: pendingTasksCount ?? 0,
      });
      setTodayAppointments((appsData as any) ?? []);
      setPendingTasks((tasksData as any) ?? []);
      setRecentLeads((leadsData as any) ?? []);
      setLoading(false);
    };
    fetchAll();
  }, []);

  const toggleTaskComplete = async (task: PendingTask) => {
    setPendingTasks(prev => prev.filter(t => t.id !== task.id));
    await supabase.from('tasks').update({ stato: 'Completata' }).eq('id', task.id);
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Buongiorno' : hour < 18 ? 'Buon pomeriggio' : 'Buonasera';
  const firstName = profile?.nome_completo?.split(' ')[0] ?? '';
  const initials = profile?.nome_completo
    ? profile.nome_completo.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?';
  const avatarColor = profile?.colore_calendario ?? '#94b0ab';
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
        {!loading && profile && (
          <button
            type="button"
            onClick={() => setProfileSheetOpen(true)}
            className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-base shrink-0 select-none cursor-pointer hover:ring-4 hover:ring-[#94b0ab]/30 transition-all overflow-hidden"
            style={{ backgroundColor: profile.avatar_url ? 'transparent' : avatarColor }}
            title="Modifica profilo"
          >
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.nome_completo ?? ''}
                className="w-full h-full object-cover"
                onError={e => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              initials
            )}
          </button>
        )}
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
          <div className="flex items-center gap-2 mb-5">
            <Calendar className="w-5 h-5 text-[#94b0ab]" />
            <h2 className="text-base font-bold text-gray-900">Appuntamenti di oggi</h2>
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

        {/* Task in sospeso */}
        <div className="bg-white rounded-[2rem] shadow-sm p-6 flex flex-col">
          <div className="flex items-center gap-2 mb-5">
            <ListTodo className="w-5 h-5 text-[#94b0ab]" />
            <h2 className="text-base font-bold text-gray-900">Task in sospeso</h2>
          </div>
          <div className="flex-1">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-10 bg-gray-50 rounded-xl animate-pulse" />)}
              </div>
            ) : pendingTasks.length === 0 ? (
              <div className="py-8 flex flex-col items-center gap-2 text-center">
                <CheckCircle2 className="w-8 h-8 text-gray-200" />
                <p className="text-sm text-gray-400">Nessuna task in sospeso</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingTasks.map(task => {
                  const cfg = task.tipologia ? TIPOLOGIA_CONFIG[task.tipologia] : null;
                  const Icon = cfg?.icon;
                  const isToday = task.data === format(new Date(), 'yyyy-MM-dd');
                  return (
                    <div key={task.id} className="flex items-center gap-3">
                      {cfg && Icon && (
                        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', cfg.bg)}>
                          <Icon size={14} className={cfg.color} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {task.titolo || (task.leads ? `${task.leads.nome} ${task.leads.cognome}` : task.tipologia)}
                        </p>
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

        {/* Ultimi Lead */}
        <div className="bg-white rounded-[2rem] shadow-sm p-6 flex flex-col">
          <div className="flex items-center gap-2 mb-5">
            <Users className="w-5 h-5 text-[#94b0ab]" />
            <h2 className="text-base font-bold text-gray-900">Ultimi Lead</h2>
          </div>
          <div className="flex-1">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-10 bg-gray-50 rounded-xl animate-pulse" />)}
              </div>
            ) : recentLeads.length === 0 ? (
              <div className="py-8 flex flex-col items-center gap-2 text-center">
                <Users className="w-8 h-8 text-gray-200" />
                <p className="text-sm text-gray-400">Nessun lead recente</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentLeads.map(lead => (
                  <div key={lead.id} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {lead.nome} {lead.cognome}
                      </p>
                      <p className="text-xs text-gray-400">
                        {formatDistanceToNow(new Date(lead.created_at), { addSuffix: true, locale: it })}
                      </p>
                    </div>
                    <span className={cn(
                      'text-[10px] font-bold px-2 py-1 rounded-full shrink-0',
                      STATO_LEAD_COLORS[lead.stato] ?? 'bg-gray-50 text-gray-500'
                    )}>
                      {lead.stato}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => navigate('/leads')}
            className="mt-5 flex items-center gap-1 text-xs font-bold text-[#94b0ab] hover:underline self-start"
          >
            Vedi tutti i lead <ArrowRight size={12} />
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
              onClick={() => { showSuccess('Coming soon'); setFabOpen(false); }}
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

      {profile && userId && (
        <ProfileSettingsSheet
          open={profileSheetOpen}
          onClose={() => setProfileSheetOpen(false)}
          profile={profile}
          userId={userId}
          onSaved={updated => setProfile(updated)}
        />
      )}
    </AdminLayout>
  );
};

export default Dashboard;
