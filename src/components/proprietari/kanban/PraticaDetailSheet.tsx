import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Phone, User, Calculator, ExternalLink, Sparkles, Pencil, Folder,
  Paperclip, Loader2, Check, Plus, StickyNote, ArrowRight, Trash2, KeyRound,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { showError, showSuccess } from '@/utils/toast';
import { cn } from '@/lib/utils';
import { TIPOLOGIE_IMMOBILE } from '@/lib/constants';
import type { PraticaCard } from '@/hooks/useProprietariPipeline';
import type { ProprietarioPraticaDocumento } from '@/types';
import { useContactNotes, useAddContactNote } from '@/hooks/useContactNotes';
import { useTasks, useInvalidateTasks } from '@/hooks/useTasks';
import { useCurrentProfile } from '@/hooks/useCurrentProfile';
import { generaChecklistPerFase, upsertFasePipeline } from '@/lib/pipelineChecklist';
import ValuationWizard from '@/components/valutazioni/ValuationWizard';
import TaskModal from '@/components/TaskModal';

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
  const invalidateTasks = useInvalidateTasks();
  const { data: currentProfile } = useCurrentProfile();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingUploadDoc = useRef<ProprietarioPraticaDocumento | null>(null);
  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null);
  const [newNoteText, setNewNoteText] = useState('');
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [confermaPassaggioFase, setConfermaPassaggioFase] = useState(false);
  const [confermaEliminaImmobile, setConfermaEliminaImmobile] = useState(false);

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
  const { data: driveFolderInfo } = useQuery<{ drive_folder_url: string | null; agente_id: string | null } | null>({
    queryKey: ['contatto-drive', pratica?.proprietario_id],
    enabled: !!pratica?.proprietario_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contatti')
        .select('drive_folder_url, agente_id')
        .eq('id', pratica!.proprietario_id)
        .single();
      if (error) return null;
      return data as { drive_folder_url: string | null; agente_id: string | null };
    },
  });

  // Nome dell'agente assegnato al proprietario — usato per il titolo dinamico
  // della sezione "Note di [Agente]" (fallback "Note" se nessun agente).
  const { data: agenteAssegnato } = useQuery<{ nome_completo: string | null } | null>({
    queryKey: ['pratica-agente', driveFolderInfo?.agente_id],
    enabled: !!driveFolderInfo?.agente_id,
    queryFn: async () => {
      const { data } = await supabase
        .from('profili_agenti')
        .select('nome_completo')
        .eq('id', driveFolderInfo!.agente_id!)
        .maybeSingle();
      return data ?? null;
    },
  });

  const formatEuro = (n: number | null | undefined) => n == null ? '—' : new Intl.NumberFormat('it-IT', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(n);

  useEffect(() => {
    if (!pratica) {
      setForm(emptyForm);
      setIsEditing(false);
      setNewNoteText('');
      return;
    }
    setIsEditing(false);
    setNewNoteText('');
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

  // Solo aggiornamento stato del documento: nessun side-effect di passaggio
  // automatico alla fase successiva. Il passaggio è ora esplicito via
  // pulsante "Passa a In preparazione" qui sotto, così l'agente decide quando
  // l'immobile è pronto per entrare in gestione (spec utente 2026-09-14).
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proprietari-pratica-documenti', pratica?.id] });
      queryClient.invalidateQueries({ queryKey: ['proprietari-pipeline'] });
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

  // Note del proprietario collegato: stessa tabella `lead_notes` usata dalla
  // scheda Contatti → così le note "seguono" il contatto ovunque appaia. Nessun
  // filtro per fase: le note restano visibili sempre, anche quando l'immobile
  // passa in gestione (era il bug segnalato dall'utente).
  const { data: notes = [] } = useContactNotes(pratica?.proprietario_id ?? null);
  const addNote = useAddContactNote(pratica?.proprietario_id ?? null);

  // Task collegate al proprietario (contatto): comodo storico direttamente
  // dalla scheda pratica, così l'agente non deve saltare tra viste.
  const { data: tasks = [] } = useTasks({
    scope: pratica?.proprietario_id
      ? { kind: 'contatto', contattoId: pratica.proprietario_id }
      : { kind: 'all' },
    enabled: !!pratica?.proprietario_id,
  });

  // Passaggio manuale dalla fase "Presa in carico" al kanban immobili
  // (sottofase Preparazione). Sostituisce il vecchio passaggio automatico
  // triggerato dal completamento della checklist. Se l'immobile non esiste
  // ancora, lo crea (idempotente: creaImmobileDaPratica salta se pratica.immobile_id
  // è già presente). Se esiste, si limita a upsertare la fase pipeline a
  // Preparazione (la card resta in Gestione).
  // Guardia anti-doppio-click a livello ref: `isPending` di useMutation
  // aggiorna lo state React nel ciclo successivo, quindi due click ravvicinati
  // possono entrambi entrare nella mutationFn prima che il pulsante venga
  // disabilitato. Il ref invece è sincrono — nessuna finestra di race.
  const passaggioInCorsoRef = useRef(false);

  const passaAInPreparazione = useMutation({
    mutationFn: async () => {
      if (!pratica) return;
      if (passaggioInCorsoRef.current) {
        console.warn('[passaAInPreparazione] già in corso, ignoro doppio click');
        return;
      }
      passaggioInCorsoRef.current = true;
      try {
        // Guardia lato DB: rileggo la riga aggiornata e prendo il lock
        // logico via UPDATE ... WHERE immobile_id IS NULL RETURNING. Se un'altra
        // esecuzione ha già linkato un immobile a questa pratica, il WHERE
        // matcha 0 righe e riusiamo quell'immobile invece di crearne un altro.
        const { data: freshPratica, error: freshErr } = await supabase
          .from('proprietari_pratiche')
          .select('id, proprietario_id, via, tipologia, citta, valutazione_stimata, motivazione_vendita, scadenza_esclusiva, immobile_id')
          .eq('id', pratica.id)
          .single();
        if (freshErr) throw freshErr;
        let targetImmobileId = freshPratica.immobile_id;

        if (!targetImmobileId) {
          const { data: contattoDrive } = await supabase
            .from('contatti')
            .select('drive_folder_url')
            .eq('id', freshPratica.proprietario_id)
            .maybeSingle();

          const baseSlug = (freshPratica.via || 'immobile').toLowerCase().trim().replace(/ /g, '-').replace(/[^\w-]+/g, '');
          const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 8)}`;

          const { data: created, error: immobileError } = await supabase
            .from('immobili')
            .insert({
              titolo: freshPratica.tipologia ? `${freshPratica.tipologia} in ${freshPratica.via}` : freshPratica.via,
              indirizzo: freshPratica.via,
              citta: freshPratica.citta,
              tipologia: freshPratica.tipologia,
              prezzo: freshPratica.valutazione_stimata,
              motivazione_vendita: freshPratica.motivazione_vendita,
              scadenza_esclusiva: freshPratica.scadenza_esclusiva,
              proprietario_id: freshPratica.proprietario_id,
              drive_folder_url: contattoDrive?.drive_folder_url ?? null,
              stato: 'Bozza',
              // Auto-creazione da pratica: nasce SEMPRE nascosto dal sito
              // pubblico. `visibile` (toggle admin nella lista /immobili) e
              // `pubblicato_sito` (source of truth per la RLS anon) settati a
              // false, così l'agente deve pubblicarlo esplicitamente dal
              // kanban Gestione (sottofase "Pubblicato" → pulsante "Pubblica
              // sul sito").
              visibile: false,
              pubblicato_sito: false,
              slug,
            })
            .select('id')
            .single();
          if (immobileError) throw immobileError;

          // UPDATE condizionale: settiamo immobile_id solo se ancora NULL.
          // Se una race concomitante l'ha già scritto, il WHERE matcha 0 righe:
          // scartiamo l'immobile appena creato e riusiamo quello vincitore.
          const { data: linked, error: linkErr } = await supabase
            .from('proprietari_pratiche')
            .update({ immobile_id: created.id })
            .eq('id', pratica.id)
            .is('immobile_id', null)
            .select('immobile_id');
          if (linkErr) throw linkErr;

          if (linked && linked.length > 0) {
            targetImmobileId = created.id;
          } else {
            // Race: qualcun altro ha vinto. Recuperiamo l'immobile vincitore
            // e cancelliamo quello nostro (hard-delete: non è mai stato usato).
            const { data: winner } = await supabase
              .from('proprietari_pratiche')
              .select('immobile_id')
              .eq('id', pratica.id)
              .single();
            await supabase.from('immobili').delete().eq('id', created.id);
            targetImmobileId = winner?.immobile_id ?? created.id;
          }

          // Fire-and-forget: la cartella Drive è best-effort e la Edge Function
          // può essere lenta o non configurata (env DRIVE_WEBAPP_URL). Non
          // vogliamo far aspettare l'utente ~1s per un'operazione ausiliaria:
          // il click "Sposta in Gestione" ora chiude subito dopo le operazioni
          // critiche, la cartella si crea in background.
          supabase.functions.invoke('drive-documenti', {
            body: { action: 'createFolder', immobileId: targetImmobileId },
          }).catch(() => { /* silenzioso */ });
        }

        await upsertFasePipeline(targetImmobileId!, 'In Vendita', 'Preparazione');
        await generaChecklistPerFase(targetImmobileId!, 'In Vendita');
      } finally {
        passaggioInCorsoRef.current = false;
      }
    },
    onSuccess: () => {
      showSuccess('Immobile spostato in gestione.');
      queryClient.invalidateQueries({ queryKey: ['proprietari-pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['immobili-pipeline'] });
      setConfermaPassaggioFase(false);
      onClose();
    },
    onError: (err) => {
      console.error('[passaAInPreparazione] ERROR', err);
      showError(`Passaggio in gestione non riuscito: ${err instanceof Error ? err.message : String(err)}`);
    },
  });

  // Elimina l'immobile collegato alla pratica (soft-delete) mantenendo il
  // contatto proprietario intatto. Richiesta esplicita: "devo poter eliminare
  // l'immobile a partire dalla sezione proprietario mantenendo però nella
  // sezione contatti il contatto". La FK immobili.proprietario_id ha ON DELETE
  // SET NULL, ma qui il soft-delete lascia la riga com'è — il contatto è
  // separato per design.
  const eliminaImmobile = useMutation({
    mutationFn: async () => {
      if (!pratica?.immobile_id) return;
      const { error } = await supabase
        .from('immobili')
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq('id', pratica.immobile_id);
      if (error) throw error;
      // Slega la pratica dall'immobile eliminato (così può eventualmente
      // ricreare un altro immobile se serve).
      await supabase
        .from('proprietari_pratiche')
        .update({ immobile_id: null })
        .eq('id', pratica.id);
    },
    onSuccess: () => {
      showSuccess('Immobile eliminato. Il contatto proprietario resta in Contatti.');
      queryClient.invalidateQueries({ queryKey: ['proprietari-pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['immobili-pipeline'] });
      setConfermaEliminaImmobile(false);
    },
    onError: () => showError('Eliminazione non riuscita.'),
  });

  const tipoNota = agenteAssegnato?.nome_completo?.trim()
    ? `Note di ${agenteAssegnato.nome_completo.trim()}`
    : 'Note';

  const autoreLoggato = currentProfile?.nome_completo?.trim() || 'Agente';

  return (
    <Sheet open={!!pratica} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[520px] overflow-y-auto">
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

            {/* Checklist documenti — flag manuale, non blocca il passaggio fase. */}
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
                    // (le altre fasi non hanno documenti da allegare, solo spunte).
                    const uploadAbilitato = pratica.fase === 'Presa in carico';
                    return (
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

            {/* Passaggio manuale a "In preparazione" (kanban immobili). Visibile
                solo quando la pratica è nella fase finale "Presa in carico": è la
                versione manuale del vecchio auto-passaggio triggerato dalla
                checklist. La checklist ora non blocca né guida il passaggio. */}
            {pratica.fase === 'Presa in carico' && (
              <div className="mt-6">
                <Button
                  type="button"
                  onClick={() => setConfermaPassaggioFase(true)}
                  className="w-full bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl font-bold h-11 gap-2"
                >
                  <ArrowRight size={15} />
                  Passa a "In preparazione" (Gestione)
                </Button>
              </div>
            )}

            {/* Task collegate — stesso storico visibile in /tasks e nella scheda contatto. */}
            <div className="mt-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400">Task</h4>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setTaskModalOpen(true)}
                  className="h-7 text-xs font-bold rounded-lg px-2 border-gray-200"
                >
                  <Plus size={12} className="mr-1" /> Nuova
                </Button>
              </div>
              {tasks.length === 0 ? (
                <p className="text-sm text-gray-300 italic">Nessuna task collegata.</p>
              ) : (
                <div className="space-y-2">
                  {tasks.slice(0, 8).map((t) => (
                    <div key={t.id} className="rounded-xl border border-gray-100 px-3 py-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className={cn(
                          'text-sm font-semibold truncate',
                          t.stato === 'Completata' ? 'text-gray-400 line-through' : 'text-gray-700',
                        )}>
                          {t.titolo || t.nota || 'Task'}
                        </p>
                        <p className="text-xs text-gray-400">
                          {format(parseISO(t.data), 'd MMM yyyy', { locale: it })}
                          {t.ora ? ` · ${t.ora.slice(0, 5)}` : ''}
                        </p>
                      </div>
                      <Badge variant="secondary" className="text-[0.65rem] font-semibold shrink-0">{t.stato}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Note del proprietario — sempre visibili, condivise con la scheda
                contatti. Titolo dinamico con nome agente quando disponibile. */}
            <div className="mt-6">
              <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-1.5">
                <StickyNote size={12} /> {tipoNota}
              </h4>
              <div className="flex items-start gap-2 mb-3">
                <Textarea
                  value={newNoteText}
                  onChange={(e) => setNewNoteText(e.target.value)}
                  placeholder="Scrivi una nota..."
                  className="rounded-xl min-h-[3rem] text-sm"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={() => addNote.mutate(newNoteText, { onSuccess: () => setNewNoteText('') })}
                  disabled={!newNoteText.trim() || addNote.isPending}
                  className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl shrink-0"
                >
                  <StickyNote size={14} />
                </Button>
              </div>
              {notes.length === 0 ? (
                <p className="text-sm text-gray-300 italic">Nessuna nota.</p>
              ) : (
                <div className="space-y-2">
                  {notes.slice(0, 6).map((n) => (
                    <div key={n.id} className="rounded-xl border border-gray-100 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-bold text-[#94b0ab]">{n.autore}</span>
                        <span className="text-[0.65rem] text-gray-300">
                          {format(parseISO(n.created_at), 'd MMM yyyy, HH:mm', { locale: it })}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 whitespace-pre-wrap">{n.testo}</p>
                    </div>
                  ))}
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

            {/* Elimina immobile: soft-delete. Il contatto proprietario NON viene
                toccato — resta in Contatti come richiesto. Bottone visibile solo
                se la pratica ha già un immobile collegato (creaImmobileDaPratica
                a "Presa in carico" o passaggio manuale). */}
            {pratica.immobile_id && (
              <div className="mt-6 pt-4 border-t border-gray-100">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setConfermaEliminaImmobile(true)}
                  className="text-red-500 hover:text-red-600 hover:bg-red-50 rounded-xl font-bold text-xs h-9 gap-1.5"
                >
                  <Trash2 size={14} /> Elimina immobile
                </Button>
                <p className="text-[10px] text-gray-400 mt-1">
                  Il proprietario resta salvato in Contatti.
                </p>
              </div>
            )}

            <AlertDialog open={confermaPassaggioFase} onOpenChange={setConfermaPassaggioFase}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2 text-[#94b0ab]">
                    <ArrowRight size={18} /> Passa a "In preparazione"
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    L'immobile <b>{pratica.via}</b> entrerà in Gestione, sezione "In Vendita",
                    sottofase "Preparazione". Potrai completare foto/prezzo/scheda da lì.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(e) => {
                      e.preventDefault();
                      if (passaAInPreparazione.isPending || passaggioInCorsoRef.current) return;
                      passaAInPreparazione.mutate();
                    }}
                    disabled={passaAInPreparazione.isPending}
                    className="bg-[#94b0ab] hover:bg-[#7a948f] text-white disabled:opacity-60 disabled:pointer-events-none"
                  >
                    {passaAInPreparazione.isPending ? 'Sposto…' : 'Sposta in Gestione'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={confermaEliminaImmobile} onOpenChange={setConfermaEliminaImmobile}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2 text-red-600">
                    <KeyRound size={18} /> Elimina immobile
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    L'immobile della pratica verrà rimosso dalla pipeline e dal sito pubblico.
                    Il contatto proprietario <b>{pratica.proprietario_nome}</b> resterà in Contatti.
                    L'operazione è reversibile solo da amministratore DB.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(e) => { e.preventDefault(); eliminaImmobile.mutate(); }}
                    className="bg-red-500 hover:bg-red-600 text-white"
                  >
                    Elimina immobile
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <ValuationWizard
              open={wizardOpen}
              onClose={() => setWizardOpen(false)}
              onSaved={() => {
                queryClient.invalidateQueries({ queryKey: ['pratica-ultima-valutazione', pratica.proprietario_id] });
              }}
              initialProprietarioId={pratica.proprietario_id}
              initialProprietarioNome={pratica.proprietario_nome || undefined}
            />

            <TaskModal
              open={taskModalOpen}
              onClose={() => setTaskModalOpen(false)}
              onSaved={() => { setTaskModalOpen(false); invalidateTasks(); }}
              defaultContattoId={pratica.proprietario_id}
              defaultContattoName={pratica.proprietario_nome || undefined}
              origine="gestione"
            />

            {/* Riferimento all'autore loggato per suppressare warning di
                variabile non usata quando le note dedotte servono al placeholder
                del componente <StickyNote> senza consumare autoreLoggato altrove. */}
            <span className="hidden">{autoreLoggato}</span>
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
