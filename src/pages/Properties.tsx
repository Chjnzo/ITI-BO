import React, { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Button } from '@/components/ui/button';
import { Plus, Edit2, Trash2, Home, CheckCircle2, MoreHorizontal } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import PropertyWizard from '@/components/properties/PropertyWizard';
import { supabase } from '@/lib/supabase';
import { showError, showSuccess } from '@/utils/toast';
import { cn } from '@/lib/utils';

const Properties = () => {
  const [properties, setProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal State
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<any>(null);
  
  // Delete Dialog State
  const [propertyToDelete, setPropertyToDelete] = useState<any>(null);

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

  const handleDelete = async () => {
    if (!propertyToDelete) return;
    
    const { error } = await supabase.from('immobili').delete().eq('id', propertyToDelete.id);
    if (error) showError("Errore durante l'eliminazione");
    else {
      showSuccess("Immobile eliminato correttamente");
      fetchProperties();
    }
    setPropertyToDelete(null);
  };

  const markAsSold = async (id: string) => {
    const { error } = await supabase
      .from('immobili')
      .update({ stato: 'Venduto' })
      .eq('id', id);
    
    if (error) showError("Errore nell'aggiornamento");
    else {
      showSuccess("Immobile segnato come Venduto");
      fetchProperties();
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: any = {
      'Disponibile': 'bg-emerald-100 text-emerald-700 border-emerald-200',
      'Trattativa': 'bg-amber-100 text-amber-700 border-amber-200',
      'Venduto': 'bg-slate-100 text-slate-700 border-slate-200'
    };
    return (
      <span className={cn("px-3 py-1 rounded-full text-xs font-bold border", styles[status] || 'bg-gray-100')}>
        {status}
      </span>
    );
  };

  return (
    <AdminLayout>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-[#1a1a1a]">I Tuoi Immobili</h1>
          <p className="text-gray-500 mt-1">Gestisci il catalogo e monitora lo stato delle vendite.</p>
        </div>
        
        <Button 
          onClick={() => { setEditingProperty(null); setIsWizardOpen(true); }}
          className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-2xl px-8 h-14 shadow-xl shadow-[#94b0ab]/20 font-bold transition-all active:scale-95"
        >
          <Plus className="mr-2" size={20} /> Nuovo Immobile
        </Button>
      </div>

      {/* Main Content Modal */}
      <Dialog open={isWizardOpen} onOpenChange={setIsWizardOpen}>
        <DialogContent 
          className="max-w-4xl h-[85vh] p-0 overflow-hidden border-none shadow-2xl rounded-[2rem]"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <PropertyWizard 
            initialData={editingProperty}
            onClose={() => setIsWizardOpen(false)} 
            onSuccess={fetchProperties} 
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!propertyToDelete} onOpenChange={(open) => !open && setPropertyToDelete(null)}>
        <AlertDialogContent className="rounded-3xl border-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold">Sei assolutamente sicuro?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500">
              L'azione è irreversibile. L'immobile "{propertyToDelete?.titolo}" verrà rimosso permanentemente dal database e dal sito pubblico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-xl border-gray-200">Annulla</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-red-500 hover:bg-red-600 text-white rounded-xl"
            >
              Sì, Elimina Immobile
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Table Container */}
      <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="px-8 py-5 text-xs font-bold uppercase tracking-widest text-gray-400">Immobile</th>
                <th className="px-8 py-5 text-xs font-bold uppercase tracking-widest text-gray-400">Prezzo / MQ</th>
                <th className="px-8 py-5 text-xs font-bold uppercase tracking-widest text-gray-400">Stato</th>
                <th className="px-8 py-5 text-xs font-bold uppercase tracking-widest text-gray-400 text-right">Azioni Rapide</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={4} className="px-8 py-20 text-center text-gray-400">Caricamento in corso...</td></tr>
              ) : properties.length === 0 ? (
                <tr><td colSpan={4} className="px-8 py-20 text-center text-gray-400">Nessun immobile in catalogo.</td></tr>
              ) : properties.map((prop) => (
                <tr key={prop.id} className="hover:bg-gray-50/30 transition-colors group">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-5">
                      <div className="w-20 h-20 rounded-2xl overflow-hidden bg-gray-100 border border-gray-100 flex-shrink-0 shadow-sm">
                        {prop.copertina_url ? (
                          <img src={prop.copertina_url} alt="" className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-300"><Home size={32} /></div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-[#1a1a1a] text-lg truncate">{prop.titolo}</div>
                        <div className="text-sm text-gray-400 flex items-center gap-1.5 mt-0.5">
                          <span className="font-medium text-gray-500">{prop.citta}</span>
                          <span>•</span>
                          <span>{prop.mq} mq</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="font-bold text-gray-900 text-lg">€ {prop.prezzo.toLocaleString()}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{Math.round(prop.prezzo / prop.mq).toLocaleString()} €/mq</div>
                  </td>
                  <td className="px-8 py-5">
                    {getStatusBadge(prop.stato)}
                  </td>
                  <td className="px-8 py-5 text-right">
                    <div className="flex justify-end items-center gap-2">
                      {prop.stato !== 'Venduto' && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => markAsSold(prop.id)}
                          className="rounded-xl border-emerald-100 text-emerald-600 hover:bg-emerald-50 h-9 font-bold px-4"
                        >
                          <CheckCircle2 size={16} className="mr-1.5" /> Venduto
                        </Button>
                      )}
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="rounded-xl h-9 w-9 text-gray-400">
                            <MoreHorizontal size={20} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="rounded-2xl border-gray-100 shadow-xl p-2 min-w-[160px]">
                          <DropdownMenuItem 
                            onClick={() => { setEditingProperty(prop); setIsWizardOpen(true); }}
                            className="rounded-xl px-4 py-2.5 cursor-pointer font-medium"
                          >
                            <Edit2 size={16} className="mr-2.5 text-[#94b0ab]" /> Modifica Dati
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => setPropertyToDelete(prop)}
                            className="rounded-xl px-4 py-2.5 cursor-pointer font-medium text-red-600 focus:text-red-600 focus:bg-red-50"
                          >
                            <Trash2 size={16} className="mr-2.5" /> Elimina
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
};

export default Properties;