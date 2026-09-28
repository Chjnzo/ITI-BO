"use client";

import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import AdminLayout from '@/components/layout/AdminLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Archive, Users } from 'lucide-react';
import KanbanProprietari from '@/components/proprietari/kanban/KanbanBoard';
import KanbanImmobili from '@/components/properties/kanban/KanbanBoard';
import ArchivioModal from '@/components/properties/kanban/ArchivioModal';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { useCurrentProfile } from '@/hooks/useCurrentProfile';
import { cn } from '@/lib/utils';

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
  // Filtro agente (spec cliente 2026-09-28): agenti/admin possono restringere
  // le board proprietari + in-vendita + venduto ai propri immobili. Default
  // "tutti" per admin; per agenti loggati, precompilato col proprio id così
  // vedono subito "i miei" — coerente con lo stesso pattern in ProprietariList.
  const { data: currentProfile } = useCurrentProfile();
  const [agenteFilter, setAgenteFilter] = useState<string>('tutti');
  useEffect(() => {
    if (currentProfile?.id && currentProfile.ruolo !== 'Admin' && agenteFilter === 'tutti') {
      setAgenteFilter(currentProfile.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProfile?.id]);
  const { data: agenti = [] } = useQuery<Array<{ id: string; nome_completo: string; colore_calendario: string | null }>>({
    queryKey: ['profili-agenti-filter'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profili_agenti')
        .select('id, nome_completo, colore_calendario')
        .order('nome_completo');
      return (data ?? []) as Array<{ id: string; nome_completo: string; colore_calendario: string | null }>;
    },
    staleTime: 5 * 60_000,
  });
  const [archivioOpen, setArchivioOpen] = useState(false);
  // Immobile da aprire nella board Venduto quando l'utente clicca una riga
  // nel modale Archivio: passato come autoOpenId a KanbanImmobili "venduto",
  // che apre la scheda dell'immobile archiviato senza spostarlo dalla lista.
  const [manualOpenImmobileId, setManualOpenImmobileId] = useState<string | undefined>();

  useEffect(() => {
    const requested = (location.state as { gestioneTab?: GestioneTab } | null)?.gestioneTab;
    if (requested) setTab(requested);
  }, [location.state]);

  const clearNavState = () => navigate(location.pathname, { replace: true, state: {} });
  const resetVendutoAutoOpen = () => { clearNavState(); setManualOpenImmobileId(undefined); };

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

            <Select value={agenteFilter} onValueChange={setAgenteFilter}>
              <SelectTrigger className="h-10 w-[180px] rounded-xl border-gray-200 bg-white text-xs font-semibold">
                <Users size={14} className="text-gray-400 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="tutti">Tutti gli agenti</SelectItem>
                {currentProfile?.id && (
                  <SelectItem value={currentProfile.id}>I miei</SelectItem>
                )}
                {agenti
                  .filter(a => a.id !== currentProfile?.id)
                  .map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.nome_completo}</SelectItem>
                  ))}
              </SelectContent>
            </Select>

            {/* Bottone Archivio: sempre montato per evitare che la riga cambi
                altezza tra i tab (colonne rimangono nella stessa posizione
                verticale). Reso invisibile fuori da "venduto" con `invisible`
                — occupa spazio ma non si vede, `pointer-events-none` evita
                click accidentali. */}
            <Button
              type="button"
              variant="outline"
              onClick={() => setArchivioOpen(true)}
              className={cn(
                'h-10 rounded-xl border-gray-200 gap-2 font-bold text-xs shrink-0',
                tab !== 'venduto' && 'invisible pointer-events-none',
              )}
              title="Vedi immobili archiviati"
            >
              <Archive size={14} />
              Archivio
            </Button>
          </div>

          <TabsContent value="proprietari" className="flex flex-col flex-1 min-h-0 mt-0 data-[state=inactive]:hidden">
            <KanbanProprietari
              autoOpenId={openPraticaId}
              onAutoOpened={clearNavState}
              externalSearch={{ value: searchQuery, onChange: setSearchQuery }}
              agenteFilter={agenteFilter}
            />
          </TabsContent>
          <TabsContent value="in-vendita" className="flex flex-col flex-1 min-h-0 mt-0 data-[state=inactive]:hidden">
            <KanbanImmobili
              fissaFase="In Vendita"
              autoOpenId={openImmobileId}
              onAutoOpened={clearNavState}
              externalSearch={{ value: searchQuery, onChange: setSearchQuery }}
              agenteFilter={agenteFilter}
            />
          </TabsContent>
          <TabsContent value="venduto" className="flex flex-col flex-1 min-h-0 mt-0 data-[state=inactive]:hidden">
            <KanbanImmobili
              fissaFase="Venduto"
              autoOpenId={manualOpenImmobileId ?? openImmobileId}
              onAutoOpened={resetVendutoAutoOpen}
              externalSearch={{ value: searchQuery, onChange: setSearchQuery }}
              agenteFilter={agenteFilter}
            />
          </TabsContent>
        </Tabs>

        <ArchivioModal
          open={archivioOpen}
          onClose={() => setArchivioOpen(false)}
          onOpenImmobile={(id) => {
            setArchivioOpen(false);
            setManualOpenImmobileId(id);
            // Se l'utente stava su un altro tab (raro: il bottone è visibile
            // solo su Venduto), forza il passaggio a "venduto" così la board
            // può montare KanbanImmobili con autoOpenId e aprire la scheda.
            setTab('venduto');
          }}
        />
      </div>
    </AdminLayout>
  );
};

export default Gestione;
