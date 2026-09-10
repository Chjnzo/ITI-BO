import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { KeyRound, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { PraticaCard } from '@/hooks/useProprietariPipeline';

interface KanbanCardProps {
  card: PraticaCard;
  onOpen: (card: PraticaCard) => void;
  dragging?: boolean;
}

const formatPrice = (price?: number | null): string | null => {
  if (!price) return null;
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
          <KeyRound size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-gray-900 text-sm truncate">{card.via}</div>
          <div className="text-xs text-gray-400 truncate font-medium">
            {[card.citta, card.tipologia].filter(Boolean).join(' · ') || 'Senza dettagli'}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        {formatPrice(card.valutazione_stimata)
          ? <span className="font-bold text-gray-900 text-sm shrink-0">{formatPrice(card.valutazione_stimata)}</span>
          : <span />}
        {card.proprietario_nome && (
          <Badge variant="secondary" className="gap-1 font-semibold text-[0.65rem] max-w-[65%] truncate">
            <User size={11} className="shrink-0" />
            <span className="truncate">{card.proprietario_nome}</span>
          </Badge>
        )}
      </div>
    </div>
  );
};

export default KanbanCard;
