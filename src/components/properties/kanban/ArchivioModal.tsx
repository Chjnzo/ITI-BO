import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Archive, Home, Calendar } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface ArchivioModalProps {
  open: boolean;
  onClose: () => void;
  onOpenImmobile: (id: string) => void;
}

interface ArchivioRow {
  id: string;
  titolo: string;
  indirizzo: string;
  citta: string;
  copertina_url: string | null;
  data_atto: string | null;
  data_preliminare: string | null;
  updated_at: string;
}

// Modale con l'elenco degli immobili archiviati (Venduto/Archivio). Non è più
// una colonna del kanban: gli archiviati non occupano spazio nella board, ma
// restano consultabili in ordine cronologico inverso (updated_at desc).
// Click su una riga → chiude il modale e apre PipelineDetailSheet dell'immobile
// selezionato (delegato al parent tramite onOpenImmobile).
const ArchivioModal = ({ open, onClose, onOpenImmobile }: ArchivioModalProps) => {
  const { data: archiviati = [], isLoading } = useQuery<ArchivioRow[]>({
    queryKey: ['immobili-archivio'],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('immobili')
        .select(`
          id, titolo, indirizzo, citta, copertina_url, data_atto, data_preliminare,
          pipeline:immobile_pipeline_stato!inner(fase, sottofase, updated_at)
        `)
        .eq('is_deleted', false)
        .eq('pipeline.fase', 'Venduto')
        .eq('pipeline.sottofase', 'Archivio')
        .order('updated_at', { foreignTable: 'immobile_pipeline_stato', ascending: false });
      if (error) throw error;
      type RawRow = ArchivioRow & { pipeline?: { updated_at: string } | null };
      return ((data ?? []) as unknown as RawRow[]).map((r) => ({
        ...r,
        updated_at: r.pipeline?.updated_at ?? '',
      }));
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl w-full max-h-[80vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-100">
          <DialogTitle className="text-xl font-extrabold flex items-center gap-2">
            <Archive size={20} className="text-gray-500" />
            Archivio immobili
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-500">
            Immobili completati e archiviati. Clicca su uno per aprirne la scheda.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <p className="text-sm text-gray-400 italic py-12 text-center">Caricamento...</p>
          ) : archiviati.length === 0 ? (
            <p className="text-sm text-gray-300 italic py-12 text-center">Nessun immobile archiviato.</p>
          ) : (
            <div className="space-y-2">
              {archiviati.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onOpenImmobile(r.id)}
                  className="w-full flex items-center gap-3 rounded-2xl border border-gray-100 hover:border-[#94b0ab]/40 hover:bg-[#94b0ab]/5 transition-colors px-4 py-3 text-left"
                >
                  <div className="w-11 h-11 rounded-xl overflow-hidden bg-gray-100 shrink-0 flex items-center justify-center text-gray-300">
                    {r.copertina_url ? (
                      <img src={r.copertina_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Home size={18} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-gray-900 truncate">{r.titolo}</p>
                    <p className="text-xs text-gray-500 truncate">{r.citta}, {r.indirizzo}</p>
                    {(r.data_atto || r.data_preliminare) && (
                      <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
                        <Calendar size={9} />
                        {r.data_atto
                          ? `Atto ${new Date(r.data_atto).toLocaleDateString('it-IT')}`
                          : `Preliminare ${new Date(r.data_preliminare!).toLocaleDateString('it-IT')}`}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ArchivioModal;
