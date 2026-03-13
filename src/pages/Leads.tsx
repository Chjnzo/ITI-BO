"use client";

import React, { useEffect, useState, useCallback } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';
import { showError, showSuccess } from '@/utils/toast';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle,
  SheetDescription
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  Phone, Mail, Home as HomeIcon, 
  User, Euro, Search, MessageSquare, Save,
  Calendar, GripVertical
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

const COLUMNS = [
  { id: 'Nuovo', label: 'Nuovi Lead', color: 'bg-blue-50/50 border-blue-100 text-blue-700' },
  { id: 'In Trattativa', label: 'In Trattativa', color: 'bg-amber-50/50 border-amber-100 text-amber-700' },
  { id: 'Visita Fissata', label: 'Visita Fissata', color: 'bg-purple-50/50 border-purple-100 text-purple-700' },
  { id: 'Chiuso', label: 'Chiusi', color: 'bg-emerald-50/50 border-emerald-100 text-emerald-700' }
];

const Leads = () => {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('leads')
      .select('*, immobili(titolo)')
      .order('created_at', { ascending: false });
    
    if (error) showError("Errore nel caricamento CRM");
    else setLeads(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const newStatus = destination.droppableId;
    
    // Update local state immediately for snappy UI
    const updatedLeads = Array.from(leads);
    const leadIndex = updatedLeads.findIndex(l => l.id === draggableId);
    if (leadIndex !== -1) {
      updatedLeads[leadIndex] = { ...updatedLeads[leadIndex], stato: newStatus };
      setLeads(updatedLeads);
    }

    // Update Supabase
    const { error } = await supabase
      .from('leads')
      .update({ stato: newStatus })
      .eq('id', draggableId);
    
    if (error) {
      showError("Errore nell'aggiornamento stato");
      fetchLeads(); // Revert on error
    } else {
      showSuccess(`Lead spostato in ${newStatus}`);
    }
  };

  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead) return;
    
    setIsSaving(true);
    const { error } = await supabase
      .from('leads')
      .update({
        budget: parseFloat(selectedLead.budget) || null,
        tipologia_ricerca: selectedLead.tipologia_ricerca,
        note_interne: selectedLead.note_interne,
        nome: selectedLead.nome,
        cognome: selectedLead.cognome,
        telefono: selectedLead.telefono,
        email: selectedLead.email
      })
      .eq('id', selectedLead.id);

    if (error) {
      showError("Errore nel salvataggio");
    } else {
      showSuccess("Scheda cliente aggiornata");
      fetchLeads();
      setSelectedLead(null);
    }
    setIsSaving(false);
  };

  const getLeadsByStatus = (status: string) => {
    return leads.filter(l => l.stato === status);
  };

  return (
    <AdminLayout>
      <div className="mb-10">
        <h1 className="text-4xl font-extrabold tracking-tight text-gray-900">CRM Leads</h1>
        <p className="text-gray-500 mt-1 font-medium">Trascina i lead per gestire il funnel di vendita.</p>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 h-[calc(100vh-250px)] min-h-[600px]">
          {COLUMNS.map((col) => (
            <div key={col.id} className="flex flex-col h-full">
              <div className={cn(
                "flex items-center justify-between px-5 py-4 rounded-2xl border mb-4",
                col.color
              )}>
                <h2 className="font-black uppercase tracking-widest text-xs">{col.label}</h2>
                <Badge variant="outline" className="bg-white/50 border-none font-bold">
                  {getLeadsByStatus(col.id).length}
                </Badge>
              </div>

              <Droppable droppableId={col.id}>
                {(provided, snapshot) => (
                  <div 
                    {...provided.droppableProps}
                    ref={provided.innerRef}
                    className={cn(
                      "flex-1 bg-gray-50/50 rounded-[2rem] p-4 border border-gray-100 overflow-y-auto space-y-4 scrollbar-hide transition-colors",
                      snapshot.isDraggingOver && "bg-[#94b0ab]/5 border-[#94b0ab]/20"
                    )}
                  >
                    {loading ? (
                      <div className="py-10 text-center text-gray-300 animate-pulse font-medium">Caricamento...</div>
                    ) : getLeadsByStatus(col.id).length === 0 ? (
                      <div className="py-10 text-center text-gray-300 italic text-sm">Nessun lead</div>
                    ) : getLeadsByStatus(col.id).map((lead, index) => (
                      <Draggable key={lead.id} draggableId={lead.id} index={index}>
                        {(provided, snapshot) => (
                          <div 
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            onClick={() => setSelectedLead(lead)}
                            className={cn(
                              "bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md hover:border-[#94b0ab]/30 transition-all cursor-pointer group relative",
                              snapshot.isDragging && "shadow-2xl border-[#94b0ab] rotate-2 scale-105 z-50"
                            )}
                          >
                            <div className="absolute top-5 right-4 text-gray-200 group-hover:text-gray-400 transition-colors">
                              <GripVertical size={16} />
                            </div>

                            <div className="flex justify-between items-start mb-3 pr-6">
                              <div className="font-bold text-gray-900 group-hover:text-[#94b0ab] transition-colors">
                                {lead.nome} {lead.cognome}
                              </div>
                            </div>

                            <div className="space-y-2 mb-4">
                              <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase">
                                <Calendar size={12} />
                                {format(new Date(lead.created_at), 'dd MMM yyyy', { locale: it })}
                              </div>
                              {lead.immobili && (
                                <div className="flex items-center gap-2 text-[10px] font-bold text-[#94b0ab] bg-[#94b0ab]/5 px-2 py-1 rounded-lg truncate">
                                  <HomeIcon size={10} />
                                  {lead.immobili.titolo}
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-2 text-xs text-gray-500 pt-3 border-t border-gray-50">
                              <Phone size={12} className="text-gray-300" />
                              {lead.telefono || 'N/D'}
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          ))}
        </div>
      </DragDropContext>

      {/* Lead Detail Sheet (Scheda Cliente) */}
      <Sheet open={!!selectedLead} onOpenChange={(open) => !open && setSelectedLead(null)}>
        <SheetContent className="w-full sm:max-w-xl border-none shadow-2xl p-0 overflow-hidden flex flex-col">
          {selectedLead && (
            <form onSubmit={handleSaveDetails} className="flex flex-col h-full">
              <SheetHeader className="px-8 pt-10 pb-6 border-b bg-white shrink-0">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-16 h-16 rounded-2xl bg-[#94b0ab]/10 text-[#94b0ab] flex items-center justify-center">
                    <User size={32} />
                  </div>
                  <div>
                    <SheetTitle className="text-2xl font-bold text-gray-900">
                      {selectedLead.nome} {selectedLead.cognome}
                    </SheetTitle>
                    <SheetDescription className="text-sm text-gray-400 font-medium">
                      Lead acquisito il {format(new Date(selectedLead.created_at), 'PPP', { locale: it })}
                    </SheetDescription>
                  </div>
                </div>
                <Badge className={cn(
                  "w-fit px-4 py-1.5 rounded-full font-bold uppercase tracking-widest text-[10px]",
                  COLUMNS.find(c => c.id === selectedLead.stato)?.color
                )}>
                  {selectedLead.stato}
                </Badge>
              </SheetHeader>
              
              <div className="flex-1 overflow-y-auto p-8 space-y-10">
                {/* Contact Info */}
                <section className="space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Contatti e Riferimenti</h3>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-gray-500">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                        <Input 
                          value={selectedLead.email || ''} 
                          onChange={(e) => setSelectedLead({...selectedLead, email: e.target.value})}
                          className="h-12 pl-12 rounded-xl border-gray-100 focus:ring-[#94b0ab]"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-gray-500">Telefono</Label>
                      <div className="relative">
                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                        <Input 
                          value={selectedLead.telefono || ''} 
                          onChange={(e) => setSelectedLead({...selectedLead, telefono: e.target.value})}
                          className="h-12 pl-12 rounded-xl border-gray-100 focus:ring-[#94b0ab]"
                        />
                      </div>
                    </div>
                  </div>
                </section>

                {/* Property Info */}
                {selectedLead.immobili && (
                  <section className="p-5 bg-gray-50 rounded-2xl border border-gray-100">
                    <h3 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3">Immobile di Interesse</h3>
                    <div className="flex items-center gap-3 text-[#94b0ab]">
                      <HomeIcon size={20} />
                      <span className="font-bold text-gray-900">{selectedLead.immobili.titolo}</span>
                    </div>
                  </section>
                )}

                {/* CRM Fields */}
                <section className="space-y-6">
                  <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Dati CRM</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-gray-500">Budget Massimo (€)</Label>
                      <div className="relative">
                        <Euro className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                        <Input 
                          type="number"
                          value={selectedLead.budget || ''} 
                          onChange={(e) => setSelectedLead({...selectedLead, budget: e.target.value})}
                          placeholder="Es: 250000"
                          className="h-12 pl-12 rounded-xl border-gray-100 focus:ring-[#94b0ab]"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-gray-500">Tipologia Ricerca</Label>
                      <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                        <Input 
                          value={selectedLead.tipologia_ricerca || ''} 
                          onChange={(e) => setSelectedLead({...selectedLead, tipologia_ricerca: e.target.value})}
                          placeholder="Es: Trilocale"
                          className="h-12 pl-12 rounded-xl border-gray-100 focus:ring-[#94b0ab]"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-gray-500 flex items-center gap-2">
                      <MessageSquare size={14} /> Note Interne (Private)
                    </Label>
                    <Textarea 
                      value={selectedLead.note_interne || ''} 
                      onChange={(e) => setSelectedLead({...selectedLead, note_interne: e.target.value})}
                      placeholder="Aggiungi dettagli sulla trattativa..."
                      className="min-h-[150px] rounded-2xl border-gray-100 p-4 focus:ring-[#94b0ab]"
                    />
                  </div>
                </section>

                {/* Original Message */}
                <section className="p-5 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2 block">Messaggio Originale</Label>
                  <p className="text-sm text-gray-500 leading-relaxed italic">
                    "{selectedLead.messaggio || 'Nessun messaggio'}"
                  </p>
                </section>
              </div>

              <div className="p-8 bg-white border-t shrink-0">
                <Button 
                  type="submit"
                  disabled={isSaving}
                  className="w-full bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-2xl h-14 font-bold shadow-lg shadow-[#94b0ab]/20 transition-all active:scale-[0.98]"
                >
                  {isSaving ? "Salvataggio..." : <><Save size={20} className="mr-2" /> Salva Modifiche</>}
                </Button>
              </div>
            </form>
          )}
        </SheetContent>
      </Sheet>
    </AdminLayout>
  );
};

export default Leads;