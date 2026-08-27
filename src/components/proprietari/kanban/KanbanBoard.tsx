import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { FASI_PROPRIETARI, useProprietariPipeline, type PraticaCard } from '@/hooks/useProprietariPipeline';
import type { FaseProprietario } from '@/types';
import KanbanColumn from './KanbanColumn';
import KanbanCard from './KanbanCard';
import PraticaDetailSheet from './PraticaDetailSheet';

interface KanbanBoardProps {
  autoOpenId?: string;
  onAutoOpened?: () => void;
}

const KanbanBoard = ({ autoOpenId, onAutoOpened }: KanbanBoardProps = {}) => {
  const { data: cards, isLoading, spostaFase } = useProprietariPipeline();
  const [activeCard, setActiveCard] = useState<PraticaCard | null>(null);
  // Si tiene solo l'id, non l'oggetto card: la card selezionata va ricavata
  // ad ogni render dalla lista aggiornata di React Query (stesso motivo della
  // board immobili — vedi KanbanBoard.tsx in properties/kanban).
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const selectedCard = selectedCardId ? cards?.find((c) => c.id === selectedCardId) ?? null : null;

  // Link diretto dalla pagina Alert (stesso pattern di KanbanBoard.tsx in
  // properties/kanban): apre la scheda della pratica segnalata non appena le
  // card sono caricate.
  useEffect(() => {
    if (!autoOpenId || !cards) return;
    const match = cards.find((c) => c.id === autoOpenId);
    if (match) setSelectedCardId(match.id);
    onAutoOpened?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenId, cards]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const cardsByFase = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = query
      ? (cards ?? []).filter((card) =>
          [card.via, card.citta, card.tipologia, card.proprietario_nome]
            .some((field) => field?.toLowerCase().includes(query)),
        )
      : (cards ?? []);

    const grouped: Record<FaseProprietario, PraticaCard[]> = {
      Contatto: [],
      'Incontro/Sopralluogo': [],
      Rivalutazione: [],
      'Presa in carico': [],
    };
    filtered.forEach((card) => {
      grouped[card.fase].push(card);
    });
    return grouped;
  }, [cards, searchQuery]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCard(event.active.data.current as PraticaCard);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCard(null);
    if (!over) return;

    const nuovaFase = over.id as FaseProprietario;
    const card = active.data.current as PraticaCard;
    if (!card || card.fase === nuovaFase) return;

    spostaFase({ praticaId: card.id, fase: nuovaFase });
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 font-medium">
        Caricamento pipeline...
      </div>
    );
  }

  return (
    <>
      <div className="relative mb-4 max-w-xl group shrink-0">
        <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#94b0ab] transition-colors" size={20} />
        <Input
          placeholder="Cerca per via, città, tipologia o proprietario..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          autoComplete="off"
          name="search-proprietari-kanban"
          className="h-14 pl-14 pr-6 rounded-2xl border-gray-100 bg-white shadow-sm focus:ring-2 focus:ring-[#94b0ab]/20 focus:border-[#94b0ab] transition-all"
        />
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 min-h-0 flex gap-4 overflow-x-auto pb-2">
          {FASI_PROPRIETARI.map((fase) => (
            <KanbanColumn
              key={fase}
              fase={fase}
              cards={cardsByFase[fase]}
              onOpen={(card) => setSelectedCardId(card.id)}
              activeId={activeCard?.id ?? null}
            />
          ))}
        </div>

        <DragOverlay>
          {activeCard && <KanbanCard card={activeCard} onOpen={() => {}} />}
        </DragOverlay>
      </DndContext>

      <PraticaDetailSheet
        pratica={selectedCard}
        onClose={() => setSelectedCardId(null)}
      />
    </>
  );
};

export default KanbanBoard;
