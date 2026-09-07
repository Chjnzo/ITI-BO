"use client";

import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AdminLayout from '@/components/layout/AdminLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import KanbanProprietari from '@/components/proprietari/kanban/KanbanBoard';
import KanbanImmobili from '@/components/properties/kanban/KanbanBoard';

type GestioneTab = 'proprietari' | 'in-vendita' | 'venduto';

const Gestione = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const openPraticaId = (location.state as { openPraticaId?: string } | null)?.openPraticaId;
  const openImmobileId = (location.state as { openImmobileId?: string } | null)?.openImmobileId;
  const initialTab: GestioneTab =
    (location.state as { gestioneTab?: GestioneTab } | null)?.gestioneTab
    ?? (openImmobileId ? 'in-vendita' : openPraticaId ? 'proprietari' : 'proprietari');
  const [tab, setTab] = useState<GestioneTab>(initialTab);
  // Search unica gestita al livello della pagina, così sta sulla stessa riga
  // del pill switcher. La stringa passa alle board via prop externalSearch:
  // se cambio tab tra kanban immobili e proprietari la stringa resta (mostra
  // cioè "cerca" i risultati del nuovo contesto, senza costringere l'utente
  // a rifiltrare — comportamento coerente con altri pill di questa app).
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const requested = (location.state as { gestioneTab?: GestioneTab } | null)?.gestioneTab;
    if (requested) setTab(requested);
  }, [location.state]);

  const clearNavState = () => navigate(location.pathname, { replace: true, state: {} });

  return (
    <AdminLayout fullHeight>
      <div className="flex flex-col flex-1 overflow-hidden min-h-0">
        <div className="mb-6 shrink-0">
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900">Gestione</h1>
          <p className="text-gray-500 mt-1 font-medium">Pipeline di lavoro: proprietari, immobili in vendita e venduti.</p>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as GestioneTab)} className="flex flex-col flex-1 min-h-0">
          <div className="flex items-center gap-4 mb-4 shrink-0 flex-wrap">
            <TabsList className="grid w-[420px] grid-cols-3 rounded-full p-1 bg-muted/50 border border-gray-100">
              <TabsTrigger value="proprietari" className="rounded-full px-3 text-xs font-semibold data-[state=active]:bg-[#94b0ab] data-[state=active]:text-white">Proprietari</TabsTrigger>
              <TabsTrigger value="in-vendita" className="rounded-full px-3 text-xs font-semibold data-[state=active]:bg-[#94b0ab] data-[state=active]:text-white">In Vendita</TabsTrigger>
              <TabsTrigger value="venduto" className="rounded-full px-3 text-xs font-semibold data-[state=active]:bg-[#94b0ab] data-[state=active]:text-white">Venduto</TabsTrigger>
            </TabsList>

            <div className="relative flex-1 max-w-xl group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#94b0ab] transition-colors" size={16} />
              <Input
                placeholder={tab === 'proprietari' ? 'Cerca per via, città, tipologia...' : 'Cerca per titolo, indirizzo, città, proprietario...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-10 pl-11 pr-4 rounded-xl border-gray-200 bg-white focus:ring-2 focus:ring-[#94b0ab]/20 focus:border-[#94b0ab] transition-all"
              />
            </div>
          </div>

          <TabsContent value="proprietari" className="flex flex-col flex-1 min-h-0 mt-0 data-[state=inactive]:hidden">
            <KanbanProprietari
              autoOpenId={openPraticaId}
              onAutoOpened={clearNavState}
              externalSearch={{ value: searchQuery, onChange: setSearchQuery }}
            />
          </TabsContent>
          <TabsContent value="in-vendita" className="flex flex-col flex-1 min-h-0 mt-0 data-[state=inactive]:hidden">
            <KanbanImmobili
              fissaFase="In Vendita"
              autoOpenId={openImmobileId}
              onAutoOpened={clearNavState}
              externalSearch={{ value: searchQuery, onChange: setSearchQuery }}
            />
          </TabsContent>
          <TabsContent value="venduto" className="flex flex-col flex-1 min-h-0 mt-0 data-[state=inactive]:hidden">
            <KanbanImmobili
              fissaFase="Venduto"
              autoOpenId={openImmobileId}
              onAutoOpened={clearNavState}
              externalSearch={{ value: searchQuery, onChange: setSearchQuery }}
            />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default Gestione;
