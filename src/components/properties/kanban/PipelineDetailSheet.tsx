import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Paperclip, Check, Loader2, ChevronDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { showError } from '@/utils/toast';
import { cn } from '@/lib/utils';
import { FASI_PIPELINE, SOTTOFASI_PIPELINE, useImmobiliPipeline, type PipelineCard } from '@/hooks/useImmobiliPipeline';
import type { ImmobileDocumento } from '@/types';

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

// Le Edge Function rispondono con status non-200 sugli errori applicativi
// (400/404/502...): supabase-js in quel caso valorizza `error` invece di
// `data`, col body JSON originale recuperabile solo da `error.context`.
const extractEdgeError = async (error: unknown, fallback: string): Promise<string> => {
  try {
    const body = await (error as { context?: Response }).context?.json();
    if (body?.error) return body.error as string;
  } catch { /* ignore */ }
  return error instanceof Error ? error.message : fallback;
};

interface PipelineDetailSheetProps {
  card: PipelineCard | null;
  onClose: () => void;
}

const PipelineDetailSheet = ({ card, onClose }: PipelineDetailSheetProps) => {
  const queryClient = useQueryClient();
  const { aggiornaSottofase } = useImmobiliPipeline();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingUploadDoc = useRef<ImmobileDocumento | null>(null);
  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null);
  // Fasi completate che l'utente ha espanso manualmente: di default una fase
  // con checklist completa parte collassata (l'utente vuole poterla comunque
  // riaprire per consultarla), le fasi non complete restano sempre aperte.
  const [fasiEspanse, setFasiEspanse] = useState<Set<string>>(new Set());

  useEffect(() => {
    setFasiEspanse(new Set());
  }, [card?.id]);

  const { data: documenti, isLoading } = useQuery<ImmobileDocumento[]>({
    queryKey: ['immobile-documenti', card?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('immobile_documenti')
        .select('*')
        .eq('immobile_id', card!.id)
        .order('fase')
        .order('documento');
      if (error) throw error;
      return (data ?? []) as ImmobileDocumento[];
    },
    enabled: !!card,
  });

  const toggleDocumento = useMutation({
    mutationFn: async (doc: ImmobileDocumento) => {
      const nuovoStato = doc.stato === 'Fatto' ? 'Da fare' : 'Fatto';
      const { error } = await supabase
        .from('immobile_documenti')
        .update({
          stato: nuovoStato,
          completato_at: nuovoStato === 'Fatto' ? new Date().toISOString() : null,
        })
        .eq('id', doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['immobile-documenti', card?.id] });
      queryClient.invalidateQueries({ queryKey: ['immobili-pipeline'] });
    },
    onError: () => showError('Aggiornamento documento non riuscito.'),
  });

  const uploadDocumento = useMutation({
    mutationFn: async ({ doc, file }: { doc: ImmobileDocumento; file: File }) => {
      if (!card) throw new Error('Nessun immobile selezionato.');
      const fileBase64 = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke('drive-documenti', {
        body: {
          action: 'upload',
          documentoId: doc.id,
          immobileId: doc.immobile_id,
          immobileTitolo: card.titolo,
          immobileIndirizzo: card.indirizzo,
          fase: doc.fase,
          documento: doc.documento,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          fileBase64,
        },
      });
      if (error) throw new Error(await extractEdgeError(error, 'Caricamento file non riuscito.'));
      if (!data?.success) throw new Error(data?.error ?? 'Caricamento file non riuscito.');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['immobile-documenti', card?.id] });
    },
    onError: (err) => showError(err instanceof Error ? err.message : 'Caricamento file non riuscito.'),
    onSettled: () => setUploadingDocId(null),
  });

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const doc = pendingUploadDoc.current;
    if (file && doc) {
      setUploadingDocId(doc.id);
      uploadDocumento.mutate({ doc, file });
    }
  };

  const handleUploadClick = (doc: ImmobileDocumento) => {
    pendingUploadDoc.current = doc;
    fileInputRef.current?.click();
  };

  const handleViewFile = async (doc: ImmobileDocumento) => {
    if (!doc.drive_file_id) return;
    const { data, error } = await supabase.functions.invoke('drive-documenti', {
      body: { action: 'getDownload', documentoId: doc.id },
    });
    if (error || !data?.success) {
      showError(error ? await extractEdgeError(error, 'Impossibile aprire il file.') : 'Impossibile aprire il file.');
      return;
    }
    const byteCharacters = atob(data.fileBase64 as string);
    const bytes = new Uint8Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) bytes[i] = byteCharacters.charCodeAt(i);
    const blob = new Blob([bytes], { type: (data.mimeType as string) || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const documentiPerFase = (documenti ?? []).reduce<Record<string, ImmobileDocumento[]>>((acc, doc) => {
    (acc[doc.fase] ??= []).push(doc);
    return acc;
  }, {});

  // La query ordina i documenti per fase alfabeticamente ("Archivio" prima di
  // "In Vendita"): qui si riordinano i gruppi secondo l'ordine reale della
  // pipeline (Acquisizione → In Vendita → Venduto → Archivio).
  const fasiOrdinate = Object.keys(documentiPerFase).sort(
    (a, b) => FASI_PIPELINE.indexOf(a as (typeof FASI_PIPELINE)[number]) - FASI_PIPELINE.indexOf(b as (typeof FASI_PIPELINE)[number]),
  );

  return (
    <Sheet open={!!card} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[480px] overflow-y-auto">
        {card && (
          <>
            <SheetHeader className="text-left">
              <SheetTitle className="text-xl font-extrabold">{card.titolo}</SheetTitle>
              <SheetDescription className="font-medium">{card.citta}, {card.indirizzo}</SheetDescription>
            </SheetHeader>

            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="font-semibold">{card.fase}</Badge>
              {card.proprietario_nome && (
                <Badge variant="outline" className="font-semibold">Proprietario: {card.proprietario_nome}</Badge>
              )}
              {SOTTOFASI_PIPELINE[card.fase].length > 0 && (
                <Select
                  value={card.sottofase ?? ''}
                  onValueChange={(value) => aggiornaSottofase({ immobileId: card.id, fase: card.fase, sottofase: value })}
                >
                  <SelectTrigger className="h-8 w-auto min-w-[10rem] text-xs font-semibold rounded-full">
                    <SelectValue placeholder="Sottofase" />
                  </SelectTrigger>
                  <SelectContent>
                    {SOTTOFASI_PIPELINE[card.fase].map((sottofase) => (
                      <SelectItem key={sottofase} value={sottofase}>{sottofase}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileInputChange}
            />

            <div className="mt-6">
              <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Checklist documenti</h4>
              {isLoading ? (
                <p className="text-sm text-gray-400 italic">Caricamento...</p>
              ) : !documenti || documenti.length === 0 ? (
                <p className="text-sm text-gray-400 italic">Nessun documento per questo immobile.</p>
              ) : (
                <div className="space-y-5">
                  {fasiOrdinate.map((fase) => {
                    const docs = documentiPerFase[fase];
                    const completa = docs.length > 0 && docs.every((d) => d.stato === 'Fatto');
                    const aperta = !completa || fasiEspanse.has(fase);
                    return (
                    <Collapsible
                      key={fase}
                      open={aperta}
                      onOpenChange={(open) => {
                        if (!completa) return;
                        setFasiEspanse((prev) => {
                          const next = new Set(prev);
                          if (open) next.add(fase); else next.delete(fase);
                          return next;
                        });
                      }}
                    >
                      <CollapsibleTrigger asChild disabled={!completa}>
                        <button
                          type="button"
                          className={cn(
                            'flex items-center gap-2 mb-2 w-full text-left',
                            completa && 'cursor-pointer',
                          )}
                        >
                          <p className="text-[0.7rem] font-bold uppercase tracking-wider text-gray-400">{fase}</p>
                          {completa && (
                            <>
                              <Badge variant="secondary" className="text-[0.6rem] px-1.5 py-0 h-4 font-semibold">
                                Completa
                              </Badge>
                              <ChevronDown
                                className={cn(
                                  'h-3.5 w-3.5 text-gray-400 transition-transform ml-auto',
                                  aperta && 'rotate-180',
                                )}
                              />
                            </>
                          )}
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                      <div className="space-y-2">
                        {docs.map((doc) => (
                          <div
                            key={doc.id}
                            className="flex items-center gap-3 rounded-xl border border-gray-100 px-3 py-2.5 hover:bg-gray-50 transition-colors"
                          >
                            <label className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
                              <Checkbox
                                checked={doc.stato === 'Fatto'}
                                onCheckedChange={() => toggleDocumento.mutate(doc)}
                              />
                              <span className={cn(
                                'text-sm font-medium truncate',
                                doc.stato === 'Fatto' ? 'text-gray-400 line-through' : 'text-gray-700',
                              )}>
                                {doc.documento}
                              </span>
                            </label>
                            {doc.drive_file_id && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0 text-green-600 hover:text-green-700"
                                title="Visualizza file caricato"
                                onClick={() => handleViewFile(doc)}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0"
                              title={doc.drive_file_id ? 'Sostituisci file' : 'Carica file'}
                              disabled={uploadingDocId === doc.id}
                              onClick={() => handleUploadClick(doc)}
                            >
                              {uploadingDocId === doc.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Paperclip className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        ))}
                      </div>
                      </CollapsibleContent>
                    </Collapsible>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default PipelineDetailSheet;
