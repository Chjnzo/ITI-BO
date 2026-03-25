"use client";

import React, { useEffect, useState, useCallback } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Button } from '@/components/ui/button';
import { 
  Plus, Users, Clock, Trash2, 
  MapPin, Calendar as CalendarIcon
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter 
} from '@/components/ui/dialog';
import { Sheet } from '@/components/ui/sheet';
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from "@/components/ui/select";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, isBefore, startOfDay } from "date-fns";
import { it } from "date-fns/locale";
import { supabase } from '@/lib/supabase';
import { showError, showSuccess } from '@/utils/toast';
import { cn } from '@/lib/utils';
import AttendeesSheet from '@/components/properties/AttendeesSheet';

const OpenHouses = () => {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("upcoming");
  
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [properties, setProperties] = useState<any[]>([]);
  const [newDate, setNewDate] = useState<Date | undefined>(undefined);
  const [form, setForm] = useState({
    immobile_id: '',
    ora_inizio: '10:00',
    ora_fine: '12:00',
    posti_totali: 15
  });

  const [selectedEvent, setSelectedEvent] = useState<any>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('open_houses')
      .select(`
        *,
        immobili (
          id,
          titolo,
          citta,
          zona,
          copertina_url
        )
      `)
      .order('data_evento', { ascending: true });

    if (error) {
      showError("Errore nel caricamento eventi: " + error.message);
    } else {
      setEvents(data || []);
    }
    setLoading(false);
  }, []);

  const fetchAvailableProperties = async () => {
    const { data, error } = await supabase
      .from('immobili')
      .select('id, titolo')
      .neq('stato', 'Venduto')
      .order('titolo');
    
    if (error) console.error("Errore fetch immobili:", error);
    setProperties(data || []);
  };

  useEffect(() => {
    fetchEvents();
    fetchAvailableProperties();
  }, [fetchEvents]);

  const handleCreate = async () => {
    if (!form.immobile_id || !newDate) {
      showError("Seleziona un immobile e una data validi");
      return;
    }

    // Assicuriamoci che l'orario sia nel formato corretto
    const payload = {
      immobile_id: form.immobile_id,
      data_evento: format(newDate, 'yyyy-MM-dd'),
      ora_inizio: form.ora_inizio.length === 5 ? `${form.ora_inizio}:00` : form.ora_inizio,
      ora_fine: form.ora_fine.length === 5 ? `${form.ora_fine}:00` : form.ora_fine,
      posti_totali: parseInt(form.posti_totali.toString())
    };

    const { error } = await supabase.from('open_houses').insert([payload]);

    if (error) {
      showError("Errore database: " + error.message);
      console.error("Errore creazione OH:", error);
    } else {
      showSuccess("Evento creato correttamente");
      setIsCreateOpen(false);
      fetchEvents();
      setNewDate(undefined);
      setForm({
        immobile_id: '',
        ora_inizio: '10:00',
        ora_fine: '12:00',
        posti_totali: 15
      });
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('open_houses').delete().eq('id', id);
    if (error) showError("Errore eliminazione: " + error.message);
    else {
      showSuccess("Evento rimosso");
      fetchEvents();
    }
  };

  const filteredEvents = events.filter(event => {
    const eventDate = startOfDay(new Date(event.data_evento));
    const today = startOfDay(new Date());
    return filter === "upcoming" ? !isBefore(eventDate, today) : isBefore(eventDate, today);
  });

  return (
    <AdminLayout fullHeight>
      <div className="flex flex-col flex-1 overflow-hidden min-h-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-6 shrink-0">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900">Gestione Open House</h1>
          <p className="text-gray-500 mt-1 font-medium">Pianifica e monitora le visite guidate.</p>
        </div>
        
        <Button 
          onClick={() => setIsCreateOpen(true)}
          className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-2xl px-8 h-14 shadow-lg shadow-[#94b0ab]/20 font-bold transition-all"
        >
          <Plus className="mr-2" size={20} /> Nuovo Evento
        </Button>
      </div>

      <div className="mb-6 shrink-0">
        <Tabs value={filter} onValueChange={setFilter} className="w-auto">
          <TabsList className="grid grid-cols-2 w-[240px] rounded-full p-1 bg-muted/50 border border-gray-100">
            <TabsTrigger value="upcoming" className="rounded-full px-5 text-xs font-semibold data-[state=active]:bg-[#94b0ab] data-[state=active]:text-white">
              In Programma
            </TabsTrigger>
            <TabsTrigger value="past" className="rounded-full px-5 text-xs font-semibold data-[state=active]:bg-[#94b0ab] data-[state=active]:text-white">
              Passati
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 pb-4">
      <div className="grid grid-cols-1 gap-6">
        {loading ? (
          <div className="p-20 text-center text-gray-400 font-medium">Caricamento eventi...</div>
        ) : filteredEvents.length === 0 ? (
          <div className="p-20 text-center text-gray-400 bg-white rounded-[2.5rem] border border-gray-100 italic">
            Nessun evento {filter === "upcoming" ? "in programma" : "passato"}.
          </div>
        ) : filteredEvents.map((event) => (
          <div key={event.id} className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-gray-100 hover:shadow-md transition-all group">
            <div className="flex flex-col lg:flex-row items-center gap-8">
              <div className="flex flex-col items-center justify-center w-24 h-24 rounded-[1.8rem] bg-gray-50 text-[#94b0ab] shrink-0 border border-gray-100">
                <span className="text-[10px] font-black uppercase tracking-widest">{format(new Date(event.data_evento), 'MMM', { locale: it })}</span>
                <span className="text-3xl font-black leading-none">{format(new Date(event.data_evento), 'dd')}</span>
                <span className="text-[10px] font-bold text-gray-400">{format(new Date(event.data_evento), 'yyyy')}</span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-[#94b0ab] mb-1">
                  <MapPin size={14} />
                  <span className="text-xs font-bold uppercase tracking-wider">{event.immobili?.citta}</span>
                </div>
                <h3 className="text-xl font-bold text-gray-900 truncate mb-2">{event.immobili?.titolo}</h3>
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center gap-2 text-gray-500 font-medium text-sm">
                    <Clock size={16} className="text-gray-300" />
                    {event.ora_inizio.slice(0, 5)} - {event.ora_fine.slice(0, 5)}
                  </div>
                  <div className="flex items-center gap-2 text-gray-500 font-medium text-sm">
                    <Users size={16} className="text-gray-300" />
                    Capienza: {event.posti_totali} persone
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 lg:border-l lg:pl-8 border-gray-100 w-full lg:w-auto justify-end">
                <Button 
                  variant="outline" 
                  onClick={() => setSelectedEvent(event)}
                  className="rounded-xl border-gray-200 font-bold hover:bg-[#94b0ab]/5 text-gray-600 hover:text-[#94b0ab] gap-2 h-12 px-6"
                >
                  <Users size={18} /> Vedi Iscritti
                </Button>
                <Button 
                  variant="ghost" 
                  onClick={() => handleDelete(event.id)}
                  className="rounded-xl text-red-500 hover:text-red-700 hover:bg-red-50 h-12 w-12 p-0"
                >
                  <Trash2 size={18} />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
      </div>
      </div>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-xl rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden">
          <DialogHeader className="px-8 pt-8 pb-4">
            <DialogTitle className="text-2xl font-bold">Nuovo Open House</DialogTitle>
          </DialogHeader>
          
          <div className="p-8 space-y-6">
            <div className="space-y-3">
              <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Seleziona Immobile</Label>
              <Select onValueChange={(v) => setForm({...form, immobile_id: v})} value={form.immobile_id}>
                <SelectTrigger className="h-14 rounded-2xl border-gray-100">
                  <SelectValue placeholder="Scegli un immobile..." />
                </SelectTrigger>
                <SelectContent className="rounded-2xl">
                  {properties.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.titolo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Data Evento</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full h-14 justify-start text-left font-normal rounded-2xl border-gray-100 bg-gray-50/50 hover:bg-gray-100",
                        !newDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-3 h-5 w-5 text-[#94b0ab]" />
                      {newDate ? format(newDate, "PPP", { locale: it }) : "Scegli data"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 border-none rounded-2xl shadow-xl" align="start">
                    <Calendar
                      mode="single"
                      selected={newDate}
                      onSelect={setNewDate}
                      initialFocus
                      locale={it}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Posti Totali</Label>
                <Input 
                  type="number" 
                  value={form.posti_totali} 
                  onChange={(e) => setForm({...form, posti_totali: parseInt(e.target.value) || 15})}
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
          </div>

          <DialogFooter className="p-8 bg-gray-50/50">
            <Button variant="ghost" onClick={() => setIsCreateOpen(false)} className="rounded-xl font-bold">Annulla</Button>
            <Button 
              onClick={handleCreate}
              className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl px-10 h-12 font-bold transition-all"
            >
              Crea Evento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={!!selectedEvent} onOpenChange={(o) => !o && setSelectedEvent(null)}>
        {selectedEvent && (
          <AttendeesSheet 
            openHouseId={selectedEvent.id} 
            propertyTitle={selectedEvent.immobili?.titolo} 
          />
        )}
      </Sheet>
    </AdminLayout>
  );
};

export default OpenHouses;