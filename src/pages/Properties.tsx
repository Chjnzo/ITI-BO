"use client";

import React, { useEffect, useState, useCallback } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Button } from '@/components/ui/button';
import { 
  Plus, Pencil, Trash2, Home, CheckCircle2, 
  RotateCcw, Search, Star, ChevronLeft, ChevronRight, Calendar
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
import OpenHouseManager from '@/components/properties/OpenHouseManager';
import { supabase } from '@/lib/supabase';
import { showError, showSuccess } from '@/utils/toast';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 10;

const Properties = () => {
  const [properties, setProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("active"); // "active" | "sold"
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<any>(null);
  const [propertyToDelete, setPropertyToDelete] = useState<any>(null);

  // Open House State
  const [ohProperty, setOhProperty] = useState<any>(null);

  const fetchProperties = useCallback(async () => {
    setLoading(true);
    const from = (currentPage - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from('immobili')
      .select('*', { count: 'exact' });

    if (filter === "active") {
      query = query.neq('stato', 'Venduto');
    } else {
      query = query.eq('stato', 'Venduto');
    }

    if (searchQuery) {
      query = query.or(`titolo.ilike.%${searchQuery}%,zona.ilike.%${searchQuery}%,indirizzo.ilike.%${searchQuery}%,citta.ilike.%${searchQuery}%`);
    }

    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range(from, to);
    
    if (error) {
      showError("Errore nel caricamento immobili");
    } else {
      setProperties(data || []);
      setTotalCount(count || 0);
    }
    setLoading(false);
  }, [currentPage, filter, searchQuery]);

  useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filter, searchQuery]);

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
    const targetId = propertyToDelete.id;
    
    setProperties(prev => prev.filter(p => p.id !== targetId));
    setTotalCount(prev => prev - 1);
    setPropertyToDelete(null);

    const { error } = await supabase.from('immobili').delete().eq('id', targetId);
    if (error) {
      showError("Errore nell'eliminazione.");
      fetchProperties();
    } else {
      showSuccess("Immobile rimosso.");
    }
  };

  const toggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'Venduto' ? 'Disponibile' : 'Venduto';
    setProperties(prev => prev.map(p => p.id === id ? { ...p, stato: newStatus } : p));

    const { error } = await supabase.from('immobili').update({ stato: newStatus }).eq('id', id);
    if (error) {
      showError("Sincronizzazione fallita.");
      fetchProperties();
    } else {
      showSuccess(`Stato: ${newStatus}`);
      if ((filter === "active" && newStatus === 'Venduto') || (filter === "sold" && newStatus !== 'Venduto')) {
        fetchProperties();
      }
    }
  };

  const toggleFeatured = async (id: string, currentFeatured: boolean) => {
    if (!currentFeatured) {
      const featuredCount = properties.filter(p => p.in_evidenza).length;
      if (featuredCount >= 3) {
        showError("Massimo 3 immobili in evidenza su questa vista.");
      }
    }
    
    setProperties(prev => prev.map(p => p.id === id ? { ...p, in_evidenza: !currentFeatured } : p));
    const { error } = await supabase.from('immobili').update({ in_evidenza: !currentFeatured }).eq('id', id);
    if (error) {
      showError("Errore evidenza.");
      fetchProperties();
    }
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= Math.ceil(totalCount / PAGE_SIZE)) {
      setCurrentPage(newPage);
    }
  };

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
              In Vendita
            </TabsTrigger>
            <TabsTrigger value="sold" className="rounded-xl px-8 h-full data-[state=active]:bg-[#94b0ab] data-[state=active]:text-white font-bold transition-all">
              Venduti
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
              {loading ? (
                <tr><td colSpan={4} className="px-8 py-20 text-center text-gray-400 font-medium">Caricamento...</td></tr>
              ) : properties.length === 0 ? (
                <tr><td colSpan={4} className="px-8 py-20 text-center text-gray-400 font-medium italic">Nessun immobile trovato.</td></tr>
              ) : properties.map((prop) => (
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
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button 
                              onClick={() => setOhProperty(prop)}
                              className="text-gray-300 hover:text-[#94b0ab] transition-all active:scale-90"
                            >
                              <Calendar size={18} />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="rounded-xl font-bold">Gestisci Open House</TooltipContent>
                        </Tooltip>

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
        
        {/* Pagination Footer */}
        <div className="px-8 py-5 bg-gray-50/30 border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="text-sm text-gray-400 font-medium">
            Visualizzando <span className="text-gray-900 font-bold">{Math.min((currentPage - 1) * PAGE_SIZE + 1, totalCount)}</span>-
            <span className="text-gray-900 font-bold">{Math.min(currentPage * PAGE_SIZE, totalCount)}</span> di 
            <span className="text-gray-900 font-bold"> {totalCount}</span> immobili
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 1 || loading}
              onClick={() => handlePageChange(currentPage - 1)}
              className="rounded-xl border-gray-200 text-gray-500 font-bold hover:bg-white"
            >
              <ChevronLeft size={16} className="mr-1" /> Precedente
            </Button>
            <div className="flex items-center px-4 text-sm font-bold text-gray-900">
              Pagina {currentPage}
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= Math.ceil(totalCount / PAGE_SIZE) || loading}
              onClick={() => handlePageChange(currentPage + 1)}
              className="rounded-xl border-gray-200 text-gray-500 font-bold hover:bg-white"
            >
              Successivo <ChevronRight size={16} className="ml-1" />
            </Button>
          </div>
        </div>
      </div>

      {/* Modals */}
      <Dialog open={isWizardOpen} onOpenChange={setIsWizardOpen}>
        <DialogContent className="max-w-4xl h-[85vh] p-0 overflow-hidden border-none shadow-2xl rounded-[2.5rem]">
          <PropertyWizard initialData={editingProperty} onClose={() => setIsWizardOpen(false)} onSuccess={fetchProperties} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!ohProperty} onOpenChange={(open) => !open && setOhProperty(null)}>
        <DialogContent className="max-w-3xl h-[80vh] p-0 overflow-hidden border-none shadow-2xl rounded-[2.5rem]">
          {ohProperty && <OpenHouseManager property={ohProperty} onClose={() => setOhProperty(null)} />}
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