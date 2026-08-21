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
import { FASI_PIPELINE, useImmobiliPipeline, type PipelineCard } from '@/hooks/useImmobiliPipeline';
import type { FasePipeline } from '@/types';
import KanbanColumn from './KanbanColumn';
import KanbanCard from './KanbanCard';
import PipelineDetailSheet from './PipelineDetailSheet';

interface KanbanBoardProps {
  autoOpenId?: string;
  onAutoOpened?: () => void;
}

const KanbanBoard = ({ autoOpenId, onAutoOpened }: KanbanBoardProps = {}) => {
  const { data: cards, isLoading, spostaFase } = useImmobiliPipeline();
  const [activeCard, setActiveCard] = useState<PipelineCard | null>(null);
  // Si tiene solo l'id, non l'oggetto card: la card selezionata va ricavata
  // ad ogni render dalla lista aggiornata di React Query, altrimenti dopo una
  // mutation (es. cambio sottofase) la sheet resterebbe agganciata alla copia
  // "congelata" presa al momento dell'apertura e non rifletterebbe il nuovo
  // valore (la pill sottofase sembrava "non rispondere" per questo motivo).
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const selectedCard = selectedCardId ? cards?.find((c) => c.id === selectedCardId) ?? null : null;

  // Link diretto dalla pagina Alert: apre la scheda dell'immobile segnalato
  // non appena le card sono caricate, poi segnala al chiamante di consumare
  // lo stato di navigazione (altrimenti riaprirebbe la sheet ad ogni render).
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
          [card.titolo, card.indirizzo, card.citta, card.proprietario_nome]
            .some((field) => field?.toLowerCase().includes(query)),
        )
      : (cards ?? []);

    const grouped: Record<FasePipeline, PipelineCard[]> = {
      Acquisizione: [],
      'In Vendita': [],
      Venduto: [],
      Archivio: [],
    };
    filtered.forEach((card) => {
      grouped[card.fase].push(card);
    });
    return grouped;
  }, [cards, searchQuery]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCard(event.active.data.current as PipelineCard);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCard(null);
    if (!over) return;

    const nuovaFase = over.id as FasePipeline;
    const card = active.data.current as PipelineCard;
    if (!card || card.fase === nuovaFase) return;

    if (card.docTotali > 0 && card.docCompletati < card.docTotali) {
      const confermato = window.confirm(
        `La checklist di "${card.titolo}" per la fase "${card.fase}" non è completa ` +
        `(${card.docCompletati}/${card.docTotali}). Spostarlo comunque in "${nuovaFase}"?`,
      );
      if (!confermato) return;
    }

    spostaFase({ immobileId: card.id, fase: nuovaFase });
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
          placeholder="Cerca per titolo, indirizzo, città o proprietario..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-14 pl-14 pr-6 rounded-2xl border-gray-100 bg-white shadow-sm focus:ring-2 focus:ring-[#94b0ab]/20 focus:border-[#94b0ab] transition-all"
        />
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 min-h-0 flex gap-4 overflow-x-auto pb-2">
          {FASI_PIPELINE.map((fase) => (
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

      <PipelineDetailSheet
        card={selectedCard}
        onClose={() => setSelectedCardId(null)}
      />
    </>
  );
};

export default KanbanBoard;
