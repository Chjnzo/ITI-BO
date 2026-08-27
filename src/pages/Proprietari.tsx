"use client";

import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import AdminLayout from '@/components/layout/AdminLayout';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, List, LayoutGrid } from 'lucide-react';
import KanbanBoard from '@/components/proprietari/kanban/KanbanBoard';
import ProprietariList from '@/components/proprietari/ProprietariList';
import NewProprietarioDialog from '@/components/proprietari/NewProprietarioDialog';

const Proprietari = () => {
  const location = useLocation();
  // Link diretto dalla pagina Alert (state.openPraticaId): apre la board
  // Kanban già sulla scheda della pratica segnalata (stesso pattern di
  // Properties.tsx per gli immobili).
  const openPraticaId = (location.state as { openPraticaId?: string } | null)?.openPraticaId;
  const [view, setView] = useState<'lista' | 'kanban'>('kanban');
  const [isNewOpen, setIsNewOpen] = useState(false);
  // Incrementato ad ogni creazione riuscita per forzare il refetch della lista
  // (ProprietariList gestisce il proprio fetch locale, non react-query).
  const [refreshSignal, setRefreshSignal] = useState(0);

  return (
    <AdminLayout fullHeight>
      <div className="flex flex-col flex-1 overflow-hidden min-h-0">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-6 shrink-0">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-gray-900">Proprietari</h1>
            <p className="text-gray-500 mt-1 font-medium">Pipeline di acquisizione immobili dai proprietari.</p>
          </div>
          <div className="flex items-center gap-3">
            <Tabs value={view} onValueChange={(v) => setView(v as 'lista' | 'kanban')} className="w-auto">
              <TabsList className="grid grid-cols-2 w-[140px] rounded-full p-1 bg-muted/50 border border-gray-100">
                <TabsTrigger value="lista" className="rounded-full px-3 text-xs font-semibold data-[state=active]:bg-[#94b0ab] data-[state=active]:text-white">
                  <List size={14} />
                </TabsTrigger>
                <TabsTrigger value="kanban" className="rounded-full px-3 text-xs font-semibold data-[state=active]:bg-[#94b0ab] data-[state=active]:text-white">
                  <LayoutGrid size={14} />
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Button
              onClick={() => setIsNewOpen(true)}
              className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-2xl px-8 h-14 shadow-lg shadow-[#94b0ab]/20 font-bold transition-all"
            >
              <Plus className="mr-2" size={20} />
              Nuovo Proprietario
            </Button>
          </div>
        </div>

        {view === 'kanban' ? (
          <KanbanBoard autoOpenId={openPraticaId} />
        ) : (
          <ProprietariList refreshSignal={refreshSignal} />
        )}
      </div>

      <NewProprietarioDialog
        open={isNewOpen}
        onClose={() => setIsNewOpen(false)}
        onCreated={() => setRefreshSignal((s) => s + 1)}
      />
    </AdminLayout>
  );
};

export default Proprietari;
