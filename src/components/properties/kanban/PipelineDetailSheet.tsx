import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Paperclip, Check, Loader2, AlertTriangle, Plus, ArrowRight, KeyRound, Pencil } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { showError, showSuccess } from '@/utils/toast';
import { cn } from '@/lib/utils';
import {
  useImmobiliPipeline,
  controllaGateVenduto,
  type PipelineCard,
} from '@/hooks/useImmobiliPipeline';
import { useAlerts } from '@/hooks/useAlerts';
import {
  SOTTOFASI_IN_VENDITA,
  SOTTOFASI_VENDUTO,
  type ImmobileDocumento,
  type Sottofase,
} from '@/types';

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
  const { spostaFase } = useImmobiliPipeline();
  const { manuali, creaAlert, risolviAlert } = useAlerts();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingUploadDoc = useRef<ImmobileDocumento | null>(null);
  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null);
  const [nuovoAlert, setNuovoAlert] = useState('');
  const [dataPreliminare, setDataPreliminare] = useState('');
  const [dataAtto, setDataAtto] = useState('');
  const [isEditingDate, setIsEditingDate] = useState(false);
  // Sottofasi completate che l'utente ha espanso manualmente: di default una
  // sezione con checklist completa parte collassata (l'utente vuole poterla
  // comunque riaprire), le sezioni non complete restano sempre aperte.

  useEffect(() => {
    setNuovoAlert('');
    setDataPreliminare(card?.data_preliminare ?? '');
    setDataAtto(card?.data_atto ?? '');
    setIsEditingDate(false);
  }, [card?.id, card?.data_preliminare, card?.data_atto]);

  const alertImmobile = card ? manuali.filter((a) => a.immobile_id === card.id) : [];

  const handleCreaAlert = () => {
    const messaggio = nuovoAlert.trim();
    if (!card || !messaggio) return;
    creaAlert({ immobileId: card.id, messaggio });
    setNuovoAlert('');
  };

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

  // Raggruppa la checklist per sottofase (Burocratiche/Marketing/Appuntamenti
  // per "In Vendita", Vincolo/Preliminare/Rogito/Archivio per "Venduto"): solo
  // i documenti della fase corrente della card. Le sezioni vuote (es. Marketing
  // se il catalogo non ha doc lì) restano visibili per riflettere la spec.
  const { sezioniOrdinate, documentiPerSezione } = useMemo(() => {
    const sez: Sottofase[] =
      card?.fase === 'In Vendita' ? SOTTOFASI_IN_VENDITA : SOTTOFASI_VENDUTO;
    const bucket: Record<string, ImmobileDocumento[]> = {};
    for (const s of sez) bucket[s] = [];
    for (const doc of documenti ?? []) {
      if (doc.fase !== card?.fase) continue;
      const key = doc.sottofase ?? sez[0];
      (bucket[key] ??= []).push(doc);
    }
    return { sezioniOrdinate: sez, documentiPerSezione: bucket };
  }, [documenti, card?.fase]);

  const salvaDate = useMutation({
    mutationFn: async () => {
      if (!card) return;
      const { error } = await supabase
        .from('immobili')
        .update({
          data_preliminare: dataPreliminare || null,
          data_atto: dataAtto || null,
        })
        .eq('id', card.id);
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess('Date aggiornate.');
      queryClient.invalidateQueries({ queryKey: ['immobili-pipeline'] });
      setIsEditingDate(false);
    },
    onError: () => showError('Impossibile aggiornare le date.'),
  });

  // Per ora nessun gate di completezza: l'utente ha chiesto di poter spostare
  // sempre gli immobili tra fasi, senza dover completare la checklist prima
  // (utile in fase di test/prototipo). Il controllo classico rimane come
  // helper in useImmobiliPipeline.controllaGateVenduto, così quando servirà
  // riattivarlo basta reintrodurre la chiamata qui.
  const passaAVenduto = () => {
    if (!card) return;
    spostaFase({ immobileId: card.id, fase: 'Venduto' });
    onClose();
  };

  const gateBloccante: string | null = null;
  void controllaGateVenduto;

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
              <Badge variant="outline" className="font-semibold text-[#94b0ab] border-[#94b0ab]/40">
                {card.sottofase}
              </Badge>
              {card.proprietario_nome && (
                <Badge variant="outline" className="font-semibold">Proprietario: {card.proprietario_nome}</Badge>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileInputChange}
            />

            <div className="mt-6">
              <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Alert</h4>
              {alertImmobile.length > 0 && (
                <div className="space-y-2 mb-3">
                  {alertImmobile.map((alert) => (
                    <div
                      key={alert.id}
                      className="flex items-start gap-2 rounded-xl border-l-4 border-amber-400 bg-amber-50/60 px-3 py-2.5"
                    >
                      <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-sm text-gray-700 flex-1">{alert.messaggio}</p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0 text-emerald-600 hover:text-emerald-700"
                        title="Segna come risolto"
                        onClick={() => risolviAlert(alert.id)}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-start gap-2">
                <Textarea
                  value={nuovoAlert}
                  onChange={(e) => setNuovoAlert(e.target.value)}
                  placeholder="Aggiungi un promemoria per questo immobile..."
                  className="min-h-[2.5rem] text-sm rounded-xl"
                  rows={1}
                />
                <Button
                  type="button"
                  size="icon"
                  className="h-10 w-10 shrink-0 rounded-xl bg-[#94b0ab] hover:bg-[#7a948f]"
                  disabled={!nuovoAlert.trim()}
                  onClick={handleCreaAlert}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400">Date chiave</h4>
                {!isEditingDate && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditingDate(true)}
                    className="h-7 text-xs font-bold text-[#94b0ab] hover:bg-[#94b0ab]/10 rounded-lg px-2"
                  >
                    <Pencil size={12} className="mr-1" />
                    Modifica
                  </Button>
                )}
              </div>

              {isEditingDate ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="data-preliminare" className="text-xs font-bold text-gray-500">Data preliminare</Label>
                    <Input
                      id="data-preliminare"
                      type="date"
                      value={dataPreliminare}
                      onChange={(e) => setDataPreliminare(e.target.value)}
                      className="rounded-xl h-10"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="data-atto" className="text-xs font-bold text-gray-500">Data atto</Label>
                    <Input
                      id="data-atto"
                      type="date"
                      value={dataAtto}
                      onChange={(e) => setDataAtto(e.target.value)}
                      className="rounded-xl h-10"
                    />
                  </div>
                  <div className="col-span-2 flex justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setDataPreliminare(card.data_preliminare ?? '');
                        setDataAtto(card.data_atto ?? '');
                        setIsEditingDate(false);
                      }}
                      className="rounded-xl font-bold border-gray-200"
                    >
                      Annulla
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => salvaDate.mutate()}
                      disabled={salvaDate.isPending
                        || (dataPreliminare === (card.data_preliminare ?? '')
                          && dataAtto === (card.data_atto ?? ''))}
                      className="rounded-xl font-bold bg-[#94b0ab] hover:bg-[#7a948f] text-white"
                    >
                      Salva date
                    </Button>
                  </div>
                </div>
              ) : (
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-[0.65rem] font-bold uppercase tracking-wider text-gray-400">Preliminare</dt>
                    <dd className="text-sm font-semibold text-gray-800 mt-0.5">
                      {dataPreliminare ? new Date(dataPreliminare).toLocaleDateString('it-IT') : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[0.65rem] font-bold uppercase tracking-wider text-gray-400">Atto</dt>
                    <dd className="text-sm font-semibold text-gray-800 mt-0.5">
                      {dataAtto ? new Date(dataAtto).toLocaleDateString('it-IT') : '—'}
                    </dd>
                  </div>
                </dl>
              )}
            </div>

            <div className="mt-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400">
                  Checklist — {card.sottofase}
                </h4>
              </div>

              {/* Stepper compatto: mostra dove sono nel percorso della fase
                  corrente, senza rivelare i documenti delle prossime sottofasi
                  (li vedrò solo quando la card ci arriverà). */}
              <div className="flex items-center gap-1.5 mb-4 flex-wrap">
                {sezioniOrdinate.map((sezione, idx) => {
                  const isCurrent = sezione === card.sottofase;
                  const isPast = sezioniOrdinate.indexOf(card.sottofase) > idx;
                  return (
                    <div key={sezione} className="flex items-center gap-1.5">
                      <span className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold',
                        isCurrent && 'bg-[#94b0ab] text-white',
                        isPast && 'bg-emerald-50 text-emerald-700',
                        !isCurrent && !isPast && 'bg-gray-100 text-gray-400',
                      )}>
                        {isPast && <Check size={10} />}
                        {sezione}
                      </span>
                      {idx < sezioniOrdinate.length - 1 && (
                        <span className="text-gray-300 text-[0.65rem]">→</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {isLoading ? (
                <p className="text-sm text-gray-400 italic">Caricamento...</p>
              ) : (documentiPerSezione[card.sottofase] ?? []).length === 0 ? (
                <p className="text-sm text-gray-400 italic">Nessun documento da caricare per questa sottofase.</p>
              ) : (
                <div className="space-y-2">
                  {(documentiPerSezione[card.sottofase] ?? []).map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center gap-3 rounded-xl border border-gray-100 px-3 py-2.5 hover:bg-gray-50 transition-colors"
                    >
                      <label
                        className={cn(
                          'flex items-center gap-3 flex-1 min-w-0',
                          doc.stato === 'Fatto' || doc.drive_file_id ? 'cursor-pointer' : 'cursor-not-allowed',
                        )}
                        title={doc.stato !== 'Fatto' && !doc.drive_file_id ? 'Carica prima il file per poterlo segnare come fatto' : undefined}
                      >
                        <Checkbox
                          checked={doc.stato === 'Fatto'}
                          disabled={doc.stato !== 'Fatto' && !doc.drive_file_id}
                          onCheckedChange={() => toggleDocumento.mutate(doc)}
                        />
                        <span className={cn(
                          'text-sm font-medium truncate',
                          doc.stato === 'Fatto' ? 'text-gray-400 line-through' : 'text-gray-700',
                        )}>
                          {doc.documento}
                        </span>
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={cn('h-8 w-8 shrink-0', doc.drive_file_id && 'text-green-600 hover:text-green-700')}
                        title={doc.drive_file_id ? 'Visualizza file caricato' : 'Carica file'}
                        disabled={uploadingDocId === doc.id}
                        onClick={() => (doc.drive_file_id ? handleViewFile(doc) : handleUploadClick(doc))}
                      >
                        {uploadingDocId === doc.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : doc.drive_file_id ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Paperclip className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {card.fase === 'In Vendita' && (
              <div className="mt-6 rounded-2xl border border-gray-100 bg-gray-50/50 p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-[#94b0ab]/10 flex items-center justify-center shrink-0">
                    <KeyRound size={14} className="text-[#94b0ab]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-800">Passa a "Venduto"</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Sposta l'immobile nella pipeline "Venduto" (Vincolo → Preliminare → Rogito → Archivio).
                    </p>
                    {gateBloccante && (
                      <p className="text-xs text-amber-600 font-semibold mt-1.5 flex items-start gap-1.5">
                        <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                        <span>{gateBloccante}</span>
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button
                    type="button"
                    onClick={passaAVenduto}
                    disabled={!!gateBloccante}
                    className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl font-bold text-xs h-9"
                  >
                    Sposta in Venduto
                    <ArrowRight size={14} className="ml-1.5" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default PipelineDetailSheet;
