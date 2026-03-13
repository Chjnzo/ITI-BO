"use client";

import React, { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend 
} from 'recharts';
import { supabase } from '@/lib/supabase';
import { 
  Users, Home, Calendar, TrendingUp, 
  ArrowUpRight, MessageSquare, CheckCircle2 
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

const Dashboard = () => {
  const [stats, setStats] = useState({
    leads: 0,
    properties: 0,
    appointments: 0,
    sold: 0
  });

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

  const leadStatusData = [
    { name: 'Nuovi', value: 40, color: '#94b0ab' },
    { name: 'In Trattativa', value: 30, color: '#fcd34d' },
    { name: 'Visita Fissata', value: 20, color: '#a78bfa' },
    { name: 'Chiusi', value: 10, color: '#10b981' },
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

        {/* Pie Chart - Lead Status */}
        <Card className="border-none shadow-sm rounded-[2.5rem] p-8">
          <CardHeader className="px-0 pt-0 pb-8">
            <CardTitle className="text-xl font-bold">Stato dei Lead</CardTitle>
            <CardDescription>Distribuzione dei contatti nel funnel.</CardDescription>
          </CardHeader>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={leadStatusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={110}
                  paddingAngle={8}
                  dataKey="value"
                >
                  {leadStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Legend 
                  verticalAlign="bottom" 
                  height={36}
                  iconType="circle"
                  formatter={(value) => <span className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-2">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default Dashboard;