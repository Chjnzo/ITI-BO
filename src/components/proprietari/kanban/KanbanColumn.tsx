import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import KanbanCard from './KanbanCard';
import type { FaseProprietario } from '@/types';
import type { PraticaCard } from '@/hooks/useProprietariPipeline';

interface KanbanColumnProps {
  fase: FaseProprietario;
  cards: PraticaCard[];
  onOpen: (card: PraticaCard) => void;
  activeId: string | null;
}

const KanbanColumn = ({ fase, cards, onOpen, activeId }: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: fase });

  return (
    <div className="flex flex-col min-w-[20rem] flex-1 h-full">
      <div className="flex items-center justify-between px-2 pb-3 shrink-0">
        <h3 className="font-extrabold text-gray-900 text-sm uppercase tracking-wide">{fase}</h3>
        <span className="text-xs font-bold text-gray-400 bg-gray-100 rounded-full px-2.5 py-0.5">{cards.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 min-h-0 rounded-[1.75rem] border border-gray-100 bg-gray-50/50 p-2 transition-colors',
          isOver && 'bg-[#94b0ab]/10 border-[#94b0ab]/30',
        )}
      >
        {/* Vedi commento in properties/kanban/KanbanColumn: Radix ScrollArea
            forzava fit-content sui figli, le card risultavano più strette del
            box. Overflow nativo per far filler width:100%. */}
        <div className="h-full overflow-y-auto">
          <div className="flex flex-col gap-3 p-1">
            {cards.length === 0 ? (
              <p className="text-center text-xs text-gray-400 italic py-8">Nessuna pratica</p>
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
        </div>
      </div>
    </div>
  );
};

export default KanbanColumn;
