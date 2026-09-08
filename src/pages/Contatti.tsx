"use client";

import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import AdminLayout from '@/components/layout/AdminLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ProprietariView from '@/components/contatti/ProprietariView';
import AcquirentiView from '@/components/contatti/AcquirentiView';
import CollaboratoriView from '@/components/contatti/CollaboratoriView';

type ContattiTab = 'proprietari' | 'acquirenti' | 'collaboratori';

const Contatti = () => {
  const location = useLocation();
  const deepLinkLeadId = (location.state as { openLeadId?: string } | null)?.openLeadId ?? null;
  const [tab, setTab] = useState<ContattiTab>(
    ((location.state as { contattiTab?: ContattiTab } | null)?.contattiTab as ContattiTab | undefined) ?? 'proprietari'
  );

  // se navighiamo su /contatti da un'altra rotta con un nuovo `contattiTab`
  // nel state, il componente non rimonta: seguiamo il cambio di state a runtime.
  useEffect(() => {
    const requestedTab = (location.state as { contattiTab?: ContattiTab } | null)?.contattiTab;
    if (requestedTab) setTab(requestedTab);
  }, [location.state]);

  return (
    <AdminLayout fullHeight>
      <div className="flex flex-col flex-1 overflow-hidden min-h-0">
        <div className="mb-6 shrink-0">
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900">Contatti</h1>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as ContattiTab)} className="flex flex-col flex-1 min-h-0">
          <TabsList className="grid w-[420px] grid-cols-3 rounded-full p-1 bg-muted/50 border border-gray-100 shrink-0 mb-4">
            <TabsTrigger value="proprietari" className="rounded-full px-3 text-xs font-semibold data-[state=active]:bg-[#94b0ab] data-[state=active]:text-white">Proprietari</TabsTrigger>
            <TabsTrigger value="acquirenti" className="rounded-full px-3 text-xs font-semibold data-[state=active]:bg-[#94b0ab] data-[state=active]:text-white">Acquirenti</TabsTrigger>
            <TabsTrigger value="collaboratori" className="rounded-full px-3 text-xs font-semibold data-[state=active]:bg-[#94b0ab] data-[state=active]:text-white">Collaboratori</TabsTrigger>
          </TabsList>

          <TabsContent value="proprietari" className="flex flex-col flex-1 min-h-0 mt-0 data-[state=inactive]:hidden">
            <ProprietariView />
          </TabsContent>
          <TabsContent value="acquirenti" className="flex flex-col flex-1 min-h-0 mt-0 data-[state=inactive]:hidden">
            <AcquirentiView deepLinkLeadId={deepLinkLeadId} />
          </TabsContent>
          <TabsContent value="collaboratori" className="flex flex-col flex-1 min-h-0 mt-0 data-[state=inactive]:hidden">
            <CollaboratoriView />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default Contatti;
