"use client";

import { useLocation } from 'react-router-dom';
import AdminLayout from '@/components/layout/AdminLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import CompratoriView from '@/components/contatti/CompratoriView';
import CollaboratoriView from '@/components/contatti/CollaboratoriView';

const Contatti = () => {
  const location = useLocation();
  const deepLinkLeadId = (location.state as { openLeadId?: string } | null)?.openLeadId ?? null;

  return (
    <AdminLayout fullHeight>
      <div className="flex flex-col flex-1 overflow-hidden min-h-0">
        <div className="mb-6 shrink-0">
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900">Contatti</h1>
        </div>

        <Tabs defaultValue="compratori" className="flex flex-col flex-1 min-h-0">
          <TabsList className="grid w-[280px] grid-cols-2 rounded-full p-1 bg-muted/50 border border-gray-100 shrink-0 mb-4">
            <TabsTrigger value="compratori" className="rounded-full px-3 text-xs font-semibold data-[state=active]:bg-[#94b0ab] data-[state=active]:text-white">Compratori</TabsTrigger>
            <TabsTrigger value="collaboratori" className="rounded-full px-3 text-xs font-semibold data-[state=active]:bg-[#94b0ab] data-[state=active]:text-white">Collaboratori</TabsTrigger>
          </TabsList>

          <TabsContent value="compratori" className="flex flex-col flex-1 min-h-0 mt-0 data-[state=inactive]:hidden">
            <CompratoriView deepLinkLeadId={deepLinkLeadId} />
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
