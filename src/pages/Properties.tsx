"use client";

import React, { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Button } from '@/components/ui/button';
import { 
  Plus, Edit2, Trash2, Home, CheckCircle2, 
  MoreHorizontal, RotateCcw, Search, Star 
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const [filter, setFilter] = useState("active"); // Default: In Vendita
  const [searchQuery, setSearchQuery] = useState("");
  
  // Modal State
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

  // --- FORMATTERS ---
  const formatPrice = (price: number) => {
    if (!price) return 'N/D';
    return new Intl.NumberFormat('it-IT', { 
      style: 'currency', 
      currency: 'EUR',
      maximumFractionDigits: 0 
    }).format(price);
  };

  // --- OPTIMISTIC ACTIONS ---
  const handleDelete = async () => {
    if (!propertyToDelete) return;
    const previousProperties = [...properties];
    const targetId = propertyToDelete.id;
    setProperties(prev => prev.filter(p => p.id !== targetId));
    setPropertyToDelete(null);

    const { error } = await supabase.from('immobili').delete().eq('id', targetId);
    if (error) {
      setProperties(previousProperties);
      showError("Connessione fallita. Modifica annullata.");
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

  // --- FILTERING LOGIC ---
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
          <p className="text-gray-500 mt-1 font-medium">Gestione rapida del portafoglio immobiliare.</p>
        </div>
        
        <Button 
          onClick={() => { setEditingProperty(null); setIsWizardOpen(true); }}
          className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-2xl px-8 h-14 shadow-lg shadow-[#94b0ab]/20 font-bold transition-all"
        >
          <Plus className="mr-2" size={20} /> Nuovo Immobile
        </Button>
      </div>

      {/* FILTER BAR: TABS + SEARCH */}
      <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between mb-8 gap-4">
        <Tabs value={filter} onValueChange={setFilter} className="w-full xl:w-auto">
          <TabsList className="bg-white border border-gray-100 p-1.5 rounded-2xl h-14 w-full xl:w-auto flex justify-start gap-1">
            <TabsTrigger 
              value="active" 
              className="rounded-xl px-8 h-full data-[state=active]:bg-[#94b0ab] data-[state=active]:text-white font-bold transition-all flex-1 xl:flex-none"
            >
              In Vendita ({properties.filter(p => p.stato !== 'Venduto').length})
            </TabsTrigger>
            <TabsTrigger 
              value="sold" 
              className="rounded-xl px-8 h-full data-[state=active]:bg-[#94b0ab] data-[state=active]:text-white font-bold transition-all flex-1 xl:flex-none"
            >
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

      {/* FIXED TABLE CONTAINER */}
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden">
        <div className="w-full overflow-hidden">
          <table className="w-full table-fixed text-left">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="w-[45%] px-8 py-5 text-xs font-bold uppercase tracking-widest text-gray-400">Immobile</th>
                <th className="w-[20%] px-8 py-5 text-xs font-bold uppercase tracking-widest text-gray-400 text-right">Prezzo</th>
                <th className="w-[15%] px-8 py-5 text-xs font-bold uppercase tracking-widest text-gray-400 text-center">Stato</th>
                <th className="w-[20%] px-8 py-5 text-xs font-bold uppercase tracking-widest text-gray-400 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading && properties.length === 0 ? (
                <tr><td colSpan={4} className="px-8 py-20 text-center text-gray-400 font-medium">Sincronizzazione...</td></tr>
              ) : filteredProperties.length === 0 ? (
                <tr><td colSpan={4} className="px-8 py-20 text-center text-gray-400 font-medium italic">Nessun risultato trovato.</td></tr>
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
                        {prop.in_evidenza && (
                          <div className="absolute top-1 left-1 bg-yellow-400 p-0.5 rounded-md shadow-sm border border-white">
                            <Star size={8} className="fill-white text-white" />
                          </div>
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
                      "inline-flex px-3 py-1 rounded-full text-[0.7rem] font-black uppercase tracking-tighter border whitespace-nowrap",
                      prop.stato === 'Venduto' ? "bg-gray-100 text-gray-600 border-gray-200" : "bg-emerald-50 text-emerald-700 border-emerald-100"
                    )}>
                      {prop.stato}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <div className="flex justify-end items-center gap-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => toggleFeatured(prop.id, prop.in_evidenza)}
                              className={cn(
                                "rounded-xl h-10 w-10 transition-all",
                                prop.in_evidenza ? "text-yellow-500 bg-yellow-50" : "text-gray-300 hover:text-yellow-500 hover:bg-yellow-50"
                              )}
                            >
                              <Star size={20} className={cn(prop.in_evidenza && "fill-yellow-500")} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent><p>Evidenza</p></TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => toggleStatus(prop.id, prop.stato)}
                        className={cn(
                          "rounded-xl h-10 font-bold px-4 transition-all border-2",
                          prop.stato === 'Venduto' ? "border-blue-100 text-blue-600 hover:bg-blue-50" : "border-emerald-100 text-emerald-600 hover:bg-emerald-50"
                        )}
                      >
                        {prop.stato === 'Venduto' ? <RotateCcw size={18} /> : <CheckCircle2 size={18} />}
                      </Button>
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="rounded-xl h-10 w-10 text-gray-400">
                            <MoreHorizontal size={20} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="rounded-2xl border-gray-100 shadow-xl p-2 min-w-[160px]">
                          <DropdownMenuItem onClick={() => { setEditingProperty(prop); setIsWizardOpen(true); }} className="rounded-xl px-4 py-3 cursor-pointer font-bold">
                            <Edit2 size={16} className="mr-3 text-[#94b0ab]" /> Modifica
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setPropertyToDelete(prop)} className="rounded-xl px-4 py-3 cursor-pointer font-bold text-red-600 focus:text-red-600 focus:bg-red-50">
                            <Trash2 size={16} className="mr-3" /> Elimina
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

      {/* Modals & Dialogs */}
      <Dialog open={isWizardOpen} onOpenChange={setIsWizardOpen}>
        <DialogContent className="max-w-4xl h-[85vh] p-0 overflow-hidden border-none shadow-2xl rounded-[2.5rem]">
          <PropertyWizard initialData={editingProperty} onClose={() => setIsWizardOpen(false)} onSuccess={fetchProperties} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!propertyToDelete} onOpenChange={(open) => !open && setPropertyToDelete(null)}>
        <AlertDialogContent className="rounded-[2rem] border-none shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold">Eliminare l'immobile?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 font-medium">Rimuoverai "{propertyToDelete?.titolo}" istantaneamente.</AlertDialogDescription>
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