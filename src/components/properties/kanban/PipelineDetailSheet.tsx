import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Paperclip, Check, Loader2, AlertTriangle, Plus, KeyRound, Pencil, Folder,
  Trash2, Globe, CalendarClock, X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { showError, showSuccess } from '@/utils/toast';
import { cn } from '@/lib/utils';
import { useImmobiliPipeline, type PipelineCard } from '@/hooks/useImmobiliPipeline';
import { useAlerts } from '@/hooks/useAlerts';
import {
  SOTTOFASI_IN_VENDITA, SOTTOFASI_VENDUTO,
  type ImmobileDocumento, type PipelineScadenza, type Sottofase,
} from '@/types';

// Estensioni/MIME ammessi per upload documenti. Include PDF e immagini
// comuni (jpg/png/webp/heic). Nessun limite di size esplicito lato client:
// Apps Script + Drive tollerano bene file da 20-30 MB, oltre serve gestione
// asincrona che oggi non abbiamo.
const ACCEPTED_MIME = [
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
];
const ACCEPT_ATTR = ACCEPTED_MIME.join(',');

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

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
  const { manuali, creaAlert, risolviAlert } = useAlerts();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingUploadDoc = useRef<ImmobileDocumento | null>(null);
  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null);
  const [nuovoAlert, setNuovoAlert] = useState('');
  const [dataPreliminare, setDataPreliminare] = useState('');
  const [dataAtto, setDataAtto] = useState('');
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [confermaElimina, setConfermaElimina] = useState(false);
  // Nuova scadenza (composer inline)
  const [nuovaScadenzaData, setNuovaScadenzaData] = useState('');
  const [nuovaScadenzaDesc, setNuovaScadenzaDesc] = useState('');

  useEffect(() => {
    setNuovoAlert('');
    setDataPreliminare(card?.data_preliminare ?? '');
    setDataAtto(card?.data_atto ?? '');
    setIsEditingDate(false);
    setNuovaScadenzaData('');
    setNuovaScadenzaDesc('');
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

  const { data: scadenze } = useQuery<PipelineScadenza[]>({
    queryKey: ['pipeline-scadenze', 'immobile', card?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pipeline_scadenze')
        .select('*')
        .eq('immobile_id', card!.id)
        .order('scadenza', { ascending: true });
      if (error) throw error;
      return (data ?? []) as PipelineScadenza[];
    },
    enabled: !!card,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['immobile-documenti', card?.id] });
    queryClient.invalidateQueries({ queryKey: ['immobili-pipeline'] });
  };

  // Passaggio automatico In Vendita → Venduto: quando l'ultimo doc dell'ultima
  // sottofase (In trattativa) diventa Fatto, sposta la card in Venduto/Vincolo.
  const forsePassaAVenduto = async () => {
    if (!card || card.fase !== 'In Vendita' || card.sottofase !== 'In trattativa') return;
    const { data: fresche } = await supabase
      .from('immobile_documenti')
      .select('stato')
      .eq('immobile_id', card.id)
      .eq('fase', 'In Vendita')
      .eq('sottofase', 'In trattativa');
    const tutteFatte = (fresche ?? []).length > 0
      && (fresche ?? []).every((d) => d.stato === 'Fatto');
    if (!tutteFatte) return;

    // Upsert nuova fase + genera checklist Venduto in un colpo (mutation di
    // useImmobiliPipeline sarebbe overkill: qui basta il side-effect).
    await supabase
      .from('immobile_pipeline_stato')
      .upsert(
        { immobile_id: card.id, fase: 'Venduto', sottofase: 'Vincolo', updated_at: new Date().toISOString() },
        { onConflict: 'immobile_id' },
      );
    const { data: catalogo } = await supabase
      .from('documenti_catalogo')
      .select('documento, sottofase')
      .eq('fase', 'Venduto');
    if (catalogo?.length) {
      await supabase
        .from('immobile_documenti')
        .upsert(
          catalogo.map((c) => ({ immobile_id: card.id, fase: 'Venduto', documento: c.documento, sottofase: c.sottofase })),
          { onConflict: 'immobile_id,documento', ignoreDuplicates: true },
        );
    }
    showSuccess('Trattativa completata: immobile spostato in "Venduto".');
    queryClient.invalidateQueries({ queryKey: ['immobili-pipeline'] });
    onClose();
  };

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
    onSuccess: async (_data, doc) => {
      invalidateAll();
      if (doc.stato === 'Da fare') {
        // Il click ha appena marcato "Fatto" — controlla auto-passaggio.
        await forsePassaAVenduto();
      }
    },
    onError: () => showError('Aggiornamento documento non riuscito.'),
  });

  // Se manca il drive_folder_id sull'immobile, provo a crearlo prima
  // dell'upload — evita l'errore "Cartella Drive non trovata" che vede
  // l'utente in fase Preparazione se l'immobile è stato creato prima che
  // la creazione lazy della cartella fosse in vigore.
  const ensureDriveFolder = async () => {
    if (!card) return;
    if (card.drive_folder_url) return;
    try {
      await supabase.functions.invoke('drive-documenti', {
        body: { action: 'createFolder', immobileId: card.id },
      });
    } catch (_) {
      // Best-effort: Apps Script farà comunque lookup lazy al primo upload.
    }
  };

  const uploadDocumento = useMutation({
    mutationFn: async ({ doc, file }: { doc: ImmobileDocumento; file: File }) => {
      if (!card) throw new Error('Nessun immobile selezionato.');
      await ensureDriveFolder();
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
      showSuccess('File caricato su Drive.');
      queryClient.invalidateQueries({ queryKey: ['immobile-documenti', card?.id] });
      queryClient.invalidateQueries({ queryKey: ['immobili-pipeline'] });
    },
    onError: (err) => showError(err instanceof Error ? err.message : 'Caricamento file non riuscito.'),
    onSettled: () => setUploadingDocId(null),
  });

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const doc = pendingUploadDoc.current;
    if (!file || !doc) return;
    // Whitelist client-side: coerente con `accept` HTML ma esplicita per
    // browser che non blocca (es. Safari con file arbitrari).
    if (file.type && !ACCEPTED_MIME.includes(file.type)) {
      showError('Formato non ammesso. Carica PDF o immagini (jpg/png/webp/heic).');
      return;
    }
    setUploadingDocId(doc.id);
    uploadDocumento.mutate({ doc, file });
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

  // Documenti raggruppati per sottofase, cumulativi entro la stessa sezione:
  // quando la card avanza a una sottofase successiva, i doc delle sottofasi
  // precedenti restano visibili (si "sommano") — solo il passaggio Venduto/
  // In Vendita azzera visivamente cambiando fase.
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

  const eliminaImmobile = useMutation({
    mutationFn: async () => {
      if (!card) return;
      // Soft-delete: stessa modalità di /immobili.
      const { error } = await supabase
        .from('immobili')
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq('id', card.id);
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess('Immobile eliminato.');
      queryClient.invalidateQueries({ queryKey: ['immobili-pipeline'] });
      setConfermaElimina(false);
      onClose();
    },
    onError: () => showError('Eliminazione non riuscita.'),
  });

  const togglePubblicazione = useMutation({
    mutationFn: async () => {
      if (!card) return;
      const { error } = await supabase
        .from('immobili')
        .update({ pubblicato_sito: !card.pubblicato_sito })
        .eq('id', card.id);
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess(card?.pubblicato_sito ? 'Rimosso dal sito.' : 'Pubblicato sul sito!');
      queryClient.invalidateQueries({ queryKey: ['immobili-pipeline'] });
    },
    onError: () => showError('Aggiornamento pubblicazione non riuscito.'),
  });

  const aggiungiScadenza = useMutation({
    mutationFn: async () => {
      if (!card || !nuovaScadenzaData) return;
      const { error } = await supabase
        .from('pipeline_scadenze')
        .insert({
          immobile_id: card.id,
          fase: card.fase,
          sottofase: card.sottofase,
          descrizione: nuovaScadenzaDesc.trim() || null,
          scadenza: nuovaScadenzaData,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      setNuovaScadenzaData('');
      setNuovaScadenzaDesc('');
      queryClient.invalidateQueries({ queryKey: ['pipeline-scadenze', 'immobile', card?.id] });
    },
    onError: () => showError('Impossibile aggiungere la scadenza.'),
  });

  const eliminaScadenza = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('pipeline_scadenze').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pipeline-scadenze', 'immobile', card?.id] }),
  });

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
              {card.pubblicato_sito && (
                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 font-bold uppercase text-[0.65rem]">
                  <Globe size={11} className="mr-1" /> Online
                </Badge>
              )}
              {card.proprietario_nome && (
                <Badge variant="outline" className="font-semibold">Proprietario: {card.proprietario_nome}</Badge>
              )}
              {card.drive_folder_url && (
                <a
                  href={card.drive_folder_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#94b0ab] hover:text-[#7a948f] px-2.5 py-1 rounded-full border border-[#94b0ab]/40"
                >
                  <Folder size={12} /> Cartella Drive
                </a>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_ATTR}
              className="hidden"
              onChange={handleFileInputChange}
            />

            {/* Pubblicazione manuale al sito — visibile SOLO in sottofase
                "Pubblicato" della sezione In Vendita, come da spec (l'utente
                pubblica dopo che foto/materiale sono pronti). Nelle altre
                sottofasi resta un badge di stato ma non l'azione. */}
            {card.fase === 'In Vendita' && card.sottofase === 'Pubblicato' && (
              <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                    <Globe size={14} className="text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-800">
                      {card.pubblicato_sito ? 'Immobile pubblicato' : 'Pronto per la pubblicazione'}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {card.pubblicato_sito
                        ? 'Visibile sul sito pubblico. Puoi ritirarlo se serve.'
                        : 'Quando foto e materiale sono pronti, pubblica sul sito.'}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button
                    type="button"
                    onClick={() => togglePubblicazione.mutate()}
                    disabled={togglePubblicazione.isPending}
                    className={cn(
                      'rounded-xl font-bold text-xs h-9',
                      card.pubblicato_sito
                        ? 'bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white',
                    )}
                  >
                    {card.pubblicato_sito ? 'Rimuovi dal sito' : 'Pubblica sul sito'}
                  </Button>
                </div>
              </div>
            )}

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

            {/* Scadenze — sempre visibili, editabili in qualsiasi fase.
                Storico per fase: ogni scadenza porta la fase/sottofase in cui
                è stata creata così l'utente sa cosa riguardava. */}
            <div className="mt-6">
              <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-1.5">
                <CalendarClock size={12} /> Scadenze
              </h4>
              {(scadenze ?? []).length > 0 && (
                <div className="space-y-2 mb-3">
                  {(scadenze ?? []).map((s) => (
                    <div key={s.id} className="flex items-center gap-2 rounded-xl border border-gray-100 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-gray-800">
                            {new Date(s.scadenza).toLocaleDateString('it-IT')}
                          </span>
                          <Badge variant="outline" className="text-[0.6rem] font-semibold">
                            {s.fase}{s.sottofase && ` · ${s.sottofase}`}
                          </Badge>
                        </div>
                        {s.descrizione && (
                          <p className="text-xs text-gray-500 mt-0.5 truncate">{s.descrizione}</p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-gray-400 hover:text-red-500"
                        title="Rimuovi scadenza"
                        onClick={() => eliminaScadenza.mutate(s.id)}
                      >
                        <X size={14} />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-start gap-2">
                <Input
                  type="date"
                  value={nuovaScadenzaData}
                  onChange={(e) => setNuovaScadenzaData(e.target.value)}
                  className="rounded-xl h-10 w-40"
                />
                <Input
                  placeholder="Descrizione (opzionale)..."
                  value={nuovaScadenzaDesc}
                  onChange={(e) => setNuovaScadenzaDesc(e.target.value)}
                  className="rounded-xl h-10 flex-1"
                />
                <Button
                  type="button"
                  size="icon"
                  className="h-10 w-10 shrink-0 rounded-xl bg-[#94b0ab] hover:bg-[#7a948f]"
                  disabled={!nuovaScadenzaData || aggiungiScadenza.isPending}
                  onClick={() => aggiungiScadenza.mutate()}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Date chiave — solo per la sezione Venduto (come da spec, prima
                erano visibili sempre e confondevano l'utente in fase pratica). */}
            {card.fase === 'Venduto' && (
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
            )}

            <div className="mt-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400">
                  Checklist — {card.sottofase}
                </h4>
              </div>

              {/* Stepper compatto: mostra dove sono nel percorso della fase
                  corrente. */}
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
              ) : (
                <div className="space-y-4">
                  {/* Doc della sottofase corrente + di quelle precedenti (i
                      documenti si sommano entro la stessa sezione, come da
                      spec). Sottofasi future non mostrate finché non ci si
                      arriva col drag manuale. */}
                  {sezioniOrdinate.slice(0, sezioniOrdinate.indexOf(card.sottofase) + 1).map((sezione) => {
                    const docs = documentiPerSezione[sezione] ?? [];
                    if (docs.length === 0) return null;
                    return (
                      <div key={sezione}>
                        <p className="text-[0.65rem] font-bold uppercase tracking-widest text-gray-400 mb-1.5">
                          {sezione}
                        </p>
                        <div className="space-y-2">
                          {docs.map((doc) => (
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
                                title={doc.drive_file_id ? 'Visualizza file caricato' : 'Carica file (PDF o immagini)'}
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
                      </div>
                    );
                  })}
                  {(documentiPerSezione[card.sottofase] ?? []).length === 0 && (
                    <p className="text-sm text-gray-400 italic">Nessun documento da caricare per questa sottofase.</p>
                  )}
                </div>
              )}
            </div>

            {/* Elimina immobile (soft-delete): sempre disponibile, con
                conferma esplicita perché toglie la card dalla pipeline e
                dal sito pubblico. */}
            <div className="mt-8 pt-6 border-t border-gray-100">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfermaElimina(true)}
                className="text-red-500 hover:text-red-600 hover:bg-red-50 rounded-xl font-bold text-xs h-9 gap-1.5"
              >
                <Trash2 size={14} /> Elimina immobile
              </Button>
            </div>

            <AlertDialog open={confermaElimina} onOpenChange={setConfermaElimina}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2 text-red-600">
                    <KeyRound size={18} /> Elimina immobile
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    L'immobile <b>{card.titolo}</b> verrà rimosso dalla pipeline e dal sito pubblico.
                    L'operazione è reversibile solo da amministratore DB.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(e) => { e.preventDefault(); eliminaImmobile.mutate(); }}
                    className="bg-red-500 hover:bg-red-600 text-white"
                  >
                    Elimina
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default PipelineDetailSheet;
