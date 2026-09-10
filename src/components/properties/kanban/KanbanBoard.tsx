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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useImmobiliPipeline, type PipelineCard } from '@/hooks/useImmobiliPipeline';
import { SOTTOFASI_IN_VENDITA, SOTTOFASI_VENDUTO, type FasePipeline, type Sottofase } from '@/types';
import KanbanColumn from './KanbanColumn';
import KanbanCard from './KanbanCard';
import PipelineDetailSheet from './PipelineDetailSheet';

interface KanbanBoardProps {
  autoOpenId?: string;
  onAutoOpened?: () => void;
  // Quando presente, nasconde il tab In Vendita/Venduto interno e mostra solo
  // la fase richiesta: usato in /gestione dove le due fasi sono già pill
  // separati al livello superiore, così non abbiamo un doppio switcher.
  fissaFase?: FasePipeline;
  externalSearch?: { value: string; onChange: (v: string) => void };
}

const KanbanBoard = ({ autoOpenId, onAutoOpened, fissaFase, externalSearch }: KanbanBoardProps = {}) => {
  const { data: cards, isLoading, spostaSottofase } = useImmobiliPipeline();
  const [faseAttiva, setFaseAttiva] = useState<FasePipeline>(fissaFase ?? 'In Vendita');
  const [localSearch, setLocalSearch] = useState('');
  const searchQuery = externalSearch?.value ?? localSearch;
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [activeCard, setActiveCard] = useState<PipelineCard | null>(null);
  const setSearchQuery = externalSearch?.onChange ?? setLocalSearch;
  const selectedCard = selectedCardId ? cards?.find((c) => c.id === selectedCardId) ?? null : null;

  useEffect(() => {
    if (!autoOpenId || !cards) return;
    const match = cards.find((c) => c.id === autoOpenId);
    if (match) {
      if (!fissaFase) setFaseAttiva(match.fase);
      setSelectedCardId(match.id);
    }
    onAutoOpened?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenId, cards]);

  useEffect(() => {
    if (fissaFase) setFaseAttiva(fissaFase);
  }, [fissaFase]);

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
    return {
      'In Vendita': filtered.filter((c) => c.fase === 'In Vendita'),
      Venduto: filtered.filter((c) => c.fase === 'Venduto'),
    } as Record<FasePipeline, PipelineCard[]>;
  }, [cards, searchQuery]);

  const sottofasi: Sottofase[] =
    faseAttiva === 'In Vendita' ? SOTTOFASI_IN_VENDITA : SOTTOFASI_VENDUTO;

  const cardsPerSottofase = useMemo(() => {
    const grouped: Record<string, PipelineCard[]> = {};
    for (const s of sottofasi) grouped[s] = [];
    for (const card of cardsByFase[faseAttiva]) {
      (grouped[card.sottofase] ??= []).push(card);
    }
    return grouped;
  }, [cardsByFase, faseAttiva, sottofasi]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCard(event.active.data.current as PipelineCard);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCard(null);
    if (!over) return;
    const nuovaSottofase = over.id as Sottofase;
    const card = active.data.current as PipelineCard;
    if (!card || card.sottofase === nuovaSottofase) return;
    // Sicurezza: la sottofase target deve appartenere alla fase corrente
    // (non permettiamo trascinamenti cross-fase, quello è pass. auto/manuale).
    if (!sottofasi.includes(nuovaSottofase)) return;
    spostaSottofase({ immobileId: card.id, sottofase: nuovaSottofase });
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
      {(!fissaFase || !externalSearch) && (
        <div className="flex items-center gap-4 mb-4 shrink-0 flex-wrap">
          {!fissaFase && (
            <Tabs value={faseAttiva} onValueChange={(v) => setFaseAttiva(v as FasePipeline)}>
              <TabsList className="rounded-2xl bg-gray-100 h-11 p-1">
                <TabsTrigger value="In Vendita" className="rounded-xl px-5 font-bold text-sm">
                  In Vendita
                  <span className="ml-2 text-xs text-gray-400">{cardsByFase['In Vendita'].length}</span>
                </TabsTrigger>
                <TabsTrigger value="Venduto" className="rounded-xl px-5 font-bold text-sm">
                  Venduto
                  <span className="ml-2 text-xs text-gray-400">{cardsByFase['Venduto'].length}</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}

          {!externalSearch && (
            <div className="relative max-w-xl flex-1 group">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#94b0ab] transition-colors" size={20} />
              <Input
                placeholder="Cerca per titolo, indirizzo, città o proprietario..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-11 pl-14 pr-6 rounded-2xl border-gray-100 bg-white shadow-sm focus:ring-2 focus:ring-[#94b0ab]/20 focus:border-[#94b0ab] transition-all"
              />
            </div>
          )}
        </div>
      )}

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex-1 min-h-0 flex gap-4 overflow-x-auto pb-2">
          {sottofasi.map((sottofase) => (
            <KanbanColumn
              key={sottofase}
              sottofase={sottofase}
              cards={cardsPerSottofase[sottofase] ?? []}
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
