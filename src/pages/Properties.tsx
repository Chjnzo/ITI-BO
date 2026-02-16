"use client";

import React, { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Button } from '@/components/ui/button';
import { 
  Plus, Pencil, Trash2, Home, CheckCircle2, 
  RotateCcw, Search, Star 
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import PropertyWizard from '@/components/properties/PropertyWizard';
import { supabase } from '@/lib/supabase';
import { showError, showSuccess } from '@/utils/toast';
import { cn } from '@/lib/utils';

const Properties = () => {
  const [properties, setProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("active");
  const [searchQuery, setSearchQuery] = useState("");
  
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<any>(null);
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

  const formatPrice = (price: number) => {
    if (!price) return 'N/D';
    return new Intl.NumberFormat('it-IT', { 
      style: 'currency', 
      currency: 'EUR',
      maximumFractionDigits: 0 
    }).format(price);
  };

  const handleDelete = async () => {
    if (!propertyToDelete) return;
    const previousProperties = [...properties];
    const targetId = propertyToDelete.id;
    setProperties(prev => prev.filter(p => p.id !== targetId));
    setPropertyToDelete(null);

    const { error } = await supabase.from('immobili').delete().eq('id', targetId);
    if (error) {
      setProperties(previousProperties);
      showError("Errore nell'eliminazione.");
    } else {
      showSuccess("Immobile rimosso.");
    }
  };

  const toggleStatus = async (id: string, currentStatus: string) => {
    const previousProperties = [...properties];
    const newStatus = currentStatus === 'Venduto' ? 'Disponibile' : 'Venduto';
    setProperties(prev => prev.map(p => p.id === id ? { ...p, stato: newStatus } : p));

    const { error } = await supabase.from('immobili').update({ stato: newStatus }).eq('id', id);
    if (error) {
      setProperties(previousProperties);
      showError("Sincronizzazione fallita.");
    } else {
      showSuccess(`Stato: ${newStatus}`);
    }
  };

  const toggleFeatured = async (id: string, currentFeatured: boolean) => {
    if (!currentFeatured) {
      const featuredCount = properties.filter(p => p.in_evidenza).length;
      if (featuredCount >= 3) {
        showError("Massimo 3 immobili in evidenza.");
        return;
      }
    }
    const previousProperties = [...properties];
    setProperties(prev => prev.map(p => p.id === id ? { ...p, in_evidenza: !currentFeatured } : p));

    const { error } = await supabase.from('immobili').update({ in_evidenza: !currentFeatured }).eq('id', id);
    if (error) {
      setProperties(previousProperties);
      showError("Errore evidenza.");
    }
  };

  const filteredProperties = properties.filter(p => {
    const matchesTab = filter === "active" ? p.stato !== 'Venduto' : p.stato === 'Venduto';
    const matchesSearch = 
      p.titolo?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.zona?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.indirizzo?.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesTab && matchesSearch;
  });

  return (
    <AdminLayout>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900">Dashboard Immobili</h1>
          <p className="text-gray-500 mt-1 font-medium">Gestione immediata del tuo portafoglio.</p>
        </div>
        
        <Button 
          onClick={() => { setEditingProperty(null); setIsWizardOpen(true); }}
          className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-2xl px-8 h-14 shadow-lg shadow-[#94b0ab]/20 font-bold transition-all"
        >
          <Plus className="mr-2" size={20} /> Nuovo Immobile
        </Button>
      </div>

      <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between mb-8 gap-4">
        <Tabs value={filter} onValueChange={setFilter} className="w-full xl:w-auto">
          <TabsList className="bg-white border border-gray-100 p-1.5 rounded-2xl h-14 w-full xl:w-auto flex justify-start gap-1">
            <TabsTrigger value="active" className="rounded-xl px-8 h-full data-[state=active]:bg-[#94b0ab] data-[state=active]:text-white font-bold transition-all">
              In Vendita ({properties.filter(p => p.stato !== 'Venduto').length})
            </TabsTrigger>
            <TabsTrigger value="sold" className="rounded-xl px-8 h-full data-[state=active]:bg-[#94b0ab] data-[state=active]:text-white font-bold transition-all">
              Venduti ({properties.filter(p => p.stato === 'Venduto').length})
            </TabsTrigger>
          </TabsList>
        </Tabs>
        
        <div className="relative flex-1 max-w-xl group">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#94b0ab] transition-colors" size={20} />
          <Input 
            placeholder="Cerca per titolo, zona o indirizzo..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-14 pl-14 pr-6 rounded-2xl border-gray-100 bg-white shadow-sm focus:ring-2 focus:ring-[#94b0ab]/20 focus:border-[#94b0ab] transition-all"
          />
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden">
        <div className="w-full overflow-hidden">
          <table className="w-full table-fixed text-left">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="w-[45%] px-8 py-5 text-xs font-bold uppercase tracking-widest text-gray-400">Immobile</th>
                <th className="w-[20%] px-8 py-5 text-xs font-bold uppercase tracking-widest text-gray-400 text-right">Prezzo</th>
                <th className="w-[12%] px-8 py-5 text-xs font-bold uppercase tracking-widest text-gray-400 text-center">Stato</th>
                <th className="w-[23%] px-8 py-5 text-xs font-bold uppercase tracking-widest text-gray-400 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading && properties.length === 0 ? (
                <tr><td colSpan={4} className="px-8 py-20 text-center text-gray-400 font-medium">Caricamento...</td></tr>
              ) : filteredProperties.length === 0 ? (
                <tr><td colSpan={4} className="px-8 py-20 text-center text-gray-400 font-medium italic">Nessun immobile trovato.</td></tr>
              ) : filteredProperties.map((prop) => (
                <tr key={prop.id} className="hover:bg-gray-50/30 transition-colors group">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-5 min-w-0">
                      <div className="relative w-16 h-16 rounded-2xl overflow-hidden bg-gray-100 border border-gray-100 flex-shrink-0 shadow-sm">
                        {prop.copertina_url ? (
                          <img src={prop.copertina_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-300"><Home size={24} /></div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-gray-900 text-[1.05rem] truncate">{prop.titolo}</div>
                        <div className="text-sm text-gray-400 truncate mt-0.5 font-medium">{prop.citta}, {prop.zona || prop.indirizzo}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <div className="font-bold text-gray-900 text-lg">{formatPrice(prop.prezzo)}</div>
                  </td>
                  <td className="px-8 py-5 text-center">
                    <span className={cn(
                      "inline-flex px-3 py-1 rounded-full text-[0.65rem] font-black uppercase tracking-tighter border",
                      prop.stato === 'Venduto' ? "bg-gray-100 text-gray-600 border-gray-200" : "bg-emerald-50 text-emerald-700 border-emerald-100"
                    )}>
                      {prop.stato}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <TooltipProvider>
                        {/* FEATURED TOGGLE */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button 
                              onClick={() => toggleFeatured(prop.id, prop.in_evidenza)}
                              className="transition-all active:scale-90"
                            >
                              <Star 
                                size={18} 
                                className={cn(
                                  "transition-colors",
                                  prop.in_evidenza ? "fill-[#facc15] text-[#facc15]" : "text-gray-300 hover:text-gray-500"
                                )} 
                              />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="rounded-xl font-bold">In Evidenza</TooltipContent>
                        </Tooltip>

                        {/* STATUS TOGGLE */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button 
                              onClick={() => toggleStatus(prop.id, prop.stato)}
                              className="text-gray-300 hover:text-emerald-600 transition-all active:scale-90"
                            >
                              {prop.stato === 'Venduto' ? <RotateCcw size={18} /> : <CheckCircle2 size={18} />}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="rounded-xl font-bold">
                            {prop.stato === 'Venduto' ? "Rimetti in Vendita" : "Segna come Venduto"}
                          </TooltipContent>
                        </Tooltip>

                        {/* EDIT BUTTON */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button 
                              onClick={() => { setEditingProperty(prop); setIsWizardOpen(true); }}
                              className="text-gray-300 hover:text-blue-600 transition-all active:scale-90"
                            >
                              <Pencil size={18} />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="rounded-xl font-bold">Modifica Immobile</TooltipContent>
                        </Tooltip>

                        {/* DELETE BUTTON */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button 
                              onClick={() => setPropertyToDelete(prop)}
                              className="text-red-500 hover:text-red-700 bg-red-50 p-1.5 rounded-lg transition-all active:scale-90"
                            >
                              <Trash2 size={18} />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="rounded-xl font-bold">Elimina Immobile</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      <Dialog open={isWizardOpen} onOpenChange={setIsWizardOpen}>
        <DialogContent className="max-w-4xl h-[85vh] p-0 overflow-hidden border-none shadow-2xl rounded-[2.5rem]">
          <PropertyWizard initialData={editingProperty} onClose={() => setIsWizardOpen(false)} onSuccess={fetchProperties} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!propertyToDelete} onOpenChange={(open) => !open && setPropertyToDelete(null)}>
        <AlertDialogContent className="rounded-[2rem] border-none shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold">Confermi l'eliminazione?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 font-medium">L'operazione è immediata e irreversibile.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-xl border-gray-200 font-bold">Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold">Sì, elimina</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default Properties;