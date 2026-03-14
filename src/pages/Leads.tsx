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
  Filter, TrendingUp, History, Heart, UserCheck, Briefcase
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
        lead_immobili(
          id,
          stato_interesse,
          note,
          created_at,
          immobili(id, titolo)
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
              {/* Fixed Header */}
              <DialogHeader className="px-8 pt-8 pb-6 border-b bg-white shrink-0">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-16 h-16 rounded-2xl bg-[#94b0ab]/10 text-[#94b0ab] flex items-center justify-center shrink-0">
                    <User size={32} />
                  </div>
                  <div className="min-w-0">
                    <DialogTitle className="text-2xl font-bold text-gray-900">
                      {selectedLead.nome} {selectedLead.cognome}
                    </DialogTitle>
                    <DialogDescription className="text-sm text-gray-400 font-medium mt-0.5">
                      Lead acquisito il {format(new Date(selectedLead.created_at), 'PPP', { locale: it })}
                    </DialogDescription>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Badge className={cn(
                    "px-4 py-1.5 rounded-full font-bold uppercase tracking-widest text-[10px]",
                    COLUMNS.find(c => c.id === selectedLead.stato)?.color
                  )}>
                    {selectedLead.stato}
                  </Badge>
                  <Badge className={cn(
                    "px-4 py-1.5 rounded-full font-bold uppercase tracking-widest text-[10px] border",
                    getClientTypeBadge(selectedLead.tipo_cliente)
                  )}>
                    {selectedLead.tipo_cliente || 'Acquirente'}
                  </Badge>
                </div>
              </DialogHeader>

              {/* Tabs Navigation */}
              <div className="px-8 pt-4 pb-0 border-b bg-gray-50/30 shrink-0">
                <Tabs defaultValue="profilo" className="w-full">
                  <TabsList className="bg-transparent p-0 h-12 gap-8 w-full justify-start">
                    <TabsTrigger value="profilo" className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#94b0ab] data-[state=active]:bg-transparent px-0 h-full font-bold text-gray-400 data-[state=active]:text-[#94b0ab] gap-2">
                      <User size={16} /> Profilo
                    </TabsTrigger>
                    <TabsTrigger value="immobili" className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#94b0ab] data-[state=active]:bg-transparent px-0 h-full font-bold text-gray-400 data-[state=active]:text-[#94b0ab] gap-2">
                      <Heart size={16} /> Wishlist
                    </TabsTrigger>
                    <TabsTrigger value="storico" className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#94b0ab] data-[state=active]:bg-transparent px-0 h-full font-bold text-gray-400 data-[state=active]:text-[#94b0ab] gap-2">
                      <History size={16} /> Storico
                    </TabsTrigger>
                  </TabsList>

                  {/* Scrollable Tab Content */}
                  <div className="overflow-y-auto" style={{ maxHeight: 'calc(90vh - 300px)' }}>
                    <TabsContent value="profilo" className="mt-0 p-8 space-y-10 animate-in fade-in slide-in-from-bottom-2">
                      {/* Anagrafica */}
                      <section className="space-y-6">
                        <div className="flex items-center gap-2 text-[#94b0ab]">
                          <UserCheck size={18} />
                          <h3 className="text-xs font-black uppercase tracking-widest">Anagrafica e Contatti</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <Label className="text-xs font-bold text-gray-500">Email</Label>
                            <Input
                              value={selectedLead.email || ''}
                              onChange={(e) => setSelectedLead({...selectedLead, email: e.target.value})}
                              className="h-12 rounded-xl border-gray-100"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-bold text-gray-500">Telefono</Label>
                            <Input
                              value={selectedLead.telefono || ''}
                              onChange={(e) => setSelectedLead({...selectedLead, telefono: e.target.value})}
                              className="h-12 rounded-xl border-gray-100"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-bold text-gray-500">Assegnato a</Label>
                            <Select
                              value={selectedLead.assegnato_a || "Nessuno"}
                              onValueChange={(v) => setSelectedLead({...selectedLead, assegnato_a: v})}
                            >
                              <SelectTrigger className="h-12 rounded-xl border-gray-100">
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
                              <SelectTrigger className="h-12 rounded-xl border-gray-100">
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
                      </section>

                      {/* Campi Condizionali Acquirente */}
                      {(selectedLead.tipo_cliente === 'Acquirente' || selectedLead.tipo_cliente === 'Ibrido') && (
                        <section className="space-y-6 p-6 bg-blue-50/30 rounded-[2rem] border border-blue-100/50">
                          <div className="flex items-center gap-2 text-blue-600">
                            <Briefcase size={18} />
                            <h3 className="text-xs font-black uppercase tracking-widest">Esigenze di Acquisto</h3>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                              <Label className="text-xs font-bold text-gray-500">Budget Massimo (€)</Label>
                              <Input
                                type="number"
                                value={selectedLead.budget || ''}
                                onChange={(e) => setSelectedLead({...selectedLead, budget: e.target.value})}
                                className="h-12 rounded-xl border-gray-100"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs font-bold text-gray-500">Tipologia Ricerca</Label>
                              <Input
                                value={selectedLead.tipologia_ricerca || ''}
                                onChange={(e) => setSelectedLead({...selectedLead, tipologia_ricerca: e.target.value})}
                                className="h-12 rounded-xl border-gray-100"
                              />
                            </div>
                          </div>
                        </section>
                      )}

                      {/* Campi Condizionali Venditore */}
                      {(selectedLead.tipo_cliente === 'Venditore' || selectedLead.tipo_cliente === 'Ibrido') && (
                        <section className="space-y-6 p-6 bg-red-50/30 rounded-[2rem] border border-red-100/50">
                          <div className="flex items-center gap-2 text-red-600">
                            <TrendingUp size={18} />
                            <h3 className="text-xs font-black uppercase tracking-widest">Dati di Vendita</h3>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2 col-span-full">
                              <Label className="text-xs font-bold text-gray-500">Indirizzo Immobile da Vendere</Label>
                              <Input
                                value={selectedLead.indirizzo_vendita || ''}
                                onChange={(e) => setSelectedLead({...selectedLead, indirizzo_vendita: e.target.value})}
                                className="h-12 rounded-xl border-gray-100"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs font-bold text-gray-500">Valutazione Stimata (€)</Label>
                              <Input
                                type="number"
                                value={selectedLead.valutazione_stimata || ''}
                                onChange={(e) => setSelectedLead({...selectedLead, valutazione_stimata: e.target.value})}
                                className="h-12 rounded-xl border-gray-100"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs font-bold text-gray-500">Scadenza Esclusiva</Label>
                              <Input
                                type="date"
                                value={selectedLead.scadenza_esclusiva || ''}
                                onChange={(e) => setSelectedLead({...selectedLead, scadenza_esclusiva: e.target.value})}
                                className="h-12 rounded-xl border-gray-100"
                              />
                            </div>
                            <div className="space-y-2 col-span-full">
                              <Label className="text-xs font-bold text-gray-500">Motivazione Vendita</Label>
                              <Input
                                value={selectedLead.motivazione_vendita || ''}
                                onChange={(e) => setSelectedLead({...selectedLead, motivazione_vendita: e.target.value})}
                                className="h-12 rounded-xl border-gray-100"
                              />
                            </div>
                          </div>
                        </section>
                      )}
                    </TabsContent>

                    <TabsContent value="immobili" className="mt-0 p-8 space-y-6 animate-in fade-in slide-in-from-bottom-2">
                      <div className="flex justify-between items-center">
                        <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Immobili Associati</h3>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-[#94b0ab] font-bold gap-2"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        >
                          <Plus size={14} /> Associa Immobile
                        </Button>
                      </div>

                      {!selectedLead.lead_immobili || selectedLead.lead_immobili.length === 0 ? (
                        <div className="py-20 text-center bg-gray-50 rounded-[2rem] border border-dashed border-gray-200">
                          <Heart className="mx-auto text-gray-300 mb-4" size={40} />
                          <p className="text-sm text-gray-400 font-medium">Nessun immobile nella wishlist.</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {selectedLead.lead_immobili.map((item: any) => (
                            <div key={item.id} className="p-5 bg-white rounded-2xl border border-gray-100 shadow-sm flex justify-between items-center group hover:border-[#94b0ab]/30 transition-all">
                              <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center text-[#94b0ab]">
                                  <HomeIcon size={20} />
                                </div>
                                <div>
                                  <p className="font-bold text-gray-900">{item.immobili.titolo}</p>
                                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                                    {item.stato_interesse} • {format(new Date(item.created_at), 'dd/MM/yyyy')}
                                  </p>
                                </div>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-[#94b0ab]"
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                              >
                                <ExternalLink size={16} />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="storico" className="mt-0 p-8 space-y-8 animate-in fade-in slide-in-from-bottom-2">
                      <div className="space-y-4">
                        <Label className="text-xs font-black uppercase tracking-widest text-gray-400 flex items-center gap-2">
                          <MessageSquare size={14} /> Messaggio Originale
                        </Label>
                        <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100 text-sm text-gray-600 leading-relaxed italic">
                          "{selectedLead.messaggio || 'Nessun messaggio ricevuto'}"
                        </div>
                      </div>

                      <div className="space-y-4">
                        <Label className="text-xs font-black uppercase tracking-widest text-gray-400 flex items-center gap-2">
                          <Save size={14} /> Note Interne (Private)
                        </Label>
                        <Textarea
                          value={selectedLead.note_interne || ''}
                          onChange={(e) => setSelectedLead({...selectedLead, note_interne: e.target.value})}
                          placeholder="Aggiungi dettagli sulla trattativa, feedback visite, etc..."
                          className="min-h-[200px] rounded-2xl border-gray-100 p-5 focus:ring-[#94b0ab]"
                        />
                      </div>
                    </TabsContent>
                  </div>
                </Tabs>
              </div>

              {/* Fixed Footer */}
              <div className="px-8 py-6 bg-white border-t shrink-0">
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
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default Leads;