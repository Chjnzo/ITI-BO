import { useDroppable } from '@dnd-kit/core';
import { ScrollArea } from '@/components/ui/scroll-area';
import KanbanCard from './KanbanCard';
import type { Sottofase } from '@/types';
import type { PipelineCard } from '@/hooks/useImmobiliPipeline';
import { cn } from '@/lib/utils';

interface KanbanColumnProps {
  sottofase: Sottofase;
  cards: PipelineCard[];
  onOpen: (card: PipelineCard) => void;
  activeId?: string | null;
}

// Ogni colonna è un droppable dnd-kit: l'id è la sottofase stessa (uniche per
// board perché la board mostra solo una fase alla volta). Il drop chiama
// spostaSottofase in useImmobiliPipeline, che aggiorna
// immobile_pipeline_stato.sottofase e sposta la card senza vincoli.
const KanbanColumn = ({ sottofase, cards, onOpen, activeId }: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: sottofase });

  return (
    <div className="flex flex-col w-72 shrink-0 h-full">
      <div className="flex items-center justify-between px-2 pb-3 shrink-0">
        <h3 className="font-extrabold text-gray-900 text-sm uppercase tracking-wide">{sottofase}</h3>
        <span className="text-xs font-bold text-gray-400 bg-gray-100 rounded-full px-2.5 py-0.5">{cards.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 min-h-0 rounded-[1.75rem] border p-2 transition-colors',
          isOver ? 'border-[#94b0ab] bg-[#94b0ab]/5' : 'border-gray-100 bg-gray-50/50',
        )}
      >
        <ScrollArea className="h-full pr-1">
          <div className="flex flex-col gap-3 p-1">
            {cards.length === 0 ? (
              <p className="text-center text-xs text-gray-400 italic py-8">Nessun immobile</p>
            ) : (
              cards.map((card) => (
                <KanbanCard
                  key={card.id}
                  card={card}
                  onOpen={onOpen}
                  dragging={activeId === card.id}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};

export default KanbanColumn;
