"use client";

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';
import { showError, showSuccess } from '@/utils/toast';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog';
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from "@/components/ui/select";
import {
  Phone, Home as HomeIcon,
  User, Search, MessageSquare, Save,
  Calendar, GripVertical, Plus, LayoutDashboard, List, ExternalLink,
  Filter, TrendingUp, History, Heart, UserCheck, Briefcase, Send
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

const COLUMNS = [
  { id: 'Nuovo', label: 'Nuovi Lead', color: 'bg-blue-50/50 border-blue-100 text-blue-700' },
  { id: 'In Trattativa', label: 'In Trattativa', color: 'bg-amber-50/50 border-amber-100 text-amber-700' },
  { id: 'Visita Fissata', label: 'Visita Fissata', color: 'bg-purple-50/50 border-purple-100 text-purple-700' },
  { id: 'Chiuso', label: 'Chiusi', color: 'bg-emerald-50/50 border-emerald-100 text-emerald-700' }
];

const AGENTS = ["Matteo", "Gabriele"];

const Leads = () => {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  
  // Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [agentFilter, setAgentFilter] = useState("Tutti");

  // Property Picker State
  const [isPropertyPickerOpen, setIsPropertyPickerOpen] = useState(false);
  const [allProperties, setAllProperties] = useState<any[]>([]);
  const [propertySearch, setPropertySearch] = useState('');
  const [isLoadingProperties, setIsLoadingProperties] = useState(false);

  // Notes / Storico State
  const [leadNotes, setLeadNotes] = useState<any[]>([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [newNoteAutore, setNewNoteAutore] = useState(AGENTS[0]);
  const [isSavingNote, setIsSavingNote] = useState(false);

  // New Lead Form State
  const [newLead, setNewLead] = useState({
    nome: '',
    cognome: '',
    email: '',
    telefono: '',
  });

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('leads')
      .select(`
        *,
        immobile_primo_contatto:immobili!immobile_id(id, titolo, prezzo, copertina_url, zona, citta),
        lead_immobili(
          id,
          stato_interesse,
          note,
          created_at,
          immobili(id, titolo, prezzo, copertina_url, zona, citta)
        )
      `)
      .order('created_at', { ascending: false });
    
    if (error) {
      showError("Errore nel caricamento CRM");
    } else {
      const sanitizedData = (data || []).map(lead => ({
        ...lead,
        stato: lead.stato === 'nuovo' ? 'Nuovo' : (lead.stato || 'Nuovo')
      }));
      setLeads(sanitizedData);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const filteredLeads = useMemo(() => {
    return leads.filter(lead => {
      const matchesSearch = 
        `${lead.nome} ${lead.cognome}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lead.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lead.telefono?.includes(searchQuery);
      
      const matchesAgent = 
        agentFilter === "Tutti" || 
        (agentFilter === "Non assegnati" && !lead.assegnato_a) ||
        lead.assegnato_a === agentFilter;

      return matchesSearch && matchesAgent;
    });
  }, [leads, searchQuery, agentFilter]);

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLead.nome || !newLead.cognome) {
      showError("Nome e Cognome sono obbligatori");
      return;
    }

    setIsSaving(true);
    const { error } = await supabase.rpc('upsert_lead', {
      p_nome: `${newLead.nome} ${newLead.cognome}`.trim(),
      p_email: newLead.email,
      p_telefono: newLead.telefono || '',
      p_messaggio: 'Contatto inserito manualmente.',
      p_immobile_id: null,
      p_immobile_interesse: 'Generico (Manuale)'
    });

    if (error) {
      showError("Errore nella creazione: " + error.message);
    } else {
      showSuccess("Contatto gestito correttamente");
      setIsCreateModalOpen(false);
      setNewLead({ nome: '', cognome: '', email: '', telefono: '' });
      fetchLeads();
    }
    setIsSaving(false);
  };

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const newStatus = destination.droppableId;
    const updatedLeads = Array.from(leads);
    const leadIndex = updatedLeads.findIndex(l => l.id === draggableId);
    if (leadIndex !== -1) {
      updatedLeads[leadIndex] = { ...updatedLeads[leadIndex], stato: newStatus };
      setLeads(updatedLeads);
    }

    const { error } = await supabase.from('leads').update({ stato: newStatus }).eq('id', draggableId);
    if (error) {
      showError("Errore nell'aggiornamento stato");
      fetchLeads();
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
        nome: selectedLead.nome,
        cognome: selectedLead.cognome,
        telefono: selectedLead.telefono,
        email: selectedLead.email,
        assegnato_a: selectedLead.assegnato_a === "Nessuno" ? null : selectedLead.assegnato_a,
        tipo_cliente: selectedLead.tipo_cliente,
        budget: parseFloat(selectedLead.budget) || null,
        tipologia_ricerca: selectedLead.tipologia_ricerca,
        indirizzo_vendita: selectedLead.indirizzo_vendita,
        valutazione_stimata: parseFloat(selectedLead.valutazione_stimata) || null,
        scadenza_esclusiva: selectedLead.scadenza_esclusiva || null,
        motivazione_vendita: selectedLead.motivazione_vendita,
        note_interne: selectedLead.note_interne
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

  const formatPrice = (price: number) => {
    if (!price) return 'N/D';
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(price);
  };

  const fetchAllProperties = useCallback(async () => {
    setIsLoadingProperties(true);
    const { data, error } = await supabase
      .from('immobili')
      .select('id, titolo, prezzo, copertina_url, zona, citta, stato')
      .neq('stato', 'Venduto')
      .order('created_at', { ascending: false });
    if (!error) setAllProperties(data || []);
    setIsLoadingProperties(false);
  }, []);

  const openPropertyPicker = async () => {
    setIsPropertyPickerOpen(true);
    if (allProperties.length === 0) await fetchAllProperties();
  };

  const handleAssociateProperty = async (immobile: any) => {
    if (!selectedLead) return;
    const { error } = await supabase
      .from('lead_immobili')
      .insert({ lead_id: selectedLead.id, immobile_id: immobile.id, stato_interesse: 'Interessato' });

    if (error) {
      showError("Errore nell'associazione: " + error.message);
      return;
    }

    showSuccess(`"${immobile.titolo}" aggiunto alla wishlist`);
    setIsPropertyPickerOpen(false);
    setPropertySearch('');

    // Refresh selected lead without closing modal
    const { data } = await supabase
      .from('leads')
      .select(`*, immobile_primo_contatto:immobili!immobile_id(id, titolo, prezzo, copertina_url, zona, citta), lead_immobili(id, stato_interesse, note, created_at, immobili(id, titolo, prezzo, copertina_url, zona, citta))`)
      .eq('id', selectedLead.id)
      .single();
    if (data) {
      const fresh = { ...data, stato: data.stato === 'nuovo' ? 'Nuovo' : (data.stato || 'Nuovo') };
      setSelectedLead(fresh);
      setLeads(prev => prev.map(l => l.id === fresh.id ? fresh : l));
    }
  };

  // Fetch notes whenever a different lead is opened
  useEffect(() => {
    if (!selectedLead?.id) {
      setLeadNotes([]);
      setNewNoteText('');
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from('lead_notes')
        .select('*')
        .eq('lead_id', selectedLead.id)
        .order('created_at', { ascending: true });
      if (!error) setLeadNotes(data || []);
    })();
  }, [selectedLead?.id]);

  const handleAddNote = async () => {
    if (!newNoteText.trim() || !selectedLead) return;
    setIsSavingNote(true);
    const { error } = await supabase
      .from('lead_notes')
      .insert({ lead_id: selectedLead.id, testo: newNoteText.trim(), autore: newNoteAutore });
    if (error) {
      showError("Errore nel salvataggio della nota");
    } else {
      setNewNoteText('');
      const { data } = await supabase
        .from('lead_notes')
        .select('*')
        .eq('lead_id', selectedLead.id)
        .order('created_at', { ascending: true });
      if (data) setLeadNotes(data);
    }
    setIsSavingNote(false);
  };

  const filteredPickerProperties = useMemo(() => {
    const q = propertySearch.toLowerCase();
    if (!q) return allProperties;
    return allProperties.filter(p =>
      p.titolo?.toLowerCase().includes(q) ||
      p.zona?.toLowerCase().includes(q) ||
      p.citta?.toLowerCase().includes(q)
    );
  }, [allProperties, propertySearch]);

  const getClientTypeBadge = (type: string) => {
    switch(type) {
      case 'Venditore': return "bg-red-100 text-red-700 border-red-200";
      case 'Acquirente': return "bg-blue-100 text-blue-700 border-blue-200";
      case 'Ibrido': return "bg-purple-100 text-purple-700 border-purple-200";
      default: return "bg-gray-100 text-gray-600 border-gray-200";
    }
  };

  const getLeadsByStatus = (status: string) => {
    return filteredLeads.filter(l => l.stato === status);
  };

  return (
    <AdminLayout>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900">CRM Leads</h1>
          <p className="text-gray-500 mt-1 font-medium">Gestione centralizzata dei contatti e delle trattative.</p>
        </div>
        
        <Button 
          onClick={() => setIsCreateModalOpen(true)}
          className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-2xl px-8 h-14 shadow-lg shadow-[#94b0ab]/20 font-bold transition-all"
        >
          <Plus className="mr-2" size={20} /> Nuovo Contatto
        </Button>
      </div>

      <div className="bg-white p-4 rounded-[2rem] border border-gray-100 shadow-sm mb-8 flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <Input 
            placeholder="Cerca per nome, email o telefono..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-12 pl-12 rounded-xl border-gray-100 focus:ring-[#94b0ab]"
          />
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <Filter className="text-gray-400 shrink-0" size={18} />
          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger className="h-12 w-full md:w-[200px] rounded-xl border-gray-100">
              <SelectValue placeholder="Filtra per agente" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="Tutti">Tutti gli agenti</SelectItem>
              <SelectItem value="Non assegnati">Non assegnati</SelectItem>
              {AGENTS.map(agent => (
                <SelectItem key={agent} value={agent}>{agent}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="kanban" className="w-full">
        <TabsList className="bg-white border border-gray-100 p-1.5 rounded-2xl h-14 mb-8 flex justify-start gap-1 w-fit">
          <TabsTrigger value="kanban" className="rounded-xl px-8 h-full data-[state=active]:bg-[#94b0ab] data-[state=active]:text-white font-bold transition-all gap-2">
            <LayoutDashboard size={18} /> Vista Board
          </TabsTrigger>
          <TabsTrigger value="list" className="rounded-xl px-8 h-full data-[state=active]:bg-[#94b0ab] data-[state=active]:text-white font-bold transition-all gap-2">
            <List size={18} /> Vista Lista
          </TabsTrigger>
        </TabsList>

        <TabsContent value="kanban" className="mt-0">
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 h-[calc(100vh-420px)] min-h-[600px]">
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
                                className={cn(
                                  "bg-white p-4 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md hover:border-[#94b0ab]/30 transition-all group relative",
                                  snapshot.isDragging && "shadow-2xl border-[#94b0ab] rotate-2 scale-105 z-50"
                                )}
                              >
                                <div className="absolute top-4 right-4 flex items-center gap-2">
                                  <button 
                                    onPointerDown={(e) => { e.stopPropagation(); setSelectedLead(lead); }}
                                    className="text-gray-300 hover:text-[#94b0ab] transition-colors p-1"
                                  >
                                    <ExternalLink size={14} />
                                  </button>
                                  <div className="text-gray-200 group-hover:text-gray-400 transition-colors">
                                    <GripVertical size={14} />
                                  </div>
                                </div>

                                <div className="font-bold text-gray-900 mb-1 pr-10 text-sm">
                                  {lead.nome} {lead.cognome}
                                </div>

                                <Badge className={cn(
                                  "mb-3 text-[9px] font-black uppercase tracking-widest border",
                                  getClientTypeBadge(lead.tipo_cliente)
                                )}>
                                  {lead.tipo_cliente || 'Acquirente'}
                                </Badge>

                                <div className="space-y-1.5 mb-3">
                                  <div className="flex items-center gap-2 text-[9px] font-bold text-gray-400 uppercase">
                                    <Calendar size={10} />
                                    {format(new Date(lead.created_at), 'dd MMM yyyy', { locale: it })}
                                  </div>
                                  {lead.lead_immobili && lead.lead_immobili.length > 0 && (
                                    <div className="flex items-center gap-2 text-[9px] font-bold text-[#94b0ab] bg-[#94b0ab]/5 px-2 py-0.5 rounded-lg truncate">
                                      <HomeIcon size={9} />
                                      {lead.lead_immobili[0].immobili.titolo}
                                    </div>
                                  )}
                                </div>

                                <div className="flex items-center justify-between pt-2 border-t border-gray-50">
                                  <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                                    <Phone size={10} className="text-gray-300" />
                                    {lead.telefono || 'N/D'}
                                  </div>
                                  {lead.assegnato_a && (
                                    <div className="w-5 h-5 rounded-full bg-[#94b0ab] text-white flex items-center justify-center text-[8px] font-black shadow-sm" title={`Assegnato a ${lead.assegnato_a}`}>
                                      {lead.assegnato_a.charAt(0)}
                                    </div>
                                  )}
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
        </TabsContent>

        <TabsContent value="list" className="mt-0">
          <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50/50 border-b border-gray-100">
                    <th className="px-8 py-5 text-xs font-bold uppercase tracking-widest text-gray-400">Contatto</th>
                    <th className="px-8 py-5 text-xs font-bold uppercase tracking-widest text-gray-400">Tipo</th>
                    <th className="px-8 py-5 text-xs font-bold uppercase tracking-widest text-gray-400">Stato</th>
                    <th className="px-8 py-5 text-xs font-bold uppercase tracking-widest text-gray-400">Assegnato</th>
                    <th className="px-8 py-5 text-xs font-bold uppercase tracking-widest text-gray-400 text-right">Azioni</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredLeads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-gray-50/30 transition-colors group">
                      <td className="px-8 py-5">
                        <div className="font-bold text-gray-900">{lead.nome} {lead.cognome}</div>
                        <div className="text-xs text-gray-400 font-medium">{lead.email}</div>
                      </td>
                      <td className="px-8 py-5">
                        <Badge className={cn(
                          "text-[9px] font-black uppercase tracking-widest border",
                          getClientTypeBadge(lead.tipo_cliente)
                        )}>
                          {lead.tipo_cliente || 'Acquirente'}
                        </Badge>
                      </td>
                      <td className="px-8 py-5">
                        <Badge className={cn(
                          "px-3 py-1 rounded-full font-bold uppercase tracking-widest text-[9px] border-none",
                          COLUMNS.find(c => c.id === lead.stato)?.color || "bg-gray-100 text-gray-600"
                        )}>
                          {lead.stato}
                        </Badge>
                      </td>
                      <td className="px-8 py-5">
                        {lead.assegnato_a ? (
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-[#94b0ab]/10 text-[#94b0ab] flex items-center justify-center text-[10px] font-bold">
                              {lead.assegnato_a.charAt(0)}
                            </div>
                            <span className="text-sm font-medium text-gray-600">{lead.assegnato_a}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300 italic">Non assegnato</span>
                        )}
                      </td>
                      <td className="px-8 py-5 text-right">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => setSelectedLead(lead)}
                          className="rounded-xl font-bold text-[#94b0ab] hover:bg-[#94b0ab]/5"
                        >
                          Vedi Scheda
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Manual Creation Dialog */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-xl rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden">
          <DialogHeader className="px-8 pt-8 pb-4">
            <DialogTitle className="text-2xl font-bold">Nuovo Contatto</DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleCreateLead}>
            <div className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Nome</Label>
                  <Input 
                    required
                    value={newLead.nome}
                    onChange={(e) => setNewLead({...newLead, nome: e.target.value})}
                    className="h-12 rounded-xl border-gray-100"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Cognome</Label>
                  <Input 
                    required
                    value={newLead.cognome}
                    onChange={(e) => setNewLead({...newLead, cognome: e.target.value})}
                    className="h-12 rounded-xl border-gray-100"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Email</Label>
                <Input 
                  type="email"
                  value={newLead.email}
                  onChange={(e) => setNewLead({...newLead, email: e.target.value})}
                  className="h-12 rounded-xl border-gray-100"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Telefono</Label>
                <Input 
                  value={newLead.telefono}
                  onChange={(e) => setNewLead({...newLead, telefono: e.target.value})}
                  className="h-12 rounded-xl border-gray-100"
                />
              </div>
            </div>

            <DialogFooter className="p-8 bg-gray-50/50">
              <Button type="button" variant="ghost" onClick={() => setIsCreateModalOpen(false)} className="rounded-xl font-bold">Annulla</Button>
              <Button 
                type="submit"
                disabled={isSaving}
                className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl px-10 h-12 font-bold transition-all"
              >
                {isSaving ? "Creazione..." : "Crea Contatto"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Lead Detail Dialog */}
      <Dialog open={!!selectedLead} onOpenChange={(open) => !open && setSelectedLead(null)}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] p-0 overflow-hidden flex flex-col gap-0 border-none shadow-2xl rounded-[2rem]">
          {selectedLead && (
            <form onSubmit={handleSaveDetails} className="flex flex-col min-h-0 flex-1">

              {/* Compact Header */}
              <DialogHeader className="px-7 pt-5 pb-4 border-b bg-white shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[#94b0ab]/10 text-[#94b0ab] flex items-center justify-center shrink-0">
                    <User size={22} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <DialogTitle className="text-xl font-bold text-gray-900 leading-none">
                        {selectedLead.nome} {selectedLead.cognome}
                      </DialogTitle>
                      <Badge className={cn(
                        "px-3 py-1 rounded-full font-bold uppercase tracking-widest text-[10px]",
                        COLUMNS.find(c => c.id === selectedLead.stato)?.color
                      )}>
                        {selectedLead.stato}
                      </Badge>
                      <Badge className={cn(
                        "px-3 py-1 rounded-full font-bold uppercase tracking-widest text-[10px] border",
                        getClientTypeBadge(selectedLead.tipo_cliente)
                      )}>
                        {selectedLead.tipo_cliente || 'Acquirente'}
                      </Badge>
                    </div>
                    <DialogDescription className="text-xs text-gray-400 font-medium mt-1">
                      Lead acquisito il {format(new Date(selectedLead.created_at), 'PPP', { locale: it })}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              {/* Tabs — flex-1 so it fills remaining height, footer is always visible */}
              <Tabs defaultValue="profilo" className="flex flex-col flex-1 min-h-0">
                {/* Tab bar */}
                <div className="px-7 border-b bg-white shrink-0">
                  <TabsList className="bg-transparent p-0 h-12 gap-8 w-full justify-start">
                    <TabsTrigger value="profilo" className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#94b0ab] data-[state=active]:bg-transparent px-0 h-full font-bold text-gray-400 data-[state=active]:text-[#94b0ab] gap-2">
                      <User size={15} /> Profilo
                    </TabsTrigger>
                    <TabsTrigger value="immobili" className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#94b0ab] data-[state=active]:bg-transparent px-0 h-full font-bold text-gray-400 data-[state=active]:text-[#94b0ab] gap-2">
                      <Heart size={15} /> Immobili
                    </TabsTrigger>
                    <TabsTrigger value="storico" className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#94b0ab] data-[state=active]:bg-transparent px-0 h-full font-bold text-gray-400 data-[state=active]:text-[#94b0ab] gap-2">
                      <History size={15} /> Storico
                    </TabsTrigger>
                  </TabsList>
                </div>

                {/* Scrollable content area */}
                <div className="flex-1 overflow-y-auto bg-slate-50">

                  {/* ── PROFILO TAB ── */}
                  <TabsContent value="profilo" className="mt-0 p-6 space-y-5 animate-in fade-in slide-in-from-bottom-2">

                    {/* Card: Anagrafica e Contatti */}
                    <div className="bg-white border rounded-xl shadow-sm p-5 space-y-5">
                      <div className="flex items-center gap-2">
                        <UserCheck size={15} className="text-[#94b0ab]" />
                        <h3 className="text-sm font-semibold text-muted-foreground tracking-wide uppercase">Anagrafica e Contatti</h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="space-y-2">
                          <Label className="text-xs font-bold text-gray-500">Email</Label>
                          <Input
                            value={selectedLead.email || ''}
                            onChange={(e) => setSelectedLead({...selectedLead, email: e.target.value})}
                            className="h-11 rounded-xl border-gray-200 bg-slate-50/50"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-bold text-gray-500">Telefono</Label>
                          <Input
                            value={selectedLead.telefono || ''}
                            onChange={(e) => setSelectedLead({...selectedLead, telefono: e.target.value})}
                            className="h-11 rounded-xl border-gray-200 bg-slate-50/50"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-bold text-gray-500">Assegnato a</Label>
                          <Select
                            value={selectedLead.assegnato_a || "Nessuno"}
                            onValueChange={(v) => setSelectedLead({...selectedLead, assegnato_a: v})}
                          >
                            <SelectTrigger className="h-11 rounded-xl border-gray-200 bg-slate-50/50">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                              <SelectItem value="Nessuno">Nessuno</SelectItem>
                              {AGENTS.map(agent => (
                                <SelectItem key={agent} value={agent}>{agent}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-bold text-gray-500">Tipo Cliente</Label>
                          <Select
                            value={selectedLead.tipo_cliente || "Acquirente"}
                            onValueChange={(v) => setSelectedLead({...selectedLead, tipo_cliente: v})}
                          >
                            <SelectTrigger className="h-11 rounded-xl border-gray-200 bg-slate-50/50">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                              <SelectItem value="Acquirente">Acquirente</SelectItem>
                              <SelectItem value="Venditore">Venditore</SelectItem>
                              <SelectItem value="Ibrido">Ibrido (Entrambi)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    {/* Card: Esigenze di Acquisto (conditional) */}
                    {(selectedLead.tipo_cliente === 'Acquirente' || selectedLead.tipo_cliente === 'Ibrido') && (
                      <div className="bg-white border border-blue-100 rounded-xl shadow-sm p-5 space-y-5">
                        <div className="flex items-center gap-2">
                          <Briefcase size={15} className="text-blue-500" />
                          <h3 className="text-sm font-semibold text-blue-600 tracking-wide uppercase">Esigenze di Acquisto</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          <div className="space-y-2">
                            <Label className="text-xs font-bold text-gray-500">Budget Massimo (€)</Label>
                            <Input
                              type="number"
                              value={selectedLead.budget || ''}
                              onChange={(e) => setSelectedLead({...selectedLead, budget: e.target.value})}
                              className="h-11 rounded-xl border-gray-200 bg-slate-50/50"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-bold text-gray-500">Tipologia Ricerca</Label>
                            <Input
                              value={selectedLead.tipologia_ricerca || ''}
                              onChange={(e) => setSelectedLead({...selectedLead, tipologia_ricerca: e.target.value})}
                              className="h-11 rounded-xl border-gray-200 bg-slate-50/50"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Card: Dati di Vendita (conditional) */}
                    {(selectedLead.tipo_cliente === 'Venditore' || selectedLead.tipo_cliente === 'Ibrido') && (
                      <div className="bg-white border border-red-100 rounded-xl shadow-sm p-5 space-y-5">
                        <div className="flex items-center gap-2">
                          <TrendingUp size={15} className="text-red-500" />
                          <h3 className="text-sm font-semibold text-red-600 tracking-wide uppercase">Dati di Vendita</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          <div className="space-y-2 col-span-full">
                            <Label className="text-xs font-bold text-gray-500">Indirizzo Immobile da Vendere</Label>
                            <Input
                              value={selectedLead.indirizzo_vendita || ''}
                              onChange={(e) => setSelectedLead({...selectedLead, indirizzo_vendita: e.target.value})}
                              className="h-11 rounded-xl border-gray-200 bg-slate-50/50"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-bold text-gray-500">Valutazione Stimata (€)</Label>
                            <Input
                              type="number"
                              value={selectedLead.valutazione_stimata || ''}
                              onChange={(e) => setSelectedLead({...selectedLead, valutazione_stimata: e.target.value})}
                              className="h-11 rounded-xl border-gray-200 bg-slate-50/50"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-bold text-gray-500">Scadenza Esclusiva</Label>
                            <Input
                              type="date"
                              value={selectedLead.scadenza_esclusiva || ''}
                              onChange={(e) => setSelectedLead({...selectedLead, scadenza_esclusiva: e.target.value})}
                              className="h-11 rounded-xl border-gray-200 bg-slate-50/50"
                            />
                          </div>
                          <div className="space-y-2 col-span-full">
                            <Label className="text-xs font-bold text-gray-500">Motivazione Vendita</Label>
                            <Input
                              value={selectedLead.motivazione_vendita || ''}
                              onChange={(e) => setSelectedLead({...selectedLead, motivazione_vendita: e.target.value})}
                              className="h-11 rounded-xl border-gray-200 bg-slate-50/50"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  {/* ── WISHLIST TAB ── */}
                  <TabsContent value="immobili" className="mt-0 p-6 space-y-6 animate-in fade-in slide-in-from-bottom-2">

                    {/* ── Primo Contatto ── */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-muted-foreground tracking-wide uppercase">Immobile di Primo Contatto</h3>
                      </div>

                      {selectedLead.immobile_primo_contatto ? (
                        <div className="bg-white rounded-xl border border-[#94b0ab]/25 shadow-sm overflow-hidden">
                          {/* Hero image */}
                          <div className="h-36 bg-slate-100 relative overflow-hidden">
                            {selectedLead.immobile_primo_contatto.copertina_url ? (
                              <img
                                src={selectedLead.immobile_primo_contatto.copertina_url}
                                alt={selectedLead.immobile_primo_contatto.titolo}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-slate-300">
                                <HomeIcon size={32} />
                              </div>
                            )}
                            <div className="absolute top-2.5 left-2.5">
                              <Badge className="bg-[#94b0ab] text-white text-[9px] font-black uppercase tracking-widest border-none shadow-sm">
                                Primo Contatto
                              </Badge>
                            </div>
                          </div>
                          {/* Info row */}
                          <div className="px-4 py-3 flex items-center justify-between gap-4">
                            <div className="min-w-0">
                              <p className="font-bold text-gray-900 truncate text-sm leading-tight">
                                {selectedLead.immobile_primo_contatto.titolo}
                              </p>
                              {(selectedLead.immobile_primo_contatto.zona || selectedLead.immobile_primo_contatto.citta) && (
                                <p className="text-xs text-gray-400 mt-0.5 truncate">
                                  {[selectedLead.immobile_primo_contatto.zona, selectedLead.immobile_primo_contatto.citta].filter(Boolean).join(', ')}
                                </p>
                              )}
                            </div>
                            <span className="text-base font-extrabold text-[#94b0ab] shrink-0">
                              {formatPrice(selectedLead.immobile_primo_contatto.prezzo)}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="py-6 text-center bg-white rounded-xl border border-dashed border-gray-200 shadow-sm">
                          <p className="text-xs text-gray-400 italic">Nessun immobile di primo contatto</p>
                        </div>
                      )}
                    </div>

                    {/* ── Wishlist aggiuntiva ── */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-muted-foreground tracking-wide uppercase">Wishlist</h3>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-xl font-bold gap-1.5 border-[#94b0ab] text-[#94b0ab] hover:bg-[#94b0ab]/5 cursor-pointer"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); openPropertyPicker(); }}
                        >
                          <Plus size={15} /> Associa Immobile
                        </Button>
                      </div>

                      {!selectedLead.lead_immobili || selectedLead.lead_immobili.length === 0 ? (
                        <div className="py-8 text-center bg-white rounded-xl border border-dashed border-gray-200 shadow-sm">
                          <Heart className="mx-auto text-gray-200 mb-2" size={28} />
                          <p className="text-xs text-gray-400 italic">Nessun immobile aggiunto manualmente.</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {selectedLead.lead_immobili.map((item: any) => (
                            <div key={item.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex items-stretch group hover:border-[#94b0ab]/40 transition-all">
                              <div className="w-20 shrink-0 bg-slate-100 overflow-hidden">
                                {item.immobili.copertina_url ? (
                                  <img src={item.immobili.copertina_url} alt={item.immobili.titolo} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-slate-300 min-h-[68px]">
                                    <HomeIcon size={20} />
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 px-4 py-3 min-w-0">
                                <p className="font-bold text-gray-900 truncate text-sm leading-tight">{item.immobili.titolo}</p>
                                {(item.immobili.zona || item.immobili.citta) && (
                                  <p className="text-xs text-gray-400 mt-0.5 truncate">
                                    {[item.immobili.zona, item.immobili.citta].filter(Boolean).join(', ')}
                                  </p>
                                )}
                                <div className="flex items-center gap-2 mt-1.5">
                                  <span className="text-sm font-bold text-[#94b0ab]">{formatPrice(item.immobili.prezzo)}</span>
                                  <Badge variant="outline" className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 border-gray-200 text-gray-500">
                                    {item.stato_interesse}
                                  </Badge>
                                </div>
                              </div>
                              <div className="flex items-center pr-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="text-gray-300 hover:text-[#94b0ab] rounded-lg"
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                  title="Apri immobile"
                                >
                                  <ExternalLink size={15} />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                  </TabsContent>

                  {/* ── STORICO TAB ── */}
                  <TabsContent value="storico" className="mt-0 p-6 space-y-5 animate-in fade-in slide-in-from-bottom-2">

                    {/* Original message — always visible, visually distinct */}
                    <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2.5">
                        <MessageSquare size={13} className="text-amber-600 shrink-0" />
                        <span className="text-xs font-black text-amber-700 uppercase tracking-widest">Messaggio di Primo Contatto</span>
                        <span className="text-[10px] text-amber-500 ml-auto font-medium shrink-0">
                          {format(new Date(selectedLead.created_at), "d MMM yyyy", { locale: it })}
                        </span>
                      </div>
                      <p className="text-sm text-amber-900 leading-relaxed italic">
                        "{selectedLead.messaggio || 'Nessun messaggio ricevuto.'}"
                      </p>
                    </div>

                    {/* Timeline of notes */}
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground tracking-wide uppercase mb-3">Note Interne</p>

                      {/* Notes list — own scroll so the input stays visible */}
                      <div className="space-y-1 max-h-[300px] overflow-y-auto pr-1">
                        {leadNotes.length === 0 ? (
                          <div className="py-10 text-center bg-white rounded-xl border border-dashed border-gray-200">
                            <History className="mx-auto text-gray-200 mb-2" size={26} />
                            <p className="text-xs text-gray-400 italic">Nessuna nota registrata ancora.</p>
                          </div>
                        ) : leadNotes.map((note, idx) => (
                          <div key={note.id} className="flex gap-3 group">
                            {/* Avatar + timeline connector */}
                            <div className="flex flex-col items-center shrink-0 pt-0.5">
                              <div className="w-7 h-7 rounded-full bg-[#94b0ab]/10 text-[#94b0ab] flex items-center justify-center text-[10px] font-black border border-[#94b0ab]/20">
                                {note.autore?.charAt(0)?.toUpperCase() || '?'}
                              </div>
                              {idx < leadNotes.length - 1 && (
                                <div className="w-px flex-1 bg-gray-100 my-1" />
                              )}
                            </div>
                            {/* Bubble */}
                            <div className={cn("flex-1 min-w-0", idx < leadNotes.length - 1 ? "pb-3" : "pb-1")}>
                              <div className="flex items-baseline gap-2 mb-1">
                                <span className="text-xs font-bold text-gray-800">{note.autore}</span>
                                <span className="text-[10px] text-gray-400 font-medium">
                                  {format(new Date(note.created_at), "d MMMM yyyy, HH:mm", { locale: it })}
                                </span>
                              </div>
                              <div className="bg-white border border-gray-100 rounded-xl rounded-tl-sm px-4 py-3 shadow-sm">
                                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{note.testo}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Add note input */}
                    <div className="bg-white border rounded-xl shadow-sm p-4 space-y-3">
                      {/* Author selector */}
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-[#94b0ab]/10 text-[#94b0ab] flex items-center justify-center text-[10px] font-black border border-[#94b0ab]/20 shrink-0">
                          {newNoteAutore.charAt(0)}
                        </div>
                        <Select value={newNoteAutore} onValueChange={setNewNoteAutore}>
                          <SelectTrigger className="h-8 w-36 rounded-lg border-gray-200 text-xs font-bold bg-slate-50">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl">
                            {AGENTS.map(a => <SelectItem key={a} value={a} className="text-xs font-medium">{a}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <span className="text-xs text-gray-400">sta scrivendo una nota...</span>
                      </div>

                      {/* Textarea + submit */}
                      <div className="flex gap-2 items-end">
                        <Textarea
                          value={newNoteText}
                          onChange={(e) => setNewNoteText(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddNote(); }}
                          placeholder="Scrivi una nota (⌘↵ per salvare)..."
                          className="flex-1 min-h-[80px] max-h-[140px] rounded-xl border-gray-200 bg-slate-50 text-sm resize-none focus:ring-[#94b0ab] p-3"
                        />
                        <Button
                          type="button"
                          disabled={isSavingNote || !newNoteText.trim()}
                          onClick={handleAddNote}
                          className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl h-10 px-4 font-bold shrink-0 gap-1.5 transition-all disabled:opacity-40"
                        >
                          {isSavingNote ? "..." : <><Send size={14} /> Aggiungi</>}
                        </Button>
                      </div>
                    </div>

                  </TabsContent>

                </div>
              </Tabs>

              {/* Fixed Footer — always visible, never cut off */}
              <div className="px-7 py-5 bg-white border-t shrink-0">
                <Button
                  type="submit"
                  disabled={isSaving}
                  className="w-full bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-2xl h-13 font-bold shadow-lg shadow-[#94b0ab]/20 transition-all active:scale-[0.98]"
                >
                  {isSaving ? "Salvataggio..." : <><Save size={18} className="mr-2" /> Salva Modifiche</>}
                </Button>
              </div>

            </form>
          )}
        </DialogContent>
      </Dialog>
      {/* Property Picker Dialog */}
      <Dialog open={isPropertyPickerOpen} onOpenChange={(open) => { setIsPropertyPickerOpen(open); if (!open) setPropertySearch(''); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] p-0 overflow-hidden flex flex-col gap-0 border-none shadow-2xl rounded-[2rem]">
          <DialogHeader className="px-7 pt-6 pb-4 border-b bg-white shrink-0">
            <DialogTitle className="text-lg font-bold text-gray-900">Associa un Immobile</DialogTitle>
            <DialogDescription className="text-sm text-gray-400">
              Seleziona una proprietà da aggiungere alla wishlist del cliente.
            </DialogDescription>
            <div className="relative mt-3">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <Input
                placeholder="Cerca per titolo, zona o città..."
                value={propertySearch}
                onChange={(e) => setPropertySearch(e.target.value)}
                className="h-11 pl-10 rounded-xl border-gray-200 bg-slate-50"
                autoFocus
              />
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto bg-slate-50 p-4 space-y-3">
            {isLoadingProperties ? (
              <div className="py-16 text-center text-gray-400 text-sm animate-pulse">Caricamento immobili...</div>
            ) : filteredPickerProperties.length === 0 ? (
              <div className="py-16 text-center text-gray-400 text-sm">Nessun immobile trovato.</div>
            ) : filteredPickerProperties.map((prop) => (
              <div key={prop.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex items-stretch group hover:border-[#94b0ab]/40 transition-all">
                {/* Thumbnail */}
                <div className="w-20 shrink-0 bg-slate-100 relative overflow-hidden">
                  {prop.copertina_url ? (
                    <img src={prop.copertina_url} alt={prop.titolo} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300 min-h-[72px]">
                      <HomeIcon size={22} />
                    </div>
                  )}
                </div>
                {/* Info */}
                <div className="flex-1 px-4 py-3 min-w-0">
                  <p className="font-bold text-gray-900 truncate text-sm leading-tight">{prop.titolo}</p>
                  {(prop.zona || prop.citta) && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      {[prop.zona, prop.citta].filter(Boolean).join(', ')}
                    </p>
                  )}
                  <p className="text-sm font-bold text-[#94b0ab] mt-1.5">{formatPrice(prop.prezzo)}</p>
                </div>
                {/* CTA */}
                <div className="flex items-center pr-4 shrink-0">
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-xl bg-[#94b0ab] hover:bg-[#7a948f] text-white font-bold px-4 h-9 cursor-pointer transition-all"
                    onClick={() => handleAssociateProperty(prop)}
                  >
                    Seleziona
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

    </AdminLayout>
  );
};

export default Leads;