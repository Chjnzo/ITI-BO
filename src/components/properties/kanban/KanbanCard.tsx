import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Home, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { PipelineCard } from '@/hooks/useImmobiliPipeline';

interface KanbanCardProps {
  card: PipelineCard;
  onOpen: (card: PipelineCard) => void;
  dragging?: boolean;
}

const formatPrice = (price?: number) => {
  if (!price) return 'Su richiesta';
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(price);
};

const KanbanCard = ({ card, onOpen, dragging }: KanbanCardProps) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    data: card,
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => onOpen(card)}
      className={cn(
        'bg-white rounded-2xl border border-gray-100 shadow-sm p-4 cursor-grab active:cursor-grabbing select-none transition-shadow hover:shadow-md',
        (isDragging || dragging) && 'opacity-50',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl overflow-hidden bg-gray-100 border border-gray-100 shrink-0 flex items-center justify-center text-gray-300">
          {card.copertina_url ? (
            <img src={card.copertina_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <Home size={18} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-gray-900 text-sm truncate">{card.titolo}</div>
          <div className="text-xs text-gray-400 truncate font-medium">{card.citta}, {card.indirizzo}</div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="font-bold text-gray-900 text-sm shrink-0">{formatPrice(card.prezzo)}</span>
        <div className="flex items-center gap-1 min-w-0">
          {card.proprietario_nome && (
            <Badge variant="secondary" className="gap-1 font-semibold text-[0.65rem] max-w-[55%] truncate">
              <User size={11} className="shrink-0" />
              <span className="truncate">{card.proprietario_nome}</span>
            </Badge>
          )}
        </div>
      </div>

      {card.docTotali > 0 && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[0.65rem] font-bold uppercase tracking-wider text-gray-400">Documenti</span>
            <span className="text-[0.65rem] font-bold text-gray-500">{card.docCompletati}/{card.docTotali}</span>
          </div>
          <Progress value={(card.docCompletati / card.docTotali) * 100} className="h-1.5" />
        </div>
      )}
    </div>
  );
};

export default KanbanCard;
