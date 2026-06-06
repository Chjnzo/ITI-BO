"use client";

import React, { useEffect, useRef, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Button } from '@/components/ui/button';
import {
  Plus, Pencil, Trash2, Home, CheckCircle2,
  RotateCcw, Search, Star, Calendar, Building2, Eye, EyeOff
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Sheet, SheetContent } from '@/components/ui/sheet';
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
import UnitaSheet from '@/components/properties/UnitaSheet';
import EvidenzaModal from '@/components/properties/EvidenzaModal';
import { supabase } from '@/lib/supabase';
import { showError, showSuccess } from '@/utils/toast';
import { cn } from '@/lib/utils';
import { useProperties } from '@/hooks/useProperties';
import { useQueryClient } from '@tanstack/react-query';

const PAGE_SIZE = 20;

const Properties = () => {
  const [filter, setFilter] = useState<'active' | 'sold'>('active');
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearch = (value: string) => {
    setSearchQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(value), 300);
  };

  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<any>(null);
  const [propertyToDelete, setPropertyToDelete] = useState<any>(null);

  const [ohProperty, setOhProperty] = useState<any>(null);
  const [unitaProperty, setUnitaProperty] = useState<any>(null);
  const [evidenzaOpen, setEvidenzaOpen] = useState(false);

  const queryClient = useQueryClient();
  const { data: propertiesData, isFetching: loading } = useProperties(currentPage, filter, debouncedSearch);
  const properties = (propertiesData?.data ?? []) as any[];
  const totalCount = propertiesData?.count ?? 0;

  const refetchProperties = () => queryClient.invalidateQueries({ queryKey: ['properties'] });

  useEffect(() => { setCurrentPage(1); }, [filter, debouncedSearch]);

  const formatPrice = (price: number) => {
    if (!price) return 'Su richiesta';
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0
    }).format(price);
  };

  const handleDelete = async () => {
    if (!propertyToDelete) return;
    const targetId = propertyToDelete.id;
    setPropertyToDelete(null);

    const { error } = await supabase
      .from('immobili')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', targetId);
    if (error) {
      showError("Errore nell'eliminazione.");
    } else {
      showSuccess("Immobile rimosso.");
      refetchProperties();
    }
  };

  const toggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'Venduto' ? 'Disponibile' : 'Venduto';
    const { error } = await supabase.from('immobili').update({ stato: newStatus }).eq('id', id);
    if (error) {
      showError("Sincronizzazione fallita.");
    } else {
      showSuccess(`Stato: ${newStatus}`);
      refetchProperties();
    }
  };

  const toggleVisibile = async (id: string, current: boolean) => {
    const { error } = await supabase.from('immobili').update({ visibile: !current }).eq('id', id);
    if (error) showError("Errore visibilità.");
    else refetchProperties();
  };

  const toggleFeatured = async (id: string, currentFeatured: boolean) => {
    if (!currentFeatured) {
      const featuredCount = properties.filter(p => p.in_evidenza).length;
      if (featuredCount >= 3) {
        showError("Massimo 3 immobili in evidenza su questa vista.");
        return;
      }
    }
    const { error } = await supabase.from('immobili').update({ in_evidenza: !currentFeatured }).eq('id', id);
    if (error) {
      showError("Errore evidenza.");
    } else {
      refetchProperties();
    }
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= Math.ceil(totalCount / PAGE_SIZE)) {
      setCurrentPage(newPage);
    }
  };

  return (
    <AdminLayout fullHeight>
      <div className="flex flex-col flex-1 overflow-hidden min-h-0">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-6 shrink-0">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-gray-900">Dashboard Immobili</h1>
            <p className="text-gray-500 mt-1 font-medium">Gestione immediata del tuo portafoglio.</p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => setEvidenzaOpen(true)}
              className="rounded-2xl px-6 h-14 font-bold border-gray-200 gap-2 hover:border-amber-300 hover:text-amber-600 hover:bg-amber-50 transition-all"
            >
              <Star size={18} className="fill-[#facc15] text-[#facc15]" />
              In Evidenza
            </Button>
            <Button
              onClick={() => { setEditingProperty(null); setIsWizardOpen(true); }}
              className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-2xl px-8 h-14 shadow-lg shadow-[#94b0ab]/20 font-bold transition-all"
            >
              <Plus className="mr-2" size={20} />
              Nuovo Immobile
            </Button>
          </div>
        </div>

        <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between mb-6 gap-4 shrink-0">
          <Tabs value={filter} onValueChange={setFilter} className="w-auto">
            <TabsList className="grid grid-cols-2 w-[220px] rounded-full p-1 bg-muted/50 border border-gray-100">
              <TabsTrigger value="active" className="rounded-full px-5 text-xs font-semibold data-[state=active]:bg-[#94b0ab] data-[state=active]:text-white">
                In Vendita
              </TabsTrigger>
              <TabsTrigger value="sold" className="rounded-full px-5 text-xs font-semibold data-[state=active]:bg-[#94b0ab] data-[state=active]:text-white">
                Venduti
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="relative flex-1 max-w-xl group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#94b0ab] transition-colors" size={20} />
            <Input
              placeholder="Cerca per titolo, zona o indirizzo..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="h-14 pl-14 pr-6 rounded-2xl border-gray-100 bg-white shadow-sm focus:ring-2 focus:ring-[#94b0ab]/20 focus:border-[#94b0ab] transition-all"
            />
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden">
          <div className="h-full bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-y-auto">
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
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-4">
                            <div className="w-16 h-12 rounded-xl bg-gray-100 animate-pulse shrink-0" />
                            <div className="space-y-1.5 flex-1 min-w-0">
                              <div className="h-3.5 bg-gray-100 rounded-lg animate-pulse w-3/4" />
                              <div className="h-3 bg-gray-50 rounded-lg animate-pulse w-1/2" />
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-5"><div className="h-4 bg-gray-100 rounded-lg animate-pulse w-24" /></td>
                        <td className="px-8 py-5 text-center"><div className="h-6 bg-gray-100 rounded-full animate-pulse w-20 mx-auto" /></td>
                        <td className="px-8 py-5"><div className="h-4 bg-gray-50 rounded-lg animate-pulse w-16 ml-auto" /></td>
                      </tr>
                    ))
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
                            {prop.locali === 'Nuova costruzione' && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={() => setUnitaProperty(prop)}
                                    className="text-gray-300 hover:text-[#94b0ab] transition-all active:scale-90"
                                  >
                                    <Building2 size={18} />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent className="rounded-xl font-bold">Gestisci Unità</TooltipContent>
                              </Tooltip>
                            )}

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => toggleVisibile(prop.id, prop.visibile ?? true)}
                                  className={cn("transition-all active:scale-90", prop.visibile === false ? "text-amber-400 hover:text-amber-500" : "text-gray-300 hover:text-gray-500")}
                                >
                                  {prop.visibile === false ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="rounded-xl font-bold">
                                {prop.visibile === false ? "Nascoste dal sito — clicca per mostrare" : "Visibile sul sito — clicca per nascondere"}
                              </TooltipContent>
                            </Tooltip>

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

          </div>
        </div>
      </div>

      {/* Pagination — fuori dalla card, sempre visibile */}
      {totalCount > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 shrink-0">
          <p className="text-xs text-gray-400 font-medium">
            {Math.min((currentPage - 1) * PAGE_SIZE + 1, totalCount)}–{Math.min(currentPage * PAGE_SIZE, totalCount)} di {totalCount}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 1 || loading}
              onClick={() => handlePageChange(currentPage - 1)}
              className="rounded-xl border-gray-200 h-9 px-4 text-xs font-bold"
            >
              ← Precedente
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= Math.ceil(totalCount / PAGE_SIZE) || loading}
              onClick={() => handlePageChange(currentPage + 1)}
              className="rounded-xl border-gray-200 h-9 px-4 text-xs font-bold"
            >
              Successiva →
            </Button>
          </div>
        </div>
      )}

      <Dialog open={isWizardOpen} onOpenChange={setIsWizardOpen}>
        <DialogContent
          className="max-w-5xl h-[85vh] p-0 overflow-hidden border-none shadow-2xl"
          hideDefaultClose
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <PropertyWizard initialData={editingProperty} onClose={() => setIsWizardOpen(false)} onSuccess={refetchProperties} />
        </DialogContent>
      </Dialog>

      <Sheet open={!!ohProperty} onOpenChange={(open) => !open && setOhProperty(null)}>
        <SheetContent
          side="right"
          className="p-0 w-full sm:max-w-[640px] flex flex-col overflow-hidden [&>button]:hidden"
        >
          {ohProperty && (
            <OpenHouseManager property={ohProperty} onClose={() => setOhProperty(null)} />
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={!!unitaProperty} onOpenChange={(open) => !open && setUnitaProperty(null)}>
        <DialogContent className="max-w-4xl w-full h-[85vh] flex flex-col border-none shadow-2xl p-0 overflow-hidden" hideDefaultClose>
          {unitaProperty && (
            <UnitaSheet property={unitaProperty} onClose={() => setUnitaProperty(null)} />
          )}
        </DialogContent>
      </Dialog>

      <EvidenzaModal
        open={evidenzaOpen}
        onClose={() => setEvidenzaOpen(false)}
        onChanged={refetchProperties}
      />

      <AlertDialog open={!!propertyToDelete} onOpenChange={(open) => !open && setPropertyToDelete(null)}>
        <AlertDialogContent className="border-none shadow-2xl">
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
