import { ScrollArea } from '@/components/ui/scroll-area';
import KanbanCard from './KanbanCard';
import type { Sottofase } from '@/types';
import type { PipelineCard } from '@/hooks/useImmobiliPipeline';

interface KanbanColumnProps {
  sottofase: Sottofase;
  cards: PipelineCard[];
  onOpen: (card: PipelineCard) => void;
}

// Nota: le sottofasi non sono droppable — la sottofase corrente di una card è
// derivata dai suoi documenti (§useImmobiliPipeline.derivaSottofase), quindi
// il drag-drop tra colonne sarebbe una bugia (non cambierebbe nulla nel DB).
// L'unico spostamento reale è tra le due board (In Vendita -> Venduto), che
// avviene dalla PipelineDetailSheet tramite un pulsante gate-checked.
const KanbanColumn = ({ sottofase, cards, onOpen }: KanbanColumnProps) => {
  return (
    <div className="flex flex-col w-72 shrink-0 h-full">
      <div className="flex items-center justify-between px-2 pb-3 shrink-0">
        <h3 className="font-extrabold text-gray-900 text-sm uppercase tracking-wide">{sottofase}</h3>
        <span className="text-xs font-bold text-gray-400 bg-gray-100 rounded-full px-2.5 py-0.5">{cards.length}</span>
      </div>
      <div className="flex-1 min-h-0 rounded-[1.75rem] border border-gray-100 bg-gray-50/50 p-2">
        <ScrollArea className="h-full pr-1">
          <div className="flex flex-col gap-3 p-1">
            {cards.length === 0 ? (
              <p className="text-center text-xs text-gray-400 italic py-8">Nessun immobile</p>
            ) : (
              cards.map((card) => (
                <KanbanCard key={card.id} card={card} onOpen={onOpen} />
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};

export default KanbanColumn;
