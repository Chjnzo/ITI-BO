"use client";

import React, { useEffect, useState, useCallback } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { it } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { supabase } from '@/lib/supabase';
import { showError, showSuccess } from '@/utils/toast';
import { Button } from '@/components/ui/button';
import { Plus, Calendar as CalendarIcon, Clock, User, Home as HomeIcon } from 'lucide-react';
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter 
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from "@/components/ui/select";

const locales = {
  'it': it,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

const Agenda = () => {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  
  // Form Data
  const [leads, setLeads] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [form, setForm] = useState({
    titolo: '',
    data: format(new Date(), 'yyyy-MM-dd'),
    ora_inizio: '10:00',
    ora_fine: '11:00',
    cliente_id: '',
    immobile_id: '',
    tipo: 'Visita'
  });

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('appuntamenti')
      .select(`
        *,
        leads (nome, cognome),
        immobili (titolo)
      `);

    if (error) {
      console.error("Errore fetch appuntamenti:", error);
    } else {
      const formatted = data.map(event => ({
        id: event.id,
        title: `${event.tipo}: ${event.titolo}`,
        start: new Date(event.data_inizio),
        end: new Date(event.data_fine),
        resource: event
      }));
      setEvents(formatted);
    }
    setLoading(false);
  }, []);

  const fetchResources = async () => {
    const { data: lData } = await supabase.from('leads').select('id, nome, cognome').order('cognome');
    const { data: iData } = await supabase.from('immobili').select('id, titolo').neq('stato', 'Venduto').order('titolo');
    setLeads(lData || []);
    setProperties(iData || []);
  };

  useEffect(() => {
    fetchEvents();
    fetchResources();
  }, [fetchEvents]);

  const handleCreate = async () => {
    if (!form.titolo || !form.data) {
      showError("Titolo e data sono obbligatori");
      return;
    }

    const start = new Date(`${form.data}T${form.ora_inizio}:00`);
    const end = new Date(`${form.data}T${form.ora_fine}:00`);

    const payload = {
      titolo: form.titolo,
      data_inizio: start.toISOString(),
      data_fine: end.toISOString(),
      cliente_id: form.cliente_id || null,
      immobile_id: form.immobile_id || null,
      tipo: form.tipo
    };

    const { error } = await supabase.from('appuntamenti').insert([payload]);

    if (error) {
      showError("Errore nel salvataggio: " + error.message);
    } else {
      showSuccess("Appuntamento fissato");
      setIsCreateOpen(false);
      fetchEvents();
      setForm({
        titolo: '',
        data: format(new Date(), 'yyyy-MM-dd'),
        ora_inizio: '10:00',
        ora_fine: '11:00',
        cliente_id: '',
        immobile_id: '',
        tipo: 'Visita'
      });
    }
  };

  return (
    <AdminLayout>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900">Agenda Operativa</h1>
          <p className="text-gray-500 mt-1 font-medium">Pianifica visite, incontri e attività dell'agenzia.</p>
        </div>
        
        <Button 
          onClick={() => setIsCreateOpen(true)}
          className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-2xl px-8 h-14 shadow-lg shadow-[#94b0ab]/20 font-bold transition-all"
        >
          <Plus className="mr-2" size={20} /> Nuovo Appuntamento
        </Button>
      </div>

      <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100 h-[800px]">
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          style={{ height: '100%' }}
          culture="it"
          messages={{
            next: "Successivo",
            previous: "Precedente",
            today: "Oggi",
            month: "Mese",
            week: "Settimana",
            day: "Giorno",
            agenda: "Agenda",
            date: "Data",
            time: "Ora",
            event: "Evento",
            noEventsInRange: "Nessun appuntamento in questo periodo."
          }}
          views={[Views.MONTH, Views.WEEK, Views.DAY]}
          eventPropGetter={(event) => ({
            className: "bg-[#94b0ab] border-none rounded-lg px-2 py-1 text-xs font-bold shadow-sm"
          })}
        />
      </div>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-xl rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden">
          <DialogHeader className="px-8 pt-8 pb-4">
            <DialogTitle className="text-2xl font-bold">Nuovo Appuntamento</DialogTitle>
          </DialogHeader>
          
          <div className="p-8 space-y-6">
            <div className="space-y-3">
              <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Titolo / Oggetto</Label>
              <Input 
                placeholder="Es: Visita Bilocale via Roma" 
                value={form.titolo} 
                onChange={(e) => setForm({...form, titolo: e.target.value})}
                className="h-14 rounded-2xl border-gray-100"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Tipo</Label>
                <Select onValueChange={(v) => setForm({...form, tipo: v})} value={form.tipo}>
                  <SelectTrigger className="h-14 rounded-2xl border-gray-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    <SelectItem value="Visita">Visita Immobile</SelectItem>
                    <SelectItem value="Incontro">Incontro in Ufficio</SelectItem>
                    <SelectItem value="Altro">Altro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Data</Label>
                <Input 
                  type="date" 
                  value={form.data} 
                  onChange={(e) => setForm({...form, data: e.target.value})}
                  className="h-14 rounded-2xl border-gray-100"
                />
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Ora Inizio</Label>
                <Input 
                  type="time" 
                  value={form.ora_inizio} 
                  onChange={(e) => setForm({...form, ora_inizio: e.target.value})}
                  className="h-14 rounded-2xl border-gray-100"
                />
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Ora Fine</Label>
                <Input 
                  type="time" 
                  value={form.ora_fine} 
                  onChange={(e) => setForm({...form, ora_fine: e.target.value})}
                  className="h-14 rounded-2xl border-gray-100"
                />
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Cliente (Lead)</Label>
              <Select onValueChange={(v) => setForm({...form, cliente_id: v})} value={form.cliente_id}>
                <SelectTrigger className="h-14 rounded-2xl border-gray-100">
                  <SelectValue placeholder="Seleziona cliente..." />
                </SelectTrigger>
                <SelectContent className="rounded-2xl">
                  {leads.map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.cognome} {l.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Immobile</Label>
              <Select onValueChange={(v) => setForm({...form, immobile_id: v})} value={form.immobile_id}>
                <SelectTrigger className="h-14 rounded-2xl border-gray-100">
                  <SelectValue placeholder="Seleziona immobile..." />
                </SelectTrigger>
                <SelectContent className="rounded-2xl">
                  {properties.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.titolo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="p-8 bg-gray-50/50">
            <Button variant="ghost" onClick={() => setIsCreateOpen(false)} className="rounded-xl font-bold">Annulla</Button>
            <Button 
              onClick={handleCreate}
              className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl px-10 h-12 font-bold transition-all"
            >
              Salva Appuntamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default Agenda;