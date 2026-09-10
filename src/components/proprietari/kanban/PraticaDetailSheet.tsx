import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Phone, User, Calculator, ExternalLink, Sparkles, Pencil, Folder,
  Paperclip, Loader2, Check, Plus, CalendarClock, X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { showError, showSuccess } from '@/utils/toast';
import { cn } from '@/lib/utils';
import { TIPOLOGIE_IMMOBILE } from '@/lib/constants';
import type { PraticaCard } from '@/hooks/useProprietariPipeline';
import type { PipelineScadenza, ProprietarioPraticaDocumento } from '@/types';
import ValuationWizard from '@/components/valutazioni/ValuationWizard';

interface PraticaDetailSheetProps {
  pratica: PraticaCard | null;
  onClose: () => void;
}

interface FormState {
  via: string;
  tipologia: string;
  citta: string;
  motivazione_vendita: string;
  scadenza_esclusiva: string;
  valutazione_stimata: string;
}

const emptyForm: FormState = {
  via: '',
  tipologia: '',
  citta: '',
  motivazione_vendita: '',
  scadenza_esclusiva: '',
  valutazione_stimata: '',
};

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

const PraticaDetailSheet = ({ pratica, onClose }: PraticaDetailSheetProps) => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [nuovaScadenzaData, setNuovaScadenzaData] = useState('');
  const [nuovaScadenzaDesc, setNuovaScadenzaDesc] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingUploadDoc = useRef<ProprietarioPraticaDocumento | null>(null);
  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null);

  const { data: ultimaValutazione } = useQuery<{
    id: string;
    stima_min: number | null;
    stima_max: number | null;
    slug: string | null;
    created_at: string;
    stato: string;
  } | null>({
    queryKey: ['pratica-ultima-valutazione', pratica?.proprietario_id],
    enabled: !!pratica?.proprietario_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('valutazioni')
        .select('id, stima_min, stima_max, slug, created_at, stato')
        .eq('proprietario_id', pratica!.proprietario_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });

  // Drive folder del contatto proprietario (contatti.drive_folder_url).
  // Query separata perché PraticaCard non porta questo campo.
  const { data: driveFolderInfo } = useQuery<{ drive_folder_url: string | null } | null>({
    queryKey: ['contatto-drive', pratica?.proprietario_id],
    enabled: !!pratica?.proprietario_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contatti')
        .select('drive_folder_url')
        .eq('id', pratica!.proprietario_id)
        .single();
      if (error) return null;
      return data as { drive_folder_url: string | null };
    },
  });

  const formatEuro = (n: number | null | undefined) => n == null ? '—' : new Intl.NumberFormat('it-IT', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(n);

  useEffect(() => {
    if (!pratica) {
      setForm(emptyForm);
      setIsEditing(false);
      setNuovaScadenzaData('');
      setNuovaScadenzaDesc('');
      return;
    }
    setIsEditing(false);
    setForm({
      via: pratica.via ?? '',
      tipologia: pratica.tipologia ?? '',
      citta: pratica.citta ?? '',
      motivazione_vendita: '',
      scadenza_esclusiva: '',
      valutazione_stimata: pratica.valutazione_stimata != null ? String(pratica.valutazione_stimata) : '',
    });

    let cancelled = false;
    supabase
      .from('proprietari_pratiche')
      .select('motivazione_vendita, scadenza_esclusiva')
      .eq('id', pratica.id)
      .single()
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        setForm((prev) => ({
          ...prev,
          motivazione_vendita: data.motivazione_vendita ?? '',
          scadenza_esclusiva: data.scadenza_esclusiva ?? '',
        }));
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pratica?.id]);

  const salvaPratica = useMutation({
    mutationFn: async () => {
      if (!pratica) return;
      const { error } = await supabase
        .from('proprietari_pratiche')
        .update({
          via: form.via.trim(),
          tipologia: form.tipologia.trim() || null,
          citta: form.citta.trim() || null,
          motivazione_vendita: form.motivazione_vendita.trim() || null,
          scadenza_esclusiva: form.scadenza_esclusiva || null,
          valutazione_stimata: form.valutazione_stimata ? Number(form.valutazione_stimata) : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', pratica.id);
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess('Pratica aggiornata.');
      queryClient.invalidateQueries({ queryKey: ['proprietari-pipeline'] });
      setIsEditing(false);
    },
    onError: () => showError('Salvataggio non riuscito.'),
  });

  const { data: documenti, isLoading: documentiLoading } = useQuery<ProprietarioPraticaDocumento[]>({
    queryKey: ['proprietari-pratica-documenti', pratica?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proprietari_pratica_documenti')
        .select('*')
        .eq('pratica_id', pratica!.id)
        .order('fase')
        .order('documento');
      if (error) throw error;
      return (data ?? []) as ProprietarioPraticaDocumento[];
    },
    enabled: !!pratica,
  });

  const documentiFaseCorrente = (documenti ?? []).filter((d) => d.fase === pratica?.fase);

  const toggleDocumento = useMutation({
    mutationFn: async (doc: ProprietarioPraticaDocumento) => {
      const nuovoStato = doc.stato === 'Fatto' ? 'Da fare' : 'Fatto';
      const { error } = await supabase
        .from('proprietari_pratica_documenti')
        .update({
          stato: nuovoStato,
          completato_at: nuovoStato === 'Fatto' ? new Date().toISOString() : null,
        })
        .eq('id', doc.id);
      if (error) throw error;
    },
    onSuccess: async (_data, doc) => {
      queryClient.invalidateQueries({ queryKey: ['proprietari-pratica-documenti', pratica?.id] });
      queryClient.invalidateQueries({ queryKey: ['proprietari-pipeline'] });

      // Passaggio automatico Proprietari → In Vendita: quando l'ultima fase
      // (Presa in carico) ha la checklist tutta completata la card sparirà
      // dal kanban Proprietari (filtro in useProprietariPipeline) e la card
      // immobile (creata da spostaFase→creaImmobileDaPratica) resta in
      // In Vendita.
      if (pratica?.fase === 'Presa in carico' && doc.stato === 'Da fare') {
        const { data: fresche } = await supabase
          .from('proprietari_pratica_documenti')
          .select('stato')
          .eq('pratica_id', pratica.id)
          .eq('fase', 'Presa in carico');
        const tutteFatte = (fresche ?? []).length > 0
          && (fresche ?? []).every((d) => d.stato === 'Fatto');
        if (tutteFatte) {
          showSuccess('Pratica completata: immobile spostato in "In Vendita".');
          queryClient.invalidateQueries({ queryKey: ['immobili-pipeline'] });
          onClose();
        }
      }
    },
    onError: () => showError('Aggiornamento documento non riuscito.'),
  });

  const ensureContattoFolder = async () => {
    if (!pratica) return;
    if (driveFolderInfo?.drive_folder_url) return;
    try {
      await supabase.functions.invoke('drive-documenti', {
        body: { action: 'createFolder', entita: 'contatto', contattoId: pratica.proprietario_id },
      });
      queryClient.invalidateQueries({ queryKey: ['contatto-drive', pratica.proprietario_id] });
    } catch (_) {
      // best-effort
    }
  };

  const uploadDocumento = useMutation({
    mutationFn: async ({ doc, file }: { doc: ProprietarioPraticaDocumento; file: File }) => {
      if (!pratica) throw new Error('Nessuna pratica selezionata.');
      await ensureContattoFolder();
      const fileBase64 = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke('drive-documenti', {
        body: {
          action: 'upload',
          entita: 'contatto',
          documentoId: doc.id,
          contattoId: pratica.proprietario_id,
          contattoTitolo: pratica.proprietario_nome || 'Contatto',
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
      queryClient.invalidateQueries({ queryKey: ['proprietari-pratica-documenti', pratica?.id] });
      queryClient.invalidateQueries({ queryKey: ['contatto-drive', pratica?.proprietario_id] });
    },
    onError: (err) => showError(err instanceof Error ? err.message : 'Caricamento file non riuscito.'),
    onSettled: () => setUploadingDocId(null),
  });

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const doc = pendingUploadDoc.current;
    if (!file || !doc) return;
    if (file.type && !ACCEPTED_MIME.includes(file.type)) {
      showError('Formato non ammesso. Carica PDF o immagini (jpg/png/webp/heic).');
      return;
    }
    setUploadingDocId(doc.id);
    uploadDocumento.mutate({ doc, file });
  };

  const handleUploadClick = (doc: ProprietarioPraticaDocumento) => {
    pendingUploadDoc.current = doc;
    fileInputRef.current?.click();
  };

  const handleViewFile = async (doc: ProprietarioPraticaDocumento) => {
    if (!doc.drive_file_id) return;
    const { data, error } = await supabase.functions.invoke('drive-documenti', {
      body: { action: 'getDownload', entita: 'contatto', documentoId: doc.id },
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

  // Scadenze — analogo della sezione in PipelineDetailSheet ma su pratica_id.
  const { data: scadenze } = useQuery<PipelineScadenza[]>({
    queryKey: ['pipeline-scadenze', 'pratica', pratica?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pipeline_scadenze')
        .select('*')
        .eq('pratica_id', pratica!.id)
        .order('scadenza', { ascending: true });
      if (error) throw error;
      return (data ?? []) as PipelineScadenza[];
    },
    enabled: !!pratica,
  });

  const aggiungiScadenza = useMutation({
    mutationFn: async () => {
      if (!pratica || !nuovaScadenzaData) return;
      const { error } = await supabase.from('pipeline_scadenze').insert({
        pratica_id: pratica.id,
        fase: pratica.fase,
        descrizione: nuovaScadenzaDesc.trim() || null,
        scadenza: nuovaScadenzaData,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNuovaScadenzaData('');
      setNuovaScadenzaDesc('');
      queryClient.invalidateQueries({ queryKey: ['pipeline-scadenze', 'pratica', pratica?.id] });
    },
    onError: () => showError('Impossibile aggiungere la scadenza.'),
  });

  const eliminaScadenza = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('pipeline_scadenze').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pipeline-scadenze', 'pratica', pratica?.id] }),
  });

  return (
    <Sheet open={!!pratica} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[480px] overflow-y-auto">
        {pratica && (
          <>
            <SheetHeader className="text-left">
              <SheetTitle className="text-xl font-extrabold">{pratica.via}</SheetTitle>
              <SheetDescription className="font-medium">
                {[pratica.citta, pratica.tipologia].filter(Boolean).join(' · ') || 'Pratica proprietario'}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="font-semibold">{pratica.fase}</Badge>
              {driveFolderInfo?.drive_folder_url && (
                <a
                  href={driveFolderInfo.drive_folder_url}
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

            <div className="mt-6 rounded-2xl border border-gray-100 bg-gray-50/50 p-4 space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Proprietario</h4>
              {pratica.proprietario_nome && (
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <User size={14} className="text-gray-400 shrink-0" />
                  {pratica.proprietario_nome}
                </div>
              )}
              {pratica.proprietario_telefono && (
                <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
                  <Phone size={14} className="text-gray-400 shrink-0" />
                  {pratica.proprietario_telefono}
                </div>
              )}
            </div>

            <div className="mt-6 rounded-2xl border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
                  <Sparkles size={12} className="text-[#94b0ab]" />
                  Valutazione AI
                </h4>
                {ultimaValutazione?.slug && (
                  <a
                    href={`/report/${ultimaValutazione.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-bold text-[#94b0ab] hover:underline flex items-center gap-1"
                  >
                    Apri report <ExternalLink size={11} />
                  </a>
                )}
              </div>
              {ultimaValutazione ? (
                <>
                  <p className="text-lg font-black text-gray-900 leading-tight">
                    {formatEuro(ultimaValutazione.stima_min)}
                    {ultimaValutazione.stima_min != null && ultimaValutazione.stima_max != null && (
                      <span className="text-gray-300 mx-2 font-light">–</span>
                    )}
                    {formatEuro(ultimaValutazione.stima_max)}
                  </p>
                  <p className="text-[0.65rem] text-gray-400 uppercase tracking-wider mt-1">
                    {ultimaValutazione.stato} · {new Date(ultimaValutazione.created_at).toLocaleDateString('it-IT')}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setWizardOpen(true)}
                    className="w-full mt-3 rounded-xl text-xs font-bold border-gray-200"
                  >
                    <Calculator size={13} className="mr-1.5" />
                    Nuova valutazione
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-400 italic mb-3">Nessuna valutazione per questo proprietario.</p>
                  <Button
                    type="button"
                    onClick={() => setWizardOpen(true)}
                    className="w-full bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl text-xs font-bold h-10"
                  >
                    <Calculator size={13} className="mr-1.5" />
                    Crea valutazione
                  </Button>
                </>
              )}
            </div>

            {/* Scadenze — sempre visibili, editabili in qualsiasi fase */}
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
                          <Badge variant="outline" className="text-[0.6rem] font-semibold">{s.fase}</Badge>
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

            <div className="mt-6">
              <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Checklist documenti</h4>
              {documentiLoading ? (
                <p className="text-sm text-gray-400 italic">Caricamento...</p>
              ) : documentiFaseCorrente.length === 0 ? (
                <p className="text-sm text-gray-400 italic">Nessun documento per questa fase.</p>
              ) : (
                <div className="space-y-2">
                  {documentiFaseCorrente.map((doc) => {
                    // Upload disponibile solo nella fase "Presa in carico"
                    // (le altre fasi proprietari non hanno documenti da
                    // allegare, solo spunte).
                    const uploadAbilitato = pratica.fase === 'Presa in carico';
                    return (
                      <div
                        key={doc.id}
                        className="flex items-center gap-3 rounded-xl border border-gray-100 px-3 py-2.5 hover:bg-gray-50 transition-colors"
                      >
                        <label
                          className={cn(
                            'flex items-center gap-3 flex-1 min-w-0',
                            !uploadAbilitato || doc.stato === 'Fatto' || doc.drive_file_id
                              ? 'cursor-pointer' : 'cursor-not-allowed',
                          )}
                          title={uploadAbilitato && doc.stato !== 'Fatto' && !doc.drive_file_id
                            ? 'Carica prima il file per poterlo segnare come fatto' : undefined}
                        >
                          <Checkbox
                            checked={doc.stato === 'Fatto'}
                            disabled={uploadAbilitato && doc.stato !== 'Fatto' && !doc.drive_file_id}
                            onCheckedChange={() => toggleDocumento.mutate(doc)}
                          />
                          <span className={cn(
                            'text-sm font-medium truncate',
                            doc.stato === 'Fatto' ? 'text-gray-400 line-through' : 'text-gray-700',
                          )}>
                            {doc.documento}
                          </span>
                        </label>
                        {uploadAbilitato && (
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
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400">Dettagli pratica</h4>
                {!isEditing && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditing(true)}
                    className="h-7 text-xs font-bold text-[#94b0ab] hover:bg-[#94b0ab]/10 rounded-lg px-2"
                  >
                    <Pencil size={12} className="mr-1" />
                    Modifica
                  </Button>
                )}
              </div>

              {isEditing ? (
                <form
                  className="space-y-4"
                  onSubmit={(e) => { e.preventDefault(); salvaPratica.mutate(); }}
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="via" className="text-xs font-bold text-gray-500">Via *</Label>
                    <Input
                      id="via"
                      value={form.via}
                      onChange={(e) => setForm((f) => ({ ...f, via: e.target.value }))}
                      required
                      className="rounded-xl"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="tipologia" className="text-xs font-bold text-gray-500">Tipologia</Label>
                      <Select value={form.tipologia} onValueChange={(v) => setForm((f) => ({ ...f, tipologia: v }))}>
                        <SelectTrigger id="tipologia" className="rounded-xl"><SelectValue placeholder="Seleziona..." /></SelectTrigger>
                        <SelectContent className="rounded-xl">
                          {TIPOLOGIE_IMMOBILE.map((t) => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="citta" className="text-xs font-bold text-gray-500">Città</Label>
                      <Input
                        id="citta"
                        value={form.citta}
                        onChange={(e) => setForm((f) => ({ ...f, citta: e.target.value }))}
                        className="rounded-xl"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="motivazione_vendita" className="text-xs font-bold text-gray-500">Motivazione vendita</Label>
                    <Textarea
                      id="motivazione_vendita"
                      value={form.motivazione_vendita}
                      onChange={(e) => setForm((f) => ({ ...f, motivazione_vendita: e.target.value }))}
                      className="rounded-xl min-h-[4rem]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="scadenza_esclusiva" className="text-xs font-bold text-gray-500">Scadenza esclusiva</Label>
                      <Input
                        id="scadenza_esclusiva"
                        type="date"
                        value={form.scadenza_esclusiva}
                        onChange={(e) => setForm((f) => ({ ...f, scadenza_esclusiva: e.target.value }))}
                        className="rounded-xl"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="valutazione_stimata" className="text-xs font-bold text-gray-500">Valutazione stimata</Label>
                      <Input
                        id="valutazione_stimata"
                        type="number"
                        min="0"
                        value={form.valutazione_stimata}
                        onChange={(e) => setForm((f) => ({ ...f, valutazione_stimata: e.target.value }))}
                        className="rounded-xl"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsEditing(false)}
                      className="flex-1 rounded-xl font-bold border-gray-200 h-11"
                    >
                      Annulla
                    </Button>
                    <Button
                      type="submit"
                      disabled={salvaPratica.isPending || !form.via.trim()}
                      className="flex-1 bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl font-bold h-11"
                    >
                      Salva
                    </Button>
                  </div>
                </form>
              ) : (
                <dl className="space-y-2 text-sm">
                  <ReadRow label="Via" value={form.via} />
                  <ReadRow label="Tipologia" value={form.tipologia || '—'} />
                  <ReadRow label="Città" value={form.citta || '—'} />
                  <ReadRow label="Motivazione" value={form.motivazione_vendita || '—'} multiline />
                  <ReadRow label="Scadenza esclusiva" value={form.scadenza_esclusiva ? new Date(form.scadenza_esclusiva).toLocaleDateString('it-IT') : '—'} />
                  <ReadRow label="Valutazione stimata" value={form.valutazione_stimata ? formatEuro(Number(form.valutazione_stimata)) : '—'} />
                </dl>
              )}
            </div>

            <ValuationWizard
              open={wizardOpen}
              onClose={() => setWizardOpen(false)}
              onSaved={() => {
                queryClient.invalidateQueries({ queryKey: ['pratica-ultima-valutazione', pratica.proprietario_id] });
              }}
              initialProprietarioId={pratica.proprietario_id}
              initialProprietarioNome={pratica.proprietario_nome || undefined}
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

const ReadRow = ({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) => (
  <div className={cn('flex gap-3', multiline ? 'flex-col' : 'items-baseline justify-between')}>
    <dt className="text-[0.65rem] font-bold uppercase tracking-wider text-gray-400 shrink-0">{label}</dt>
    <dd className={cn('text-gray-800 font-semibold', multiline ? 'text-sm whitespace-pre-wrap' : 'text-sm text-right truncate')}>{value}</dd>
  </div>
);

export default PraticaDetailSheet;
