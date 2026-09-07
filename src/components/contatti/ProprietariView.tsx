"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import ProprietariList from '@/components/proprietari/ProprietariList';
import NewProprietarioDialog from '@/components/proprietari/NewProprietarioDialog';

// Wrapper della lista proprietari con il pulsante "Nuovo proprietario"
// iniettato come headerActions in modo che stia sulla stessa riga dei filtri
// (Solo caldi, filtro agente, search) — coerente con Acquirenti/Collaboratori
// che hanno anch'essi il bottone "Nuovo" nella riga controlli.
const ProprietariView = () => {
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <ProprietariList
        refreshSignal={refreshSignal}
        headerActions={
          <Button
            onClick={() => setIsNewOpen(true)}
            className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl px-5 h-10 font-bold text-xs"
          >
            <Plus className="mr-1.5" size={14} />
            Nuovo Proprietario
          </Button>
        }
      />

      <NewProprietarioDialog
        open={isNewOpen}
        onClose={() => setIsNewOpen(false)}
        onCreated={() => setRefreshSignal((s) => s + 1)}
      />
    </div>
  );
};

export default ProprietariView;
