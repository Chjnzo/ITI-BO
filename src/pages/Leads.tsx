"use client";

import React, { useEffect, useState, useCallback } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';
import { showError, showSuccess } from '@/utils/toast';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  Phone, Mail, Home as HomeIcon, 
  MoreHorizontal, ArrowRight, User, 
  Euro, Search, MessageSquare, Save
} from 'lucide-react';
import { cn } from '@/lib/utils';

const COLUMNS = [
  { id: 'Nuovo', label: 'Nuovi Lead', color: 'bg-blue-50 border-blue-100 text-blue-700' },
  { id: 'In Trattativa', label: 'In Trattativa', color: 'bg-amber-50 border-amber-100 text-amber-700' },
  { id: 'Visita Fissata', label: 'Visita Fissata', color: 'bg-purple-50 border-purple-100 text-purple-700' },
  { id: 'Chiuso', label: 'Chiusi', color: 'bg-emerald-50 border-emerald-100 text-emerald-700' }
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

  const updateLeadStatus = async (id: string, newStatus: string) => {
    const { error } = await supabase
      .from('leads')
      .update({ stato: newStatus })
      .eq('id', id);
    
    if (error) showError("Errore nell'aggiornamento stato");
    else {
      showSuccess(`Spostato in ${newStatus}`);
      fetchLeads();
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
      showSuccess("Dettagli aggiornati");
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
        <p className="text-gray-500 mt-1 font-medium">Gestisci il funnel di vendita e le relazioni con i clienti.</p>
      </div>

      {/* Kanban Board */}
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

            <div className="flex-1 bg-gray-50/50 rounded-[2rem] p-4 border border-gray-100 overflow-y-auto space-y-4 scrollbar-hide">
              {loading ? (
                <div className="py-10 text-center text-gray-300 animate-pulse font-medium">Caricamento...</div>
              ) : getLeadsByStatus(col.id).length === 0 ? (
                <div className="py-10 text-center text-gray-300 italic text-sm">Nessun lead</div>
              ) : getLeadsByStatus(col.id).map((lead) => (
                <div 
                  key={lead.id}
                  onClick={() => setSelectedLead(lead)}
                  className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md hover:border-[#94b0ab]/30 transition-all cursor-pointer group"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="font-bold text-gray-900 group-hover:text-[#94b0ab] transition-colors">
                      {lead.nome} {lead.cognome}
                    </div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase">
                      {format(new Date(lead.created_at), 'dd MMM', { locale: it })}
                    </span>
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Phone size={12} className="text-gray-300" />
                      {lead.telefono || 'N/D'}
                    </div>
                    {lead.immobili && (
                      <div className="flex items-center gap-2 text-[10px] font-bold text-[#94b0ab] bg-[#94b0ab]/5 px-2 py-1 rounded-lg truncate">
                        <HomeIcon size={10} />
                        {lead.immobili.titolo}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-gray-50">
                    <div className="flex -space-x-2">
                      {COLUMNS.filter(c => c.id !== lead.stato).map(c => (
                        <button
                          key={c.id}
                          title={`Sposta in ${c.label}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            updateLeadStatus(lead.id, c.id);
                          }}
                          className="w-7 h-7 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center text-gray-400 hover:bg-[#94b0ab] hover:text-white transition-all"
                        >
                          <ArrowRight size={12} />
                        </button>
                      ))}
                    </div>
                    <MoreHorizontal size={16} className="text-gray-300" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Lead Detail Modal */}
      <Dialog open={!!selectedLead} onOpenChange={() => setSelectedLead(null)}>
        <DialogContent className="max-w-3xl rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden">
          {selectedLead && (
            <form onSubmit={handleSaveDetails} className="flex flex-col h-full">
              <DialogHeader className="px-8 pt-8 pb-6 border-b bg-white">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-[#94b0ab]/10 text-[#94b0ab] flex items-center justify-center">
                      <User size={28} />
                    </div>
                    <div>
                      <DialogTitle className="text-2xl font-bold text-gray-900">
                        {selectedLead.nome} {selectedLead.cognome}
                      </DialogTitle>
                      <p className="text-sm text-gray-400 font-medium">Lead acquisito il {format(new Date(selectedLead.created_at), 'PPP', { locale: it })}</p>
                    </div>
                  </div>
                  <Badge className={cn(
                    "px-4 py-1.5 rounded-full font-bold uppercase tracking-widest text-[10px]",
                    COLUMNS.find(c => c.id === selectedLead.stato)?.color
                  )}>
                    {selectedLead.stato}
                  </Badge>
                </div>
              </DialogHeader>
              
              <div className="p-8 space-y-8 overflow-y-auto max-h-[60vh]">
                {/* Contact Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                      <Input 
                        value={selectedLead.email || ''} 
                        onChange={(e) => setSelectedLead({...selectedLead, email: e.target.value})}
                        className="h-12 pl-12 rounded-xl border-gray-100"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Telefono</Label>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                      <Input 
                        value={selectedLead.telefono || ''} 
                        onChange={(e) => setSelectedLead({...selectedLead, telefono: e.target.value})}
                        className="h-12 pl-12 rounded-xl border-gray-100"
                      />
                    </div>
                  </div>
                </div>

                {/* CRM Fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Budget Massimo (€)</Label>
                    <div className="relative">
                      <Euro className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                      <Input 
                        type="number"
                        value={selectedLead.budget || ''} 
                        onChange={(e) => setSelectedLead({...selectedLead, budget: e.target.value})}
                        placeholder="Es: 250000"
                        className="h-12 pl-12 rounded-xl border-gray-100"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Tipologia Ricerca</Label>
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                      <Input 
                        value={selectedLead.tipologia_ricerca || ''} 
                        onChange={(e) => setSelectedLead({...selectedLead, tipologia_ricerca: e.target.value})}
                        placeholder="Es: Trilocale con giardino"
                        className="h-12 pl-12 rounded-xl border-gray-100"
                      />
                    </div>
                  </div>
                </div>

                {/* Message & Notes */}
                <div className="space-y-6">
                  <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100">
                    <Label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2 block">Messaggio Originale</Label>
                    <p className="text-sm text-gray-600 leading-relaxed italic">
                      "{selectedLead.messaggio || 'Nessun messaggio'}"
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-2">
                      <MessageSquare size={14} /> Note Interne (Private)
                    </Label>
                    <Textarea 
                      value={selectedLead.note_interne || ''} 
                      onChange={(e) => setSelectedLead({...selectedLead, note_interne: e.target.value})}
                      placeholder="Aggiungi dettagli sulla trattativa, preferenze specifiche..."
                      className="min-h-[120px] rounded-2xl border-gray-100 p-4"
                    />
                  </div>
                </div>
              </div>

              <DialogFooter className="p-8 bg-gray-50/50 border-t">
                <Button 
                  type="button" 
                  variant="ghost" 
                  onClick={() => setSelectedLead(null)}
                  className="rounded-xl font-bold text-gray-500"
                >
                  Annulla
                </Button>
                <Button 
                  type="submit"
                  disabled={isSaving}
                  className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl px-10 h-12 font-bold shadow-lg shadow-[#94b0ab]/20"
                >
                  {isSaving ? "Salvataggio..." : <><Save size={18} className="mr-2" /> Salva Dettagli</>}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default Leads;