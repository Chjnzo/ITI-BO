"use client";

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { supabase } from '@/lib/supabase';
import {
  Users, Home, Calendar, CheckCircle2, Plus, X, Check
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import TaskModal, { TIPOLOGIA_CONFIG } from '@/components/TaskModal';
import { showSuccess } from '@/utils/toast';

interface TodayTask {
  id: string;
  tipologia: 'Chiamata' | 'WhatsApp' | 'Appuntamento';
  stato: string;
  ora: string | null;
  nota: string | null;
  leads: { nome: string; cognome: string } | null;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    leads: 0,
    properties: 0,
    appointments: 0,
    sold: 0
  });
  const [todayTasks, setTodayTasks] = useState<TodayTask[]>([]);
  const [loadingWidget, setLoadingWidget] = useState(true);
  const [fabOpen, setFabOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);

  // Mock data per i grafici (in un'app reale verrebbero aggregati da Supabase)
  const appointmentData = [
    { name: 'Lun', visite: 4 },
    { name: 'Mar', visite: 7 },
    { name: 'Mer', visite: 5 },
    { name: 'Gio', visite: 8 },
    { name: 'Ven', visite: 6 },
    { name: 'Sab', visite: 3 },
    { name: 'Dom', visite: 0 },
  ];

  useEffect(() => {
    const fetchStats = async () => {
      const { count: leadsCount } = await supabase.from('leads').select('*', { count: 'exact', head: true });
      const { count: propCount } = await supabase.from('immobili').select('*', { count: 'exact', head: true }).neq('stato', 'Venduto');
      const { count: appCount } = await supabase.from('appuntamenti').select('*', { count: 'exact', head: true });
      const { count: soldCount } = await supabase.from('immobili').select('*', { count: 'exact', head: true }).eq('stato', 'Venduto');

      setStats({
        leads: leadsCount || 0,
        properties: propCount || 0,
        appointments: appCount || 0,
        sold: soldCount || 0
      });
    };
    fetchStats();
  }, []);

  useEffect(() => {
    const fetchTodayTasks = async () => {
      setLoadingWidget(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoadingWidget(false); return; }
      const today = format(new Date(), 'yyyy-MM-dd');
      const { data } = await supabase
        .from('tasks')
        .select('id, tipologia, stato, ora, nota, leads(nome, cognome)')
        .eq('data', today)
        .eq('agente_id', user.id)
        .order('ora', { ascending: true, nullsFirst: false })
        .limit(5);
      setTodayTasks((data as any) || []);
      setLoadingWidget(false);
    };
    fetchTodayTasks();
  }, []);

  const toggleTaskComplete = async (task: TodayTask) => {
    const newStato = task.stato === 'Completata' ? 'Da fare' : 'Completata';
    setTodayTasks(prev => prev.map(t => t.id === task.id ? { ...t, stato: newStato } : t));
    await supabase.from('tasks').update({ stato: newStato }).eq('id', task.id);
  };

  const kpis = [
    { label: 'Nuovi Lead', value: stats.leads, icon: Users, trend: '+12%', color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'In Vendita', value: stats.properties, icon: Home, trend: '+2', color: 'text-[#94b0ab]', bg: 'bg-[#94b0ab]/10' },
    { label: 'Appuntamenti', value: stats.appointments, icon: Calendar, trend: 'Oggi: 3', color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Venduti', value: stats.sold, icon: CheckCircle2, trend: 'Mese: 4', color: 'text-emerald-600', bg: 'bg-emerald-50' },
  ];

  return (
    <AdminLayout>
      <div className="mb-10">
        <h1 className="text-4xl font-extrabold tracking-tight text-gray-900">Smart Analytics</h1>
        <p className="text-gray-500 mt-1 font-medium">Panoramica delle performance e dell'attività operativa.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        {kpis.map((kpi, i) => (
          <Card key={i} className="border-none shadow-sm rounded-[2rem] overflow-hidden group hover:shadow-md transition-all">
            <CardContent className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div className={cn("p-3 rounded-2xl", kpi.bg)}>
                  <kpi.icon className={cn("w-6 h-6", kpi.color)} />
                </div>
                <Badge variant="outline" className="border-none bg-gray-50 text-gray-400 font-bold text-[10px]">
                  {kpi.trend}
                </Badge>
              </div>
              <div>
                <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">{kpi.label}</p>
                <h3 className="text-3xl font-black text-gray-900 mt-1">{kpi.value}</h3>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Bar Chart - Appuntamenti */}
        <Card className="lg:col-span-2 border-none shadow-sm rounded-[2.5rem] p-8">
          <CardHeader className="px-0 pt-0 pb-8">
            <CardTitle className="text-xl font-bold">Attività Settimanale</CardTitle>
            <CardDescription>Numero di visite e appuntamenti fissati negli ultimi 7 giorni.</CardDescription>
          </CardHeader>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={appointmentData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#9ca3af', fontSize: 12, fontWeight: 600 }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#9ca3af', fontSize: 12, fontWeight: 600 }}
                />
                <Tooltip
                  cursor={{ fill: '#f9fafb' }}
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar
                  dataKey="visite"
                  fill="#94b0ab"
                  radius={[6, 6, 0, 0]}
                  barSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Task di oggi widget */}
        <Card className="border-none shadow-sm rounded-[2.5rem] p-8">
          <CardHeader className="px-0 pt-0 pb-6">
            <CardTitle className="text-xl font-bold">Task di oggi</CardTitle>
            <CardDescription>Le tue attività pianificate per oggi.</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {loadingWidget ? (
              <div className="py-8 text-center text-gray-300 animate-pulse text-sm">Caricamento...</div>
            ) : todayTasks.length === 0 ? (
              <div className="py-8 flex flex-col items-center gap-2 text-center">
                <CheckCircle2 className="text-[#94b0ab] w-10 h-10" />
                <p className="text-sm text-gray-400 font-medium">Nessuna task per oggi 🎉</p>
              </div>
            ) : (
              <div className="space-y-3">
                {todayTasks.map(task => {
                  const cfg = TIPOLOGIA_CONFIG[task.tipologia];
                  const Icon = cfg.icon;
                  const isComplete = task.stato === 'Completata';
                  return (
                    <div
                      key={task.id}
                      className={cn('flex items-center gap-3 py-1 transition-opacity', isComplete && 'opacity-50')}
                    >
                      <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', cfg.bg)}>
                        <Icon size={14} className={cfg.color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-sm font-semibold text-gray-900 truncate', isComplete && 'line-through')}>
                          {task.leads?.nome} {task.leads?.cognome}
                        </p>
                        {task.ora && (
                          <p className="text-xs text-gray-400">{task.ora.slice(0, 5)}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleTaskComplete(task)}
                        className={cn(
                          'w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
                          isComplete
                            ? 'bg-[#94b0ab] border-[#94b0ab]'
                            : 'border-gray-300 hover:border-[#94b0ab]'
                        )}
                      >
                        {isComplete && <Check size={12} className="text-white" />}
                      </button>
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={() => navigate('/tasks')}
                  className="mt-2 text-xs font-bold text-[#94b0ab] hover:underline"
                >
                  Vedi tutte →
                </button>
              </div>
            )}
          </CardContent>
        </Card>
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
    </AdminLayout>
  );
};

export default Dashboard;
