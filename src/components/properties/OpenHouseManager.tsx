"use client";

import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { CalendarIcon, Users, Clock, Trash2, CheckCircle2, Minus, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface OpenHouseManagerProps {
  property: any;
  onClose: () => void;
}

const OpenHouseManager = ({ property, onClose }: OpenHouseManagerProps) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openHouse, setOpenHouse] = useState<any>(null);
  const [attendees, setAttendees] = useState<any[]>([]);

  // Form State
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("12:00");
  const [totalSpots, setTotalSpots] = useState(15);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: ohData, error: ohError } = await supabase
        .from('open_houses')
        .select('*')
        .eq('immobile_id', property.id)
        .order('data_evento', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (ohError) throw ohError;

      if (ohData) {
        setOpenHouse(ohData);
        setDate(new Date(ohData.data_evento));
        setStartTime(ohData.ora_inizio.slice(0, 5));
        setEndTime(ohData.ora_fine.slice(0, 5));
        setTotalSpots(ohData.posti_totali);

        const { data: attData, error: attError } = await supabase
          .from('prenotazioni_oh')
          .select('*')
          .eq('open_house_id', ohData.id)
          .order('created_at', { ascending: true });

        if (attError) throw attError;
        setAttendees(attData || []);
      }
    } catch (error: any) {
      console.error("Errore fetch OH:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (property?.id) fetchData();
  }, [property?.id]);

  const handleSave = async () => {
    if (!date) {
      showError("Seleziona una data per l'evento");
      return;
    }

    setSaving(true);
    // Formattazione rigorosa per Postgres time field
    const payload = {
      immobile_id: property.id,
      data_evento: format(date, 'yyyy-MM-dd'),
      ora_inizio: startTime.length === 5 ? `${startTime}:00` : startTime,
      ora_fine: endTime.length === 5 ? `${endTime}:00` : endTime,
      posti_totali: parseInt(totalSpots.toString())
    };

    try {
      if (openHouse) {
        const { error } = await supabase
          .from('open_houses')
          .update(payload)
          .eq('id', openHouse.id);
        if (error) throw error;
        showSuccess("Open House aggiornato");
      } else {
        const { error } = await supabase
          .from('open_houses')
          .insert([payload]);
        if (error) throw error;
        showSuccess("Open House creato");
      }
      fetchData();
    } catch (error: any) {
      showError("Errore salvataggio: " + error.message);
      console.error("Errore salvataggio OH:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!openHouse) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('open_houses')
        .delete()
        .eq('id', openHouse.id);
      
      if (error) throw error;
      showSuccess("Evento rimosso correttamente");
      setOpenHouse(null);
      setDate(undefined);
      setAttendees([]);
    } catch (error: any) {
      showError("Errore eliminazione: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-12 text-center text-gray-400">Inizializzazione manager...</div>;

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-8 py-6 border-b flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Gestione Open House</h2>
          <p className="text-sm text-gray-500">
            {property.titolo}
            {property.proprietario && (
              <span className="ml-2 text-gray-400">· Proprietario: <span className="font-semibold text-gray-600">{property.proprietario}</span></span>
            )}
          </p>
        </div>
        {openHouse && (
          <Badge variant="outline" className="bg-[#94b0ab]/10 text-[#94b0ab] border-[#94b0ab]/20 px-4 py-1 rounded-full font-bold">
            <Users size={14} className="mr-2" /> {attendees.length} / {totalSpots} Iscritti
          </Badge>
        )}
      </div>

      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="imposta" className="h-full flex flex-col">
          <div className="px-8 pt-4">
            <TabsList className="bg-gray-100/50 p-1 rounded-xl w-full flex justify-start gap-1">
              <TabsTrigger value="imposta" className="flex-1 rounded-lg font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">
                Configura Evento
              </TabsTrigger>
              <TabsTrigger value="iscritti" className="flex-1 rounded-lg font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm" disabled={!openHouse}>
                Iscritti ({attendees.length})
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto p-8">
            <TabsContent value="imposta" className="mt-0 space-y-8 animate-in fade-in slide-in-from-bottom-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-3">
                  <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Data dell'Evento</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full h-14 justify-start text-left font-normal rounded-2xl border-gray-100 bg-gray-50/50 hover:bg-gray-100",
                          !date && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-3 h-5 w-5 text-[#94b0ab]" />
                        {date ? format(date, "PPP", { locale: it }) : "Seleziona data"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 border-none rounded-2xl shadow-xl" align="start">
                      <Calendar
                        mode="single"
                        selected={date}
                        onSelect={setDate}
                        initialFocus
                        locale={it}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-3">
                  <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Posti Totali</Label>
                  <div className="flex items-center gap-4 bg-gray-50 p-2 rounded-2xl border border-gray-100">
                    <Button variant="ghost" size="icon" onClick={() => setTotalSpots(Math.max(1, totalSpots - 1))}><Minus size={18} /></Button>
                    <Input 
                      type="number" 
                      value={totalSpots} 
                      onChange={(e) => setTotalSpots(parseInt(e.target.value) || 1)}
                      className="border-none bg-transparent text-center font-bold text-lg shadow-none focus-visible:ring-0"
                    />
                    <Button variant="ghost" size="icon" onClick={() => setTotalSpots(totalSpots + 1)}><Plus size={18} /></Button>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Ora Inizio</Label>
                  <div className="relative">
                    <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-[#94b0ab]" size={20} />
                    <Input 
                      type="time" 
                      value={startTime} 
                      onChange={(e) => setStartTime(e.target.value)}
                      className="h-14 pl-12 rounded-2xl border-gray-100"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Ora Fine</Label>
                  <div className="relative">
                    <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-[#94b0ab]" size={20} />
                    <Input 
                      type="time" 
                      value={endTime} 
                      onChange={(e) => setEndTime(e.target.value)}
                      className="h-14 pl-12 rounded-2xl border-gray-100"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 pt-6 border-t">
                <Button 
                  onClick={handleSave} 
                  disabled={saving}
                  className="flex-1 bg-[#94b0ab] hover:bg-[#7a948f] text-white h-14 rounded-2xl font-bold shadow-lg shadow-[#94b0ab]/20"
                >
                  <CheckCircle2 className="mr-2" size={20} />
                  {openHouse ? "Aggiorna Evento" : "Crea Open House"}
                </Button>
                {openHouse && (
                  <Button 
                    variant="outline" 
                    onClick={handleDelete}
                    disabled={saving}
                    className="h-14 px-6 rounded-2xl border-red-100 text-red-500 hover:bg-red-50 hover:text-red-600 font-bold"
                  >
                    <Trash2 size={20} />
                  </Button>
                )}
              </div>
            </TabsContent>

            <TabsContent value="iscritti" className="mt-0 animate-in fade-in slide-in-from-bottom-2">
              <div className="bg-gray-50/50 rounded-2xl border border-gray-100 overflow-hidden">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-gray-100 bg-white">
                      <th className="px-6 py-4 text-xs font-bold uppercase text-gray-400">Nome</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase text-gray-400">Contatti</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase text-gray-400 text-right">Orario Scelto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {attendees.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-6 py-12 text-center text-gray-400 font-medium italic">Nessun iscritto al momento.</td>
                      </tr>
                    ) : attendees.map((att) => (
                      <tr key={att.id} className="hover:bg-white transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-bold text-gray-900">{att.nome}</div>
                          <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">
                            {format(new Date(att.created_at), 'dd/MM/yyyy')}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-600">{att.email}</div>
                          <div className="text-sm text-gray-400">{att.telefono || '-'}</div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Badge variant="outline" className="bg-[#94b0ab]/5 text-[#94b0ab] border-[#94b0ab]/10 font-black">
                            {att.orario_scelto?.slice(0, 5) || 'N/D'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>

      <div className="p-6 border-t bg-gray-50/30 flex justify-end">
        <Button variant="ghost" onClick={onClose} className="rounded-xl font-bold text-gray-500">Chiudi</Button>
      </div>
    </div>
  );
};

export default OpenHouseManager;