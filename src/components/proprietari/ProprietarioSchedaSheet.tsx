"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { showError, showSuccess } from '@/utils/toast';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Flame, CalendarClock, FileText, StickyNote, ExternalLink, Plus, Calculator } from 'lucide-react';
import { cn } from '@/lib/utils';
import TaskModal from '@/components/TaskModal';
import ValuationWizard from '@/components/valutazioni/ValuationWizard';
import { TIPOLOGIE_IMMOBILE } from '@/lib/constants';

interface AgenteOption {
  id: string;
  nome_completo: string | null;
}

interface ProprietarioDetail {
  id: string;
  nome: string;
  cognome: string | null;
  email: string | null;
  telefono: string | null;
  professione: string | null;
  note_interne: string | null;
  caldo: boolean;
  via_immobile: string | null;
  citta_immobile: string | null;
  tipologia_immobile: string | null;
  zona_venditore: string | null;
  motivazione_vendita: string | null;
  scadenza_esclusiva: string | null;
  valutazione_stimata: number | null;
  contatti: { agente_id: string | null; drive_folder_url: string | null } | null;
}

interface ValutazioneRow {
  id: string;
  indirizzo: string;
  stato: string;
  stima_min: number | null;
  stima_max: number | null;
  created_at: string;
  slug: string | null;
}

interface TaskRow {
  id: string;
  titolo: string | null;
  nota: string | null;
  data: string;
  stato: string;
}

interface NoteRow {
  id: string;
  testo: string;
  autore: string;
  created_at: string;
}

interface EventoRow {
  id: string;
  tipologia: string;
  data: string;
  ora_inizio: string | null;
  ora_fine: string | null;
  note: string | null;
  indirizzo_appuntamento: string | null;
}

interface ProprietarioSchedaSheetProps {
  proprietarioId: string | null;
  onClose: () => void;
}

const formatMoney = (n: number | null) => n != null ? new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n) : null;

const ProprietarioSchedaSheet = ({ proprietarioId, onClose }: ProprietarioSchedaSheetProps) => {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('anagrafica');
  const [form, setForm] = useState({
    nome: '', cognome: '', email: '', telefono: '', professione: '', note_interne: '',
    via_immobile: '', citta_immobile: '', tipologia_immobile: '',
    zona_venditore: '', motivazione_vendita: '',
    scadenza_esclusiva: '', valutazione_stimata: '',
  });
  const [agenti, setAgenti] = useState<AgenteOption[]>([]);
  const [agenteId, setAgenteId] = useState<string>('');
  const [driveUrl, setDriveUrl] = useState('');
  const [scadenzaOpen, setScadenzaOpen] = useState(false);
  const [scadenzaTesto, setScadenzaTesto] = useState('');
  const [scadenzaData, setScadenzaData] = useState('');
  const [newNoteText, setNewNoteText] = useState('');
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  const { data: proprietario, isLoading } = useQuery<ProprietarioDetail | null>({
    queryKey: ['proprietario-scheda', proprietarioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proprietari')
        .select('id, nome, cognome, email, telefono, professione, note_interne, caldo, via_immobile, citta_immobile, tipologia_immobile, zona_venditore, motivazione_vendita, scadenza_esclusiva, valutazione_stimata, contatti(agente_id, drive_folder_url)')
        .eq('id', proprietarioId!)
        .single();
      if (error) throw error;
      return data as unknown as ProprietarioDetail;
    },
    enabled: !!proprietarioId,
  });

  // Serializzato dell'ultimo stato realmente salvato: usato dall'autosave per
  // evitare di ri-scrivere quando il form viene reidratato dal server (setForm
  // qui sotto crea un nuovo oggetto anche se il contenuto è identico).
  const lastSavedRef = useRef<string | null>(null);

  useEffect(() => {
    if (proprietario) {
      const nextForm = {
        nome: proprietario.nome ?? '',
        cognome: proprietario.cognome ?? '',
        email: proprietario.email ?? '',
        telefono: proprietario.telefono ?? '',
        professione: proprietario.professione ?? '',
        note_interne: proprietario.note_interne ?? '',
        via_immobile: proprietario.via_immobile ?? '',
        citta_immobile: proprietario.citta_immobile ?? '',
        tipologia_immobile: proprietario.tipologia_immobile ?? '',
        zona_venditore: proprietario.zona_venditore ?? '',
        motivazione_vendita: proprietario.motivazione_vendita ?? '',
        scadenza_esclusiva: proprietario.scadenza_esclusiva ?? '',
        valutazione_stimata: proprietario.valutazione_stimata != null ? String(proprietario.valutazione_stimata) : '',
      };
      setForm(nextForm);
      lastSavedRef.current = JSON.stringify(nextForm);
      setAgenteId(proprietario.contatti?.agente_id ?? '');
      setDriveUrl(proprietario.contatti?.drive_folder_url ?? '');
    }
  }, [proprietario]);

  useEffect(() => {
    if (!proprietarioId) {
      setTab('anagrafica');
      setScadenzaOpen(false);
      setScadenzaTesto('');
      setScadenzaData('');
    }
  }, [proprietarioId]);

  useEffect(() => {
    supabase
      .from('profili_agenti')
      .select('id, nome_completo')
      .in('ruolo', ['Admin', 'Agente'])
      .then(({ data, error }) => {
        if (!error) setAgenti((data ?? []) as AgenteOption[]);
      });
  }, []);

  const invalidateDetail = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['proprietario-scheda', proprietarioId] });
    queryClient.invalidateQueries({ queryKey: ['proprietari-pipeline'] });
  }, [queryClient, proprietarioId]);

  const buildPayload = useCallback(() => {
    const valStimataNum = form.valutazione_stimata.trim() ? Number(form.valutazione_stimata) : null;
    return {
      nome: form.nome.trim(),
      cognome: form.cognome.trim() || null,
      email: form.email.trim() || null,
      telefono: form.telefono.trim() || null,
      professione: form.professione.trim() || null,
      note_interne: form.note_interne.trim() || null,
      via_immobile: form.via_immobile.trim() || null,
      citta_immobile: form.citta_immobile.trim() || null,
      tipologia_immobile: form.tipologia_immobile.trim() || null,
      zona_venditore: form.zona_venditore.trim() || null,
      motivazione_vendita: form.motivazione_vendita.trim() || null,
      scadenza_esclusiva: form.scadenza_esclusiva || null,
      valutazione_stimata: Number.isFinite(valStimataNum!) ? valStimataNum : null,
    };
  }, [form]);

  const salvaAnagrafica = useMutation({
    mutationFn: async () => {
      if (!proprietarioId) return;
      const { error } = await supabase
        .from('proprietari')
        .update(buildPayload())
        .eq('id', proprietarioId);
      if (error) throw error;
      lastSavedRef.current = JSON.stringify(form);
    },
    onSuccess: () => { showSuccess('Salvato.'); invalidateDetail(); },
    onError: () => showError('Salvataggio non riuscito.'),
  });

  // Autosave debounced: quando l'utente edita un campo, aspetta 800ms di
  // inattività e persiste in silenzio (senza toast). Il tasto "Salva" resta
  // come feedback esplicito ma non è più necessario. Salta se il form è
  // uguale all'ultimo stato salvato (evita loop dopo il refetch di react-query
  // che sostituirebbe il ref) e se il nome (required) è vuoto.
  useEffect(() => {
    if (!proprietarioId || !form.nome.trim()) return;
    const serialized = JSON.stringify(form);
    if (serialized === lastSavedRef.current) return;
    const timer = setTimeout(async () => {
      const { error } = await supabase
        .from('proprietari')
        .update(buildPayload())
        .eq('id', proprietarioId);
      if (!error) {
        lastSavedRef.current = serialized;
        invalidateDetail();
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [form, proprietarioId, buildPayload, invalidateDetail]);

  const toggleCaldo = useMutation({
    mutationFn: async () => {
      if (!proprietarioId || !proprietario) return;
      const { error } = await supabase
        .from('proprietari')
        .update({ caldo: !proprietario.caldo })
        .eq('id', proprietarioId);
      if (error) throw error;
    },
    onSuccess: invalidateDetail,
    onError: () => showError('Impossibile aggiornare il flag.'),
  });

  const salvaAgente = useMutation({
    mutationFn: async (nuovoAgenteId: string) => {
      if (!proprietarioId) return;
      const { error } = await supabase
        .from('contatti')
        .update({ agente_id: nuovoAgenteId || null })
        .eq('id', proprietarioId);
      if (error) throw error;
    },
    onSuccess: () => { showSuccess('Agente abbinato aggiornato.'); invalidateDetail(); },
    onError: () => showError('Impossibile aggiornare l\'agente.'),
  });

  const salvaDriveUrl = useMutation({
    mutationFn: async () => {
      if (!proprietarioId) return;
      const { error } = await supabase
        .from('contatti')
        .update({ drive_folder_url: driveUrl.trim() || null })
        .eq('id', proprietarioId);
      if (error) throw error;
    },
    onSuccess: () => { showSuccess('Link cartella aggiornato.'); invalidateDetail(); },
    onError: () => showError('Salvataggio non riuscito.'),
  });

  const creaScadenza = useMutation({
    mutationFn: async () => {
      if (!proprietarioId || !scadenzaTesto.trim() || !scadenzaData) return;
      const dataLabel = format(parseISO(scadenzaData), "d MMMM yyyy", { locale: it });
      const { error: taskError } = await supabase.from('tasks').insert({
        contatto_id: proprietarioId,
        agente_id: agenteId || (await supabase.auth.getUser()).data.user?.id,
        data: scadenzaData,
        titolo: scadenzaTesto.trim(),
        stato: 'Da fare',
        origine: 'contatti',
      });
      if (taskError) throw taskError;

      const { error: noteError } = await supabase.from('lead_notes').insert({
        contatto_id: proprietarioId,
        testo: `Hai scritto "${scadenzaTesto.trim()}" per il ${dataLabel}`,
        autore: 'Agente',
      });
      if (noteError) throw noteError;
    },
    onSuccess: () => {
      showSuccess('Scadenza impostata: task e nota creati.');
      setScadenzaOpen(false);
      setScadenzaTesto('');
      setScadenzaData('');
      queryClient.invalidateQueries({ queryKey: ['proprietario-note', proprietarioId] });
      queryClient.invalidateQueries({ queryKey: ['proprietario-task', proprietarioId] });
    },
    onError: () => showError('Impossibile impostare la scadenza.'),
  });

  const { data: valutazioni } = useQuery<ValutazioneRow[]>({
    queryKey: ['proprietario-valutazioni', proprietarioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('valutazioni')
        .select('id, indirizzo, stato, stima_min, stima_max, created_at, slug')
        .eq('proprietario_id', proprietarioId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!proprietarioId && tab === 'valutazioni',
  });

  const { data: tasks } = useQuery<TaskRow[]>({
    queryKey: ['proprietario-task', proprietarioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, titolo, nota, data, stato')
        .eq('contatto_id', proprietarioId!)
        .eq('is_deleted', false)
        .order('data', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!proprietarioId && tab === 'task',
  });

  const { data: note } = useQuery<NoteRow[]>({
    queryKey: ['proprietario-note', proprietarioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_notes')
        .select('id, testo, autore, created_at')
        .eq('contatto_id', proprietarioId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!proprietarioId && tab === 'note',
  });

  const { data: eventi } = useQuery<EventoRow[]>({
    queryKey: ['proprietario-eventi', proprietarioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appuntamenti')
        .select('id, tipologia, data, ora_inizio, ora_fine, note, indirizzo_appuntamento')
        .eq('contatto_id', proprietarioId!)
        .order('data', { ascending: false })
        .order('ora_inizio', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!proprietarioId && tab === 'eventi',
  });

  const aggiungiNota = useMutation({
    mutationFn: async () => {
      if (!proprietarioId || !newNoteText.trim()) return;
      const { error } = await supabase.from('lead_notes').insert({
        contatto_id: proprietarioId,
        testo: newNoteText.trim(),
        autore: 'Agente',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewNoteText('');
      queryClient.invalidateQueries({ queryKey: ['proprietario-note', proprietarioId] });
    },
    onError: () => showError('Impossibile salvare la nota.'),
  });

  return (
    <Sheet open={!!proprietarioId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[560px] overflow-y-auto">
        {isLoading || !proprietario ? (
          <p className="text-sm text-gray-400 italic mt-6">Caricamento...</p>
        ) : (
          <>
            <SheetHeader className="text-left">
              <SheetTitle className="text-xl font-extrabold flex items-center gap-2">
                {proprietario.nome} {proprietario.cognome}
                {proprietario.caldo && (
                  <Badge className="bg-orange-100 text-orange-600 hover:bg-orange-100 font-semibold gap-1">
                    <Flame size={12} /> Caldo
                  </Badge>
                )}
              </SheetTitle>
              <SheetDescription className="font-medium">
                {[proprietario.telefono, proprietario.email].filter(Boolean).join(' · ') || 'Proprietario'}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <Button
                type="button"
                size="sm"
                variant={proprietario.caldo ? 'outline' : 'default'}
                onClick={() => toggleCaldo.mutate()}
                disabled={toggleCaldo.isPending}
                className={cn(
                  'rounded-xl font-bold h-8 text-xs',
                  !proprietario.caldo && 'bg-orange-500 hover:bg-orange-600 text-white'
                )}
              >
                <Flame size={13} className="mr-1.5" />
                {proprietario.caldo ? 'Segna come non caldo' : 'Diventa caldo'}
              </Button>

              <Popover open={scadenzaOpen} onOpenChange={setScadenzaOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" size="sm" variant="outline" className="rounded-xl font-bold h-8 text-xs border-gray-200">
                    <CalendarClock size={13} className="mr-1.5" />
                    Scadenza
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 rounded-2xl space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-gray-500">Testo</Label>
                    <Textarea
                      value={scadenzaTesto}
                      onChange={(e) => setScadenzaTesto(e.target.value)}
                      className="rounded-xl min-h-[3rem] text-sm"
                      placeholder="Es. Richiamare per rinnovo incarico"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-gray-500">Data</Label>
                    <Input
                      type="date"
                      value={scadenzaData}
                      onChange={(e) => setScadenzaData(e.target.value)}
                      className="rounded-xl"
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!scadenzaTesto.trim() || !scadenzaData || creaScadenza.isPending}
                    onClick={() => creaScadenza.mutate()}
                    className="w-full bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl font-bold"
                  >
                    Imposta scadenza
                  </Button>
                </PopoverContent>
              </Popover>
            </div>

            <Tabs value={tab} onValueChange={setTab} className="mt-6">
              <TabsList className="grid w-full grid-cols-5 rounded-full p-1 bg-muted/50 border border-gray-100">
                <TabsTrigger value="anagrafica" className="rounded-full text-xs font-semibold data-[state=active]:bg-[#94b0ab] data-[state=active]:text-white">Info</TabsTrigger>
                <TabsTrigger value="valutazioni" className="rounded-full text-xs font-semibold data-[state=active]:bg-[#94b0ab] data-[state=active]:text-white">Valut.</TabsTrigger>
                <TabsTrigger value="eventi" className="rounded-full text-xs font-semibold data-[state=active]:bg-[#94b0ab] data-[state=active]:text-white">Eventi</TabsTrigger>
                <TabsTrigger value="task" className="rounded-full text-xs font-semibold data-[state=active]:bg-[#94b0ab] data-[state=active]:text-white">Task</TabsTrigger>
                <TabsTrigger value="note" className="rounded-full text-xs font-semibold data-[state=active]:bg-[#94b0ab] data-[state=active]:text-white">Note</TabsTrigger>
              </TabsList>

              <TabsContent value="anagrafica" className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-gray-500">Nome</Label>
                    <Input value={form.nome} onChange={(e) => setForm(f => ({ ...f, nome: e.target.value }))} className="rounded-xl" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-gray-500">Cognome</Label>
                    <Input value={form.cognome} onChange={(e) => setForm(f => ({ ...f, cognome: e.target.value }))} className="rounded-xl" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-gray-500">Email</Label>
                    <Input type="email" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} className="rounded-xl" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-gray-500">Telefono</Label>
                    <Input value={form.telefono} onChange={(e) => setForm(f => ({ ...f, telefono: e.target.value }))} className="rounded-xl" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-gray-500">Professione</Label>
                  <Input value={form.professione} onChange={(e) => setForm(f => ({ ...f, professione: e.target.value }))} className="rounded-xl" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-gray-500">Agente abbinato</Label>
                  <Select value={agenteId} onValueChange={(v) => { setAgenteId(v); salvaAgente.mutate(v); }}>
                    <SelectTrigger className="rounded-xl"><SelectValue placeholder="Nessuno" /></SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {agenti.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.nome_completo ?? 'Agente'}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-gray-500">Note interne</Label>
                  <Textarea value={form.note_interne} onChange={(e) => setForm(f => ({ ...f, note_interne: e.target.value }))} className="rounded-xl min-h-[5rem]" />
                </div>

                <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-4 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400">
                    Info immobile da vendere
                  </h4>
                  <p className="text-xs text-gray-400">
                    Puoi già registrare i dati dell'immobile appena prendi il contatto, anche prima di attivare la pratica.
                  </p>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-gray-500">Via / Indirizzo</Label>
                    <Input value={form.via_immobile} onChange={(e) => setForm(f => ({ ...f, via_immobile: e.target.value }))} className="rounded-xl" placeholder="Es. Via Roma 10" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-gray-500">Città</Label>
                      <Input value={form.citta_immobile} onChange={(e) => setForm(f => ({ ...f, citta_immobile: e.target.value }))} className="rounded-xl" placeholder="Es. Bergamo" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-gray-500">Tipologia</Label>
                      <Select value={form.tipologia_immobile} onValueChange={(v) => setForm(f => ({ ...f, tipologia_immobile: v }))}>
                        <SelectTrigger className="rounded-xl"><SelectValue placeholder="Seleziona..." /></SelectTrigger>
                        <SelectContent className="rounded-xl">
                          {TIPOLOGIE_IMMOBILE.map((t) => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-gray-500">Motivazione vendita</Label>
                    <Textarea value={form.motivazione_vendita} onChange={(e) => setForm(f => ({ ...f, motivazione_vendita: e.target.value }))} className="rounded-xl min-h-[3rem]" placeholder="Es. Trasferimento lavoro" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-gray-500">Scadenza esclusiva</Label>
                      <Input type="date" value={form.scadenza_esclusiva} onChange={(e) => setForm(f => ({ ...f, scadenza_esclusiva: e.target.value }))} className="rounded-xl" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-gray-500">Valutazione stimata (€)</Label>
                      <Input type="number" inputMode="numeric" value={form.valutazione_stimata} onChange={(e) => setForm(f => ({ ...f, valutazione_stimata: e.target.value }))} className="rounded-xl" placeholder="Es. 250000" />
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-4 space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
                    <FileText size={12} /> Documenti
                  </h4>
                  <p className="text-xs text-gray-400">Link alla cartella Drive condivisa per questo contatto.</p>
                  <div className="flex items-center gap-2">
                    <Input
                      value={driveUrl}
                      onChange={(e) => setDriveUrl(e.target.value)}
                      placeholder="https://drive.google.com/..."
                      className="rounded-xl h-9 text-sm"
                    />
                    <Button type="button" size="sm" variant="outline" onClick={() => salvaDriveUrl.mutate()} disabled={salvaDriveUrl.isPending} className="rounded-xl h-9 shrink-0">
                      Salva
                    </Button>
                  </div>
                  {proprietario.contatti?.drive_folder_url && (
                    <a
                      href={proprietario.contatti.drive_folder_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#94b0ab] hover:text-[#7a948f]"
                    >
                      <ExternalLink size={12} /> Apri cartella
                    </a>
                  )}
                </div>

                <Button
                  type="button"
                  onClick={() => salvaAnagrafica.mutate()}
                  disabled={salvaAnagrafica.isPending || !form.nome.trim()}
                  className="w-full bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl font-bold h-11"
                >
                  Salva
                </Button>
              </TabsContent>

              <TabsContent value="valutazioni" className="mt-4 space-y-3">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setWizardOpen(true)}
                  className="rounded-xl font-bold text-xs border-gray-200"
                >
                  <Calculator size={13} className="mr-1.5" />
                  Nuova valutazione
                </Button>
                {(valutazioni ?? []).length === 0 ? (
                  <p className="text-sm text-gray-300 italic">Nessuna valutazione per questo proprietario.</p>
                ) : (
                  <div className="space-y-2">
                    {valutazioni!.map((v) => (
                      <div key={v.id} className="rounded-xl border border-gray-100 px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-gray-700 truncate">{v.indirizzo}</span>
                          <Badge variant="secondary" className="text-[0.65rem] font-semibold shrink-0">{v.stato}</Badge>
                        </div>
                        {(v.stima_min || v.stima_max) && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {formatMoney(v.stima_min)} – {formatMoney(v.stima_max)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="eventi" className="mt-4 space-y-3">
                {(eventi ?? []).length === 0 ? (
                  <p className="text-sm text-gray-300 italic">Nessun appuntamento collegato.</p>
                ) : (
                  <div className="space-y-2">
                    {eventi!.map((e) => (
                      <div key={e.id} className="rounded-xl border border-gray-100 px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          <span className="text-sm font-semibold text-gray-700 truncate">{e.tipologia}</span>
                          <span className="text-[10px] font-bold uppercase tracking-widest text-[#94b0ab] shrink-0">
                            {format(parseISO(e.data), 'd MMM yyyy', { locale: it })}
                            {e.ora_inizio && ` · ${e.ora_inizio.slice(0, 5)}`}
                          </span>
                        </div>
                        {(e.indirizzo_appuntamento || e.note) && (
                          <p className="text-xs text-gray-400 mt-0.5 truncate">
                            {e.indirizzo_appuntamento ?? e.note}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="task" className="mt-4 space-y-3">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setTaskModalOpen(true)}
                  className="rounded-xl font-bold text-xs border-gray-200"
                >
                  <Plus size={13} className="mr-1.5" />
                  Nuovo task
                </Button>
                {(tasks ?? []).length === 0 ? (
                  <p className="text-sm text-gray-300 italic">Nessun task collegato.</p>
                ) : (
                  <div className="space-y-2">
                    {tasks!.map((t) => (
                      <div key={t.id} className="rounded-xl border border-gray-100 px-3 py-2.5 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-700 truncate">{t.titolo || t.nota || 'Task'}</p>
                          <p className="text-xs text-gray-400">{format(parseISO(t.data), 'd MMM yyyy', { locale: it })}</p>
                        </div>
                        <Badge variant="secondary" className="text-[0.65rem] font-semibold shrink-0">{t.stato}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="note" className="mt-4 space-y-3">
                <div className="flex items-start gap-2">
                  <Textarea
                    value={newNoteText}
                    onChange={(e) => setNewNoteText(e.target.value)}
                    placeholder="Scrivi una nota..."
                    className="rounded-xl min-h-[3rem] text-sm"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => aggiungiNota.mutate()}
                    disabled={!newNoteText.trim() || aggiungiNota.isPending}
                    className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl shrink-0"
                  >
                    <StickyNote size={14} />
                  </Button>
                </div>
                {(note ?? []).length === 0 ? (
                  <p className="text-sm text-gray-300 italic">Nessuna nota.</p>
                ) : (
                  <div className="space-y-2">
                    {note!.map((n) => (
                      <div key={n.id} className="rounded-xl border border-gray-100 px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs font-bold text-[#94b0ab]">{n.autore}</span>
                          <span className="text-[0.65rem] text-gray-300">{format(parseISO(n.created_at), 'd MMM yyyy, HH:mm', { locale: it })}</span>
                        </div>
                        <p className="text-sm text-gray-600 whitespace-pre-wrap">{n.testo}</p>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>

            <TaskModal
              open={taskModalOpen}
              onClose={() => setTaskModalOpen(false)}
              onSaved={() => {
                setTaskModalOpen(false);
                queryClient.invalidateQueries({ queryKey: ['proprietario-task', proprietarioId] });
              }}
              defaultContattoId={proprietarioId ?? undefined}
              defaultContattoName={proprietario ? `${proprietario.nome} ${proprietario.cognome ?? ''}`.trim() : undefined}
            />

            <ValuationWizard
              open={wizardOpen}
              onClose={() => setWizardOpen(false)}
              onSaved={() => {
                queryClient.invalidateQueries({ queryKey: ['proprietario-valutazioni', proprietarioId] });
              }}
              initialProprietarioId={proprietarioId ?? undefined}
              initialProprietarioNome={proprietario ? `${proprietario.nome} ${proprietario.cognome ?? ''}`.trim() : undefined}
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default ProprietarioSchedaSheet;
