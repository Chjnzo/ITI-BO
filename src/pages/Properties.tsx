import React, { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Button } from '@/components/ui/button';
import { Plus, Edit2, Trash2, Search, Home } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import PropertyWizard from '@/components/properties/PropertyWizard';
import { supabase } from '@/lib/supabase';
import { showError, showSuccess } from '@/utils/toast';
import { cn } from '@/lib/utils';

const Properties = () => {
  const [properties, setProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  const fetchProperties = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('immobili')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) showError("Errore nel caricamento immobili");
    else setProperties(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchProperties();
  }, []);

  const handleDelete = async (id: string) => {
    if (confirm("Sei sicuro di voler eliminare questo immobile?")) {
      const { error } = await supabase.from('immobili').delete().eq('id', id);
      if (error) showError("Errore durante l'eliminazione");
      else {
        showSuccess("Immobile eliminato");
        fetchProperties();
      }
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: any = {
      'Disponibile': 'bg-green-100 text-green-700',
      'Trattativa': 'bg-yellow-100 text-yellow-700',
      'Venduto': 'bg-red-100 text-red-700'
    };
    return (
      <span className={cn("px-3 py-1 rounded-full text-xs font-semibold", colors[status] || 'bg-gray-100')}>
        {status}
      </span>
    );
  };

  return (
    <AdminLayout>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Immobili</h1>
          <p className="text-gray-500">Gestisci il tuo catalogo immobiliare</p>
        </div>
        
        <Dialog open={isWizardOpen} onOpenChange={setIsWizardOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl px-6 py-6 shadow-lg shadow-[#94b0ab]/20">
              <Plus className="mr-2" size={20} /> Nuovo Immobile
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl rounded-3xl">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold">Aggiungi Immobile</DialogTitle>
            </DialogHeader>
            <PropertyWizard 
              onClose={() => setIsWizardOpen(false)} 
              onSuccess={fetchProperties} 
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50/50 border-b border-gray-100">
              <th className="px-6 py-4 text-sm font-semibold text-gray-600">Immobile</th>
              <th className="px-6 py-4 text-sm font-semibold text-gray-600">Prezzo</th>
              <th className="px-6 py-4 text-sm font-semibold text-gray-600">Stato</th>
              <th className="px-6 py-4 text-sm font-semibold text-gray-600 text-right">Azioni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={4} className="px-6 py-12 text-center text-gray-400">Caricamento...</td></tr>
            ) : properties.length === 0 ? (
              <tr><td colSpan={4} className="px-6 py-12 text-center text-gray-400">Nessun immobile trovato</td></tr>
            ) : properties.map((prop) => (
              <tr key={prop.id} className="hover:bg-gray-50/50 transition-colors group">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                      {prop.immagini_urls?.[0] ? (
                        <img src={prop.immagini_urls[0]} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300">
                          <Home size={24} />
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="font-bold text-[#1a1a1a]">{prop.titolo}</div>
                      <div className="text-sm text-gray-500">{prop.citta} • {prop.mq}mq</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 font-medium">
                  € {prop.prezzo.toLocaleString()}
                </td>
                <td className="px-6 py-4">
                  {getStatusBadge(prop.stato)}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="rounded-lg hover:bg-blue-50 hover:text-blue-600">
                      <Edit2 size={18} />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleDelete(prop.id)}
                      className="rounded-lg hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 size={18} />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
};

export default Properties;