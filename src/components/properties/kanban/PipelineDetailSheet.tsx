import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
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
  Trash2, Globe, StickyNote, CalendarPlus, ArrowRight, ExternalLink, Archive,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { showError, showSuccess } from '@/utils/toast';
import { cn } from '@/lib/utils';
import { useImmobiliPipeline, type PipelineCard } from '@/hooks/useImmobiliPipeline';
import { useAlerts } from '@/hooks/useAlerts';
import { useContactNotes, useAddContactNote } from '@/hooks/useContactNotes';
import { useTasks, useInvalidateTasks } from '@/hooks/useTasks';
import { generaChecklistPerFase, upsertFasePipeline, upsertSottofasePipeline } from '@/lib/pipelineChecklist';
import {
  SOTTOFASI_IN_VENDITA, SOTTOFASI_VENDUTO,
  type ImmobileDocumento, type Sottofase, type SottofaseVenduto,
} from '@/types';
import TaskModal from '@/components/TaskModal';
import EventFormModal, { type AgentProfile } from '@/components/agenda/EventFormModal';

// Estensioni/MIME ammessi per upload documenti. Include PDF e immagini
// comuni (jpg/png/webp/heic).
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
  const invalidateTasks = useInvalidateTasks();
  const { manuali, creaAlert, risolviAlert } = useAlerts();
  // Anche se non usiamo direttamente le mutation di useImmobiliPipeline qui,
  // le importiamo (staleTime coerente + invalidazione condivisa).
  void useImmobiliPipeline;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingUploadDoc = useRef<ImmobileDocumento | null>(null);
  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null);
  const [nuovoAlert, setNuovoAlert] = useState('');
  const [dataPreliminare, setDataPreliminare] = useState('');
  const [dataAtto, setDataAtto] = useState('');
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [confermaElimina, setConfermaElimina] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [driveUrlLocal, setDriveUrlLocal] = useState('');
  const [isEditingDrive, setIsEditingDrive] = useState(false);
  const [agentiForEvent, setAgentiForEvent] = useState<AgentProfile[]>([]);
  const [tipologiaAppuntamento, setTipologiaAppuntamento] = useState<string | null>(null);

  useEffect(() => {
    setNuovoAlert('');
    setDataPreliminare(card?.data_preliminare ?? '');
    setDataAtto(card?.data_atto ?? '');
    setIsEditingDate(false);
    setNewNoteText('');
    setDriveUrlLocal(card?.drive_folder_url ?? '');
    setIsEditingDrive(false);
    setTipologiaAppuntamento(null);
  }, [card?.id, card?.data_preliminare, card?.data_atto, card?.drive_folder_url]);

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

  // Proprietario dell'immobile (per note condivise e nome agente assegnato).
  // Reverse embed via immobili.proprietario_id → contatti(id).
  const { data: proprietarioInfo } = useQuery<{ id: string; agente_id: string | null; agenteNome: string | null } | null>({
    queryKey: ['immobile-proprietario', card?.id],
    enabled: !!card,
    queryFn: async () => {
      const { data: immobile } = await supabase
        .from('immobili')
        .select('proprietario_id')
        .eq('id', card!.id)
        .single();
      if (!immobile?.proprietario_id) return null;
      const { data: contatto } = await supabase
        .from('contatti')
        .select('id, agente_id')
        .eq('id', immobile.proprietario_id)
        .maybeSingle();
      if (!contatto) return null;
      let agenteNome: string | null = null;
      if (contatto.agente_id) {
        const { data: prof } = await supabase
          .from('profili_agenti')
          .select('nome_completo')
          .eq('id', contatto.agente_id)
          .maybeSingle();
        agenteNome = prof?.nome_completo ?? null;
      }
      return { id: contatto.id, agente_id: contatto.agente_id, agenteNome };
    },
  });

  // Appuntamenti collegati all'immobile (futuri o già passati, ordinati
  // recenti prima). Mostrati inline così l'agente vede subito cosa è già
  // fissato senza saltare all'Agenda.
  const { data: appuntamenti = [] } = useQuery<Array<{ id: string; data: string; ora_inizio: string | null; tipologia: string; note: string | null }>>({
    queryKey: ['immobile-appuntamenti', card?.id],
    enabled: !!card,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appuntamenti')
        .select('id, data, ora_inizio, tipologia, note')
        .eq('immobile_id', card!.id)
        .order('data', { ascending: false })
        .limit(20);
      if (error) return [];
      return (data ?? []) as Array<{ id: string; data: string; ora_inizio: string | null; tipologia: string; note: string | null }>;
    },
  });

  // Task collegate all'immobile (via nuovo campo tasks.immobile_id).
  const { data: tasks = [] } = useTasks({
    scope: card?.id ? { kind: 'immobile', immobileId: card.id } : { kind: 'all' },
    enabled: !!card?.id,
  });

  // Note del proprietario collegato: sempre visibili, condivise con la scheda
  // contatti proprietario. Se l'immobile non ha proprietario_id (immobili
  // creati direttamente senza pratica), la sezione mostra un placeholder.
  const { data: notes = [] } = useContactNotes(proprietarioInfo?.id ?? null);
  const addNote = useAddContactNote(proprietarioInfo?.id ?? null);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['immobile-documenti', card?.id] });
    queryClient.invalidateQueries({ queryKey: ['immobili-pipeline'] });
  };

  // Solo aggiornamento stato del documento. Nessun side-effect di passaggio
  // fase — dal 2026-09-14 il passaggio In Vendita → Venduto è manuale via
  // pulsanti "Passa a Vincolo" / "Passa a Preliminare" qui sotto.
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
    onSuccess: invalidateAll,
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

  // Documenti raggruppati per sottofase — visualizzazione cumulativa
  // (sottofasi precedenti restano visibili nella colonna corrente).
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
      // Aggiorniamo entrambi i flag insieme: `pubblicato_sito` è la source of
      // truth per la RLS anon del sito pubblico, `visibile` è il toggle della
      // lista admin `/immobili`. Gli immobili auto-creati partono con
      // entrambi=false (vedi passaAInPreparazione in PraticaDetailSheet), qui
      // vengono attivati insieme così l'agente non deve toccarli in 2 punti.
      const nuovoStato = !card.pubblicato_sito;
      const { error } = await supabase
        .from('immobili')
        .update({ pubblicato_sito: nuovoStato, visibile: nuovoStato })
        .eq('id', card.id);
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess(card?.pubblicato_sito ? 'Rimosso dal sito.' : 'Pubblicato sul sito!');
      queryClient.invalidateQueries({ queryKey: ['immobili-pipeline'] });
    },
    onError: () => showError('Aggiornamento pubblicazione non riuscito.'),
  });

  // Salva manuale del link Drive: sempre visibile in ogni fase per compat con
  // la richiesta "facilità di collegamento della cartella Drive, sempre visibile
  // il link una volta caricato" — non c'è più upload/collegamento automatico.
  const salvaDriveUrl = useMutation({
    mutationFn: async () => {
      if (!card) return;
      const { error } = await supabase
        .from('immobili')
        .update({ drive_folder_url: driveUrlLocal.trim() || null })
        .eq('id', card.id);
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess('Link cartella aggiornato.');
      queryClient.invalidateQueries({ queryKey: ['immobili-pipeline'] });
      setIsEditingDrive(false);
    },
    onError: () => showError('Salvataggio link non riuscito.'),
  });

  // Passaggio manuale tra sottofasi: usato dai pulsanti "Passa a Vincolo" e
  // "Passa a Preliminare" visibili in "In trattativa". Sposta la card in
  // Venduto/<sottofase scelta> generando anche la checklist di Venduto se
  // manca (idempotente via ON CONFLICT).
  const passaAVenduto = useMutation({
    mutationFn: async (targetSottofase: SottofaseVenduto) => {
      if (!card) return;
      await upsertFasePipeline(card.id, 'Venduto', targetSottofase);
      await generaChecklistPerFase(card.id, 'Venduto');
    },
    onSuccess: (_data, targetSottofase) => {
      showSuccess(`Immobile spostato in "Venduto" · ${targetSottofase}.`);
      queryClient.invalidateQueries({ queryKey: ['immobili-pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['immobile-documenti', card?.id] });
      onClose();
    },
    onError: () => showError('Passaggio fase non riuscito.'),
  });

  // Passaggio manuale tra sottofasi della stessa fase (es. Preparazione →
  // Pubblicato, Pubblicato → In trattativa). Alternativa al drag&drop del
  // kanban, comoda direttamente dalla scheda.
  const passaSottofase = useMutation({
    mutationFn: async (target: Sottofase) => {
      if (!card) return;
      await upsertSottofasePipeline(card.id, target);
    },
    onSuccess: (_data, target) => {
      showSuccess(`Sottofase aggiornata: ${target}.`);
      queryClient.invalidateQueries({ queryKey: ['immobili-pipeline'] });
    },
    onError: () => showError('Cambio sottofase non riuscito.'),
  });

  // Apertura del modal appuntamento precompilato con questo immobile.
  // Carica al volo la lista agenti se serve (l'utente cliccherà "Fissa
  // appuntamento" al più poche volte, caricare on-demand è più lieve che
  // tenere una query background sempre attiva).
  const openEventModal = async (tipoOpt?: string) => {
    if (agentiForEvent.length === 0) {
      const { data } = await supabase.from('profili_agenti').select('id, nome_completo, colore_calendario');
      setAgentiForEvent((data ?? []) as AgentProfile[]);
    }
    setTipologiaAppuntamento(tipoOpt ?? null);
    setEventModalOpen(true);
  };

  const currentSottofaseIdx = sezioniOrdinate.indexOf(card?.sottofase ?? sezioniOrdinate[0]);
  // La sottofase "Archivio" NON è più esposta come "prossima" nel pulsante
  // generico: si accede solo tramite il bottone dedicato "Manda in archivio"
  // qui sotto, così l'archiviazione resta un'azione consapevole (non un
  // semplice "next").
  const rawNext = currentSottofaseIdx >= 0 && currentSottofaseIdx < sezioniOrdinate.length - 1
    ? sezioniOrdinate[currentSottofaseIdx + 1]
    : null;
  const nextSottofase = rawNext === 'Archivio' ? null : rawNext;

  return (
    <Sheet open={!!card} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[520px] overflow-y-auto">
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
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_ATTR}
              className="hidden"
              onChange={handleFileInputChange}
            />

            {/* Cartella Drive — sempre visibile, editabile a mano. Nessuna
                automazione forzata: se l'utente ha una cartella pronta la
                incolla, altrimenti resta vuoto (lazy-create al primo upload
                doc via drive-documenti). Se il proprietario ha già un link
                Drive impostato sul contatto, viene ereditato dall'immobile al
                momento della creazione (vedi useProprietariPipeline). */}
            <div className="mt-4 rounded-2xl border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
                  <Folder size={12} /> Cartella Drive
                </h4>
                {!isEditingDrive && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditingDrive(true)}
                    className="h-7 text-xs font-bold text-[#94b0ab] hover:bg-[#94b0ab]/10 rounded-lg px-2"
                  >
                    <Pencil size={12} className="mr-1" />
                    Modifica
                  </Button>
                )}
              </div>
              {isEditingDrive ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={driveUrlLocal}
                    onChange={(e) => setDriveUrlLocal(e.target.value)}
                    placeholder="https://drive.google.com/..."
                    className="h-10 rounded-xl text-sm"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => salvaDriveUrl.mutate()}
                    disabled={salvaDriveUrl.isPending}
                    className="rounded-xl bg-[#94b0ab] hover:bg-[#7a948f] text-white h-10 shrink-0"
                  >
                    Salva
                  </Button>
                </div>
              ) : card.drive_folder_url ? (
                <a
                  href={card.drive_folder_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#94b0ab] hover:text-[#7a948f]"
                >
                  <ExternalLink size={13} /> Apri cartella
                </a>
              ) : (
                <p className="text-sm text-gray-300 italic">Nessuna cartella collegata.</p>
              )}
            </div>

            {/* Pubblicazione manuale al sito — visibile SOLO in sottofase
                "Pubblicato" della sezione In Vendita, come da spec. */}
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

            {/* Date chiave — solo per la sezione Venduto. */}
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

              {/* Stepper compatto. */}
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
                      documenti si sommano entro la stessa sezione). */}
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

            {/* Passaggi fase manuali. La checklist non guida più il flow: è
                l'agente a decidere quando spostare la card. */}
            <div className="mt-6 space-y-2">
              {nextSottofase && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => passaSottofase.mutate(nextSottofase)}
                  disabled={passaSottofase.isPending}
                  className="w-full rounded-xl font-bold h-10 text-xs border-gray-200 gap-2"
                >
                  <ArrowRight size={13} />
                  Passa a "{nextSottofase}"
                </Button>
              )}
              {card.fase === 'In Vendita' && card.sottofase === 'In trattativa' && (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    onClick={() => passaAVenduto.mutate('Vincolo')}
                    disabled={passaAVenduto.isPending}
                    className="rounded-xl font-bold text-xs h-10 bg-[#94b0ab] hover:bg-[#7a948f] text-white gap-1"
                  >
                    <ArrowRight size={13} />
                    Passa a Vincolo
                  </Button>
                  <Button
                    type="button"
                    onClick={() => passaAVenduto.mutate('Preliminare')}
                    disabled={passaAVenduto.isPending}
                    className="rounded-xl font-bold text-xs h-10 bg-[#94b0ab] hover:bg-[#7a948f] text-white gap-1"
                  >
                    <ArrowRight size={13} />
                    Passa a Preliminare
                  </Button>
                </div>
              )}
              {/* Manda in archivio: visibile solo da Rogito (fase finale
                  operativa). Sposta la card in Venduto/Archivio — sparisce
                  dal kanban ma resta consultabile via bottone "Archivio"
                  sopra la board. */}
              {card.fase === 'Venduto' && card.sottofase === 'Rogito' && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => passaSottofase.mutate('Archivio')}
                  disabled={passaSottofase.isPending}
                  className="w-full rounded-xl font-bold h-10 text-xs border-gray-200 gap-2 hover:bg-gray-50"
                >
                  <Archive size={13} />
                  Manda in archivio
                </Button>
              )}
            </div>

            {/* Appuntamenti collegati — riflette in Agenda e viceversa. */}
            <div className="mt-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400">Appuntamenti</h4>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => openEventModal()}
                  className="h-7 text-xs font-bold rounded-lg px-2 border-gray-200"
                >
                  <CalendarPlus size={12} className="mr-1" /> Fissa
                </Button>
              </div>
              {appuntamenti.length === 0 ? (
                <p className="text-sm text-gray-300 italic">Nessun appuntamento collegato.</p>
              ) : (
                <div className="space-y-2">
                  {appuntamenti.slice(0, 6).map((a) => (
                    <div key={a.id} className="rounded-xl border border-gray-100 px-3 py-2">
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <span className="text-sm font-semibold text-gray-700 truncate">{a.tipologia}</span>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[#94b0ab] shrink-0">
                          {format(parseISO(a.data), 'd MMM yyyy', { locale: it })}
                          {a.ora_inizio && ` · ${a.ora_inizio.slice(0, 5)}`}
                        </span>
                      </div>
                      {a.note && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{a.note}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {/* Shortcut per fissare direttamente un appuntamento in fase
                  attuale — comodo per creare l'evento in agenda coerente col
                  momento pipeline (es. Rivalutazione, Preliminare, Rogito). */}
              {card.fase === 'Venduto' && (card.sottofase === 'Preliminare' || card.sottofase === 'Rogito') && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => openEventModal(card.sottofase as string)}
                  className="mt-2 h-7 text-xs font-bold text-[#94b0ab] hover:bg-[#94b0ab]/10 rounded-lg px-2"
                >
                  <CalendarPlus size={12} className="mr-1" /> Aggiungi appuntamento "{card.sottofase}"
                </Button>
              )}
            </div>

            {/* Task collegate all'immobile — stesso storico visibile in /tasks. */}
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
                <p className="text-sm text-gray-300 italic">Nessuna task collegata a questo immobile.</p>
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

            {/* Note — condivise con la scheda proprietario. Se l'immobile non
                ha proprietario_id (creato senza pratica), niente da mostrare. */}
            <div className="mt-6">
              <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-1.5">
                <StickyNote size={12} /> {proprietarioInfo?.agenteNome ? `Note di ${proprietarioInfo.agenteNome}` : 'Note'}
              </h4>
              {!proprietarioInfo?.id ? (
                <p className="text-sm text-gray-300 italic">Nessun proprietario collegato a questo immobile.</p>
              ) : (
                <>
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
                </>
              )}
            </div>

            {/* Elimina immobile (soft-delete): sempre disponibile. */}
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

            <TaskModal
              open={taskModalOpen}
              onClose={() => setTaskModalOpen(false)}
              onSaved={() => { setTaskModalOpen(false); invalidateTasks(); }}
              defaultContattoId={proprietarioInfo?.id}
              defaultContattoName={card.proprietario_nome ?? undefined}
              defaultImmobileId={card.id}
              defaultImmobileTitolo={card.titolo}
              origine="gestione"
            />

            <EventFormModal
              open={eventModalOpen}
              onClose={() => setEventModalOpen(false)}
              onSaved={() => {
                setEventModalOpen(false);
                queryClient.invalidateQueries({ queryKey: ['immobile-appuntamenti', card.id] });
                queryClient.invalidateQueries({ queryKey: ['appuntamenti'] });
              }}
              defaultContattoId={proprietarioInfo?.id ?? undefined}
              defaultContattoName={card.proprietario_nome ?? undefined}
              defaultImmobileId={card.id}
              defaultTipologia={tipologiaAppuntamento ?? undefined}
              agents={agentiForEvent}
              properties={[{ id: card.id, titolo: card.titolo, copertina_url: card.copertina_url ?? null }]}
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default PipelineDetailSheet;
