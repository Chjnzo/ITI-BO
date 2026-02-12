import React, { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';
import { showError, showSuccess } from '@/utils/toast';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Phone, Mail, Calendar, Home as HomeIcon } from 'lucide-react';

const Leads = () => {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<any>(null);

  const fetchLeads = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) showError("Errore nel caricamento messaggi");
    else setLeads(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchLeads();
  }, []);

  const updateStatus = async (id: string, newStatus: string) => {
    const { error } = await supabase
      .from('leads')
      .update({ stato: newStatus })
      .eq('id', id);
    
    if (error) showError("Errore nell'aggiornamento");
    else {
      showSuccess("Stato aggiornato");
      fetchLeads();
      setSelectedLead(null);
    }
  };

  return (
    <AdminLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Messaggi</h1>
        <p className="text-gray-500">Gestisci le richieste dei potenziali clienti</p>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="divide-y divide-gray-50">
          {loading ? (
            <div className="p-12 text-center text-gray-400">Caricamento...</div>
          ) : leads.length === 0 ? (
            <div className="p-12 text-center text-gray-400">Nessun messaggio ricevuto</div>
          ) : leads.map((lead) => (
            <div 
              key={lead.id} 
              onClick={() => setSelectedLead(lead)}
              className={cn(
                "flex items-center gap-6 px-6 py-5 cursor-pointer hover:bg-gray-50 transition-colors",
                lead.stato === 'Nuovo' ? "bg-[#94b0ab]/5 border-l-4 border-[#94b0ab]" : "border-l-4 border-transparent"
              )}
            >
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-[#94b0ab] font-bold text-lg">
                {lead.nome.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="font-bold text-[#1a1a1a] truncate">{lead.nome}</h3>
                  <span className="text-xs text-gray-400">
                    {format(new Date(lead.created_at), 'dd MMM, HH:mm', { locale: it })}
                  </span>
                </div>
                <p className="text-sm text-gray-500 truncate">{lead.messaggio}</p>
              </div>
              <div className="flex items-center gap-4">
                <span className={cn(
                  "px-3 py-1 rounded-full text-xs font-semibold",
                  lead.stato === 'Nuovo' ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
                )}>
                  {lead.stato}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Lead Detail Modal */}
      <Dialog open={!!selectedLead} onOpenChange={() => setSelectedLead(null)}>
        <DialogContent className="max-w-2xl rounded-3xl">
          {selectedLead && (
            <div className="space-y-6">
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold">{selectedLead.nome}</DialogTitle>
              </DialogHeader>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-2xl">
                  <Mail className="text-[#94b0ab]" size={20} />
                  <div>
                    <p className="text-xs text-gray-400 uppercase font-bold">Email</p>
                    <p className="font-medium">{selectedLead.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-2xl">
                  <Phone className="text-[#94b0ab]" size={20} />
                  <div>
                    <p className="text-xs text-gray-400 uppercase font-bold">Telefono</p>
                    <p className="font-medium">{selectedLead.telefono}</p>
                  </div>
                </div>
              </div>

              <div className="p-6 bg-gray-50 rounded-2xl space-y-2">
                <p className="text-xs text-gray-400 uppercase font-bold">Messaggio</p>
                <p className="text-gray-700 leading-relaxed">{selectedLead.messaggio}</p>
              </div>

              <div className="flex justify-between items-center pt-4">
                <div className="flex gap-2">
                  <Button 
                    onClick={() => updateStatus(selectedLead.id, 'Contattato')}
                    className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl"
                  >
                    Segna come Contattato
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => updateStatus(selectedLead.id, 'Archiviato')}
                    className="rounded-xl"
                  >
                    Archivia
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default Leads;