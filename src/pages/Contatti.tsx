"use client";

import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import AdminLayout from '@/components/layout/AdminLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ProprietariView from '@/components/contatti/ProprietariView';
import AcquirentiView from '@/components/contatti/AcquirentiView';
import CollaboratoriView from '@/components/contatti/CollaboratoriView';
import ContattiGlobalSearch, { type ContattoTipo } from '@/components/contatti/ContattiGlobalSearch';

type ContattiTab = ContattoTipo;

const Contatti = () => {
  const location = useLocation();
  const deepLinkLeadId = (location.state as { openLeadId?: string } | null)?.openLeadId ?? null;
  const [tab, setTab] = useState<ContattiTab>(
    ((location.state as { contattiTab?: ContattiTab } | null)?.contattiTab as ContattiTab | undefined) ?? 'proprietari'
  );
  // Id contatto da aprire (impostato dalla search globale) — resettato subito
  // dopo l'apertura in modo che ri-aprire lo stesso contatto funzioni.
  const [openProprietarioId, setOpenProprietarioId] = useState<string | null>(null);
  const [openAcquirenteId, setOpenAcquirenteId] = useState<string | null>(null);
  const [openCollaboratoreId, setOpenCollaboratoreId] = useState<string | null>(null);

  // se navighiamo su /contatti da un'altra rotta con un nuovo `contattiTab`
  // nel state, il componente non rimonta: seguiamo il cambio di state a runtime.
  useEffect(() => {
    const requestedTab = (location.state as { contattiTab?: ContattiTab } | null)?.contattiTab;
    if (requestedTab) setTab(requestedTab);
  }, [location.state]);

  const handleSearchSelect = (tipo: ContattoTipo, id: string) => {
    setTab(tipo);
    if (tipo === 'proprietari') setOpenProprietarioId(id);
    if (tipo === 'acquirenti') setOpenAcquirenteId(id);
    if (tipo === 'collaboratori') setOpenCollaboratoreId(id);
  };

  return (
    <AdminLayout fullHeight>
      <div className="flex flex-col flex-1 overflow-hidden min-h-0">
        <div className="mb-6 shrink-0">
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900">Contatti</h1>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as ContattiTab)} className="flex flex-col flex-1 min-h-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 shrink-0">
            <TabsList className="grid w-[420px] grid-cols-3 rounded-full p-1 bg-muted/50 border border-gray-100">
              <TabsTrigger value="proprietari" className="rounded-full px-3 text-xs font-semibold data-[state=active]:bg-[#94b0ab] data-[state=active]:text-white">Proprietari</TabsTrigger>
              <TabsTrigger value="acquirenti" className="rounded-full px-3 text-xs font-semibold data-[state=active]:bg-[#94b0ab] data-[state=active]:text-white">Acquirenti</TabsTrigger>
              <TabsTrigger value="collaboratori" className="rounded-full px-3 text-xs font-semibold data-[state=active]:bg-[#94b0ab] data-[state=active]:text-white">Collaboratori</TabsTrigger>
            </TabsList>
            <ContattiGlobalSearch onSelect={handleSearchSelect} />
          </div>

          <TabsContent value="proprietari" className="flex flex-col flex-1 min-h-0 mt-0 data-[state=inactive]:hidden">
            <ProprietariView openContattoId={openProprietarioId} onContattoOpened={() => setOpenProprietarioId(null)} />
          </TabsContent>
          <TabsContent value="acquirenti" className="flex flex-col flex-1 min-h-0 mt-0 data-[state=inactive]:hidden">
            <AcquirentiView deepLinkLeadId={deepLinkLeadId} openContattoId={openAcquirenteId} onContattoOpened={() => setOpenAcquirenteId(null)} />
          </TabsContent>
          <TabsContent value="collaboratori" className="flex flex-col flex-1 min-h-0 mt-0 data-[state=inactive]:hidden">
            <CollaboratoriView openContattoId={openCollaboratoreId} onContattoOpened={() => setOpenCollaboratoreId(null)} />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default Contatti;
