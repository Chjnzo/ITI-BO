"use client";

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Check, ChevronLeft, ChevronRight, Minus, Plus,
  Home, Settings, Star, Euro, Calculator, X, TrendingUp,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { showError, showSuccess } from '@/utils/toast';
import { cn } from '@/lib/utils';
import { Combobox, type ComboboxItem } from '@/components/ui/combobox';

// ── Constants ─────────────────────────────────────────────────────────────────

const TIPOLOGIE = ['Monolocale', 'Bilocale', 'Trilocale', 'Quadrilocale', 'Villa', 'Attico'];
const STATI_CONSERVATIVI = ['Da ristrutturare', 'Discreto', 'Buono', 'Ottimo', 'Nuova Costruzione'];
const CLASSI_ENERGETICHE = ['A4', 'A3', 'A2', 'A1', 'B', 'C', 'D', 'E', 'F', 'G'];
const TIPI_RISCALDAMENTO = ['Autonomo', 'Centralizzato', 'Teleriscaldamento', 'Assente'];

const COMFORT_OPTIONS = [
  { key: 'ha_box',        label: 'Box auto' },
  { key: 'ha_posto_auto', label: 'Posto auto' },
  { key: 'ha_cantina',    label: 'Cantina' },
  { key: 'ha_giardino',   label: 'Giardino' },
  { key: 'ascensore',     label: 'Ascensore' },
] as const;

const STEP_LABELS = ['Lead', 'Immobile', 'Comfort', 'Stima & AI', 'Mercato'];
const TOTAL_STEPS = 5;

const LOADING_MESSAGES = [
  "L'intelligenza artificiale sta analizzando i dati OMI e i comparabili di zona...",
  'Geocodifica indirizzo in corso...',
  'Elaborazione dei dati tecnici...',
  'Generazione stima professionale...',
  'Redazione del razionale...',
];

// ── Types ─────────────────────────────────────────────────────────────────────

type ComfortKey = typeof COMFORT_OPTIONS[number]['key'];

interface ComparabileAttivo {
  url: string;
  titolo: string;
  prezzo: string;
}

const emptyComparabileAttivo = (): ComparabileAttivo => ({ url: '', titolo: '', prezzo: '' });

// ── Numeric Stepper ───────────────────────────────────────────────────────────

const NumericStepper = ({
  value,
  onChange,
  min = 0,
  max = 30,
}: {
  value: string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
}) => {
  const num = value === '' ? min : parseInt(value, 10);
  const decrement = () => { if (num > min) onChange(String(num - 1)); };
  const increment = () => { if (num < max) onChange(String(num + 1)); };
  return (
    <div className="flex items-center h-14 rounded-2xl border border-gray-100 bg-white overflow-hidden">
      <button
        type="button"
        onClick={decrement}
        disabled={num <= min}
        className="w-14 h-full flex items-center justify-center text-gray-400 hover:bg-gray-50 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors border-r border-gray-100"
      >
        <Minus size={14} />
      </button>
      <span className="flex-1 text-center text-base font-bold text-gray-800 tabular-nums select-none">
        {value === '' ? '—' : num}
      </span>
      <button
        type="button"
        onClick={increment}
        disabled={num >= max}
        className="w-14 h-full flex items-center justify-center text-gray-400 hover:bg-gray-50 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors border-l border-gray-100"
      >
        <Plus size={14} />
      </button>
    </div>
  );
};

// ── Component ─────────────────────────────────────────────────────────────────

interface ValuationWizardProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initialLeadId?: string;
}

const ValuationWizard = ({ open, onClose, onSaved, initialLeadId }: ValuationWizardProps) => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiGenerated, setAiGenerated] = useState(false);

  // Persisted draft after AI generation
  const [valutazioneId, setValutazioneId] = useState<string | null>(null);
  const [valutazioneSlug, setValutazioneSlug] = useState<string | null>(null);

  // Step 1 — Lead
  const [leadId, setLeadId] = useState('');
  const [leadItems, setLeadItems] = useState<ComboboxItem[]>([]);
  const [agenteId, setAgenteId] = useState('');

  // Step 2 — Dati Immobile
  const [indirizzo, setIndirizzo] = useState('');
  const [citta, setCitta] = useState('Ranica');
  const [superficieMq, setSuperficieMq] = useState('');
  const [tipologia, setTipologia] = useState('');
  const [statoConservativo, setStatoConservativo] = useState('');
  const [numLocali, setNumLocali] = useState('');
  const [numCamere, setNumCamere] = useState('');
  const [piano, setPiano] = useState('');
  const [numBagni, setNumBagni] = useState('');
  const [annoCostruzione, setAnnoCostruzione] = useState('');
  const [classeEnergetica, setClasseEnergetica] = useState('');
  const [tipoRiscaldamento, setTipoRiscaldamento] = useState('');

  // Step 3 — Comfort
  const [comfort, setComfort] = useState<Record<ComfortKey, boolean>>({
    ha_box: false,
    ha_posto_auto: false,
    ha_cantina: false,
    ha_giardino: false,
    ascensore: false,
  });
  const [noteTecniche, setNoteTecniche] = useState('');

  // Step 4 — Stima & AI
  const [stimaMin, setStimaMin] = useState('');
  const [stimaMax, setStimaMax] = useState('');
  const [motivazioneAi, setMotivazioneAi] = useState('');
  const [loadingMsg, setLoadingMsg] = useState('');
  const [showPriceOverride, setShowPriceOverride] = useState(false);

  // Step 5 — Mercato
  const [comparabiliAttivi, setComparabiliAttivi] = useState<ComparabileAttivo[]>([emptyComparabileAttivo()]);

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setLeadId('');
    setLeadItems([]);
    setAiGenerated(false);
    setValutazioneId(null);
    setValutazioneSlug(null);
    setIndirizzo('');
    setCitta('Ranica');
    setSuperficieMq('');
    setTipologia('');
    setStatoConservativo('');
    setNumLocali('');
    setNumCamere('');
    setPiano('');
    setNumBagni('');
    setAnnoCostruzione('');
    setClasseEnergetica('');
    setTipoRiscaldamento('');
    setComfort({ ha_box: false, ha_posto_auto: false, ha_cantina: false, ha_giardino: false, ascensore: false });
    setNoteTecniche('');
    setStimaMin('');
    setStimaMax('');
    setMotivazioneAi('');
    setLoadingMsg('');
    setShowPriceOverride(false);
    setComparabiliAttivi([emptyComparabileAttivo()]);

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setAgenteId(user.id);
    });

    if (initialLeadId) {
      supabase
        .from('leads')
        .select('id, nome, cognome, telefono')
        .eq('id', initialLeadId)
        .single()
        .then(({ data: row }) => {
          if (row) {
            setLeadId(row.id);
            setLeadItems([{ id: row.id, label: `${row.nome} ${row.cognome}`, sublabel: row.telefono ?? undefined }]);
          }
        });
    }
  }, [open, initialLeadId]);

  const searchLeadsAbortRef = React.useRef<AbortController | null>(null);

  const searchLeads = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) { setLeadItems([]); return; }
    searchLeadsAbortRef.current?.abort();
    const controller = new AbortController();
    searchLeadsAbortRef.current = controller;

    const tokens = trimmed.split(/\s+/).map(t => t.replace(/[%_\\]/g, '\\$&'));
    let query = supabase.from('leads').select('id, nome, cognome, telefono');
    for (const token of tokens) {
      query = query.or(`nome.ilike.%${token}%,cognome.ilike.%${token}%`);
    }
    const { data: rows } = await query.limit(8);

    if (controller.signal.aborted) return;
    setLeadItems((rows ?? []).map(r => ({
      id: r.id,
      label: `${r.nome} ${r.cognome}`,
      sublabel: r.telefono ?? undefined,
    })));
  };

  const toggleComfort = (key: ComfortKey) => {
    setComfort(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleNextFromStep2 = () => {
    if (!indirizzo.trim()) { showError('Indirizzo obbligatorio'); return; }
    if (!superficieMq || Number(superficieMq) <= 0) { showError('Superficie obbligatoria'); return; }
    setStep(3);
  };

  const generateSlug = (addr: string): string => {
    const base = addr
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 40);
    const uid = crypto.randomUUID().split('-')[0];
    return `${base}-${uid}`;
  };

  const getComparabiliAttiviPayload = () => {
    return comparabiliAttivi
      .filter(c => c.url.trim())
      .map(c => ({
        url: c.url.trim(),
        ...(c.titolo.trim() ? { titolo: c.titolo.trim() } : {}),
        ...(c.prezzo.trim() && !isNaN(Number(c.prezzo)) ? { prezzo: Number(c.prezzo) } : {}),
      }));
  };

  const buildDraftPayload = () => ({
    lead_id: leadId || null,
    agente_id: agenteId || null,
    indirizzo: indirizzo.trim(),
    citta: citta.trim() || 'Ranica',
    tipologia: tipologia || null,
    superficie_mq: Number(superficieMq),
    stato_conservativo: statoConservativo || null,
    num_locali: numLocali ? Number(numLocali) : null,
    num_camere: numCamere ? Number(numCamere) : null,
    piano: piano || null,
    num_bagni: numBagni ? Number(numBagni) : null,
    anno_costruzione: annoCostruzione ? Number(annoCostruzione) : null,
    classe_energetica: classeEnergetica || null,
    tipo_riscaldamento: tipoRiscaldamento || null,
    ha_box: comfort.ha_box,
    ha_posto_auto: comfort.ha_posto_auto,
    ha_cantina: comfort.ha_cantina,
    ha_giardino: comfort.ha_giardino,
    ascensore: comfort.ascensore,
    note_tecniche: noteTecniche.trim() || null,
    comparabili_attivi: getComparabiliAttiviPayload().length > 0 ? getComparabiliAttiviPayload() : null,
  });

  // ── Comparabili Attivi helpers ──────────────────────────────────────────────

  const addComparabileAttivo = () => {
    if (comparabiliAttivi.length >= 3) return;
    setComparabiliAttivi(prev => [...prev, emptyComparabileAttivo()]);
  };

  const removeComparabileAttivo = (idx: number) => {
    setComparabiliAttivi(prev => prev.filter((_, i) => i !== idx));
  };

  const updateComparabileAttivo = (idx: number, field: keyof ComparabileAttivo, value: string) => {
    setComparabiliAttivi(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  };

  // ── AI Generation ──────────────────────────────────────────────────────────

  const handleGenerateAI = async () => {
    setIsGenerating(true);
    setLoadingMsg(LOADING_MESSAGES[0]);
    let msgIdx = 0;
    const interval = setInterval(() => {
      msgIdx = (msgIdx + 1) % LOADING_MESSAGES.length;
      setLoadingMsg(LOADING_MESSAGES[msgIdx]);
    }, 2000);

    try {
      let recordId = valutazioneId;
      let recordSlug = valutazioneSlug;

      if (!recordId) {
        const slug = generateSlug(indirizzo);
        const { data: inserted, error: insertError } = await supabase
          .from('valutazioni')
          .insert([{ ...buildDraftPayload(), stato: 'Bozza', slug }])
          .select('id, slug')
          .single();

        if (insertError) throw new Error('Errore creazione bozza: ' + insertError.message);
        recordId = inserted!.id;
        recordSlug = inserted!.slug;
        setValutazioneId(recordId);
        setValutazioneSlug(recordSlug);
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Sessione scaduta. Effettua nuovamente il login e riprova.');
      }
      const { error: tokenError } = await supabase.from('profili_agenti').select('id').limit(1);
      if (tokenError?.message?.includes('JWT') || tokenError?.code === 'PGRST301') {
        throw new Error('Token scaduto. Effettua nuovamente il login e riprova.');
      }

      const { data, error } = await supabase.functions.invoke('generate-evaluation', {
        body: {
          valutazione_id: recordId,
          indirizzo: indirizzo.trim(),
          citta: citta.trim() || 'Ranica',
          superficie_mq: Number(superficieMq),
          tipologia: tipologia || undefined,
          stato_conservativo: statoConservativo || undefined,
          piano: piano || null,
          ascensore: comfort.ascensore,
          ha_giardino: comfort.ha_giardino,
          ha_box: comfort.ha_box,
          ha_posto_auto: comfort.ha_posto_auto,
          ha_cantina: comfort.ha_cantina,
          num_locali: numLocali ? Number(numLocali) : null,
          num_camere: numCamere ? Number(numCamere) : null,
          num_bagni: numBagni ? Number(numBagni) : null,
          anno_costruzione: annoCostruzione ? Number(annoCostruzione) : null,
          classe_energetica: classeEnergetica || null,
          tipo_riscaldamento: tipoRiscaldamento || null,
          comparabili_attivi: getComparabiliAttiviPayload(),
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? 'Errore generazione AI');

      const v = data.valutazione;
      if (v?.stima_min != null) setStimaMin(String(v.stima_min));
      if (v?.stima_max != null) setStimaMax(String(v.stima_max));
      if (v?.motivazione_ai) setMotivazioneAi(v.motivazione_ai);
      setAiGenerated(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Errore generazione AI';
      showError(msg);
    } finally {
      clearInterval(interval);
      setLoadingMsg('');
      setIsGenerating(false);
    }
  };

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setIsSaving(true);
    try {
      let slug = valutazioneSlug;

      if (!valutazioneId) {
        const newSlug = generateSlug(indirizzo);
        const { data: inserted, error } = await supabase
          .from('valutazioni')
          .insert([{
            ...buildDraftPayload(),
            stima_min: stimaMin ? Number(stimaMin) : null,
            stima_max: stimaMax ? Number(stimaMax) : null,
            motivazione_ai: motivazioneAi.trim() || null,
            stato: 'Bozza',
            slug: newSlug,
          }])
          .select('slug')
          .single();

        if (error) throw new Error(error.message);
        slug = inserted?.slug ?? null;
      } else {
        const updates: Record<string, unknown> = {
          comparabili_attivi: getComparabiliAttiviPayload().length > 0 ? getComparabiliAttiviPayload() : null,
        };
        if (showPriceOverride) {
          updates.stima_min = stimaMin ? Number(stimaMin) : undefined;
          updates.stima_max = stimaMax ? Number(stimaMax) : undefined;
          updates.motivazione_ai = motivazioneAi.trim() || undefined;
        }
        await supabase.from('valutazioni').update(updates).eq('id', valutazioneId);
      }

      // CRM automation — fire and forget
      if (leadId) {
        supabase.from('leads').update({ stato_venditore: 'Valutazione fatta' }).eq('id', leadId);
        supabase.from('lead_notes').insert({
          lead_id: leadId,
          testo: `Valutazione AI completata — ${indirizzo.trim()} (${superficieMq} m²). Stima: €${stimaMin}–€${stimaMax}.`,
        });
      }

      showSuccess('Valutazione salvata');
      onSaved();
      onClose();
      if (slug) navigate(`/report/${slug}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Errore salvataggio';
      showError('Errore salvataggio: ' + msg);
    } finally {
      setIsSaving(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] flex flex-col rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden"
        aria-describedby={undefined}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >

        {/* Header */}
        <DialogHeader className="px-10 py-7 border-b border-gray-100 shrink-0 bg-white">
          <div className="flex justify-between items-center">
            <div>
              <DialogTitle className="text-3xl font-bold text-[#1a1a1a]">
                Nuova Valutazione
              </DialogTitle>
              <p className="text-sm text-gray-500 mt-1">
                Stai compilando lo step {step} di {TOTAL_STEPS} — {STEP_LABELS[step - 1]}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((s) => (
                <button
                  key={s}
                  onClick={() => s <= step && setStep(s)}
                  className={cn(
                    "h-2 rounded-full transition-all duration-300",
                    step === s
                      ? "w-12 bg-[#94b0ab]"
                      : s < step
                      ? "w-6 bg-[#94b0ab]/40 cursor-pointer hover:bg-[#94b0ab]/60"
                      : "w-6 bg-gray-100 cursor-default"
                  )}
                />
              ))}
            </div>
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-10 py-7 space-y-7">

          {/* ── STEP 1: Lead ─────────────────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-7 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="space-y-1">
                <h2 className="text-xl font-bold flex items-center gap-2 text-[#1a1a1a]">
                  <Home size={22} className="text-[#94b0ab]" /> Lead Collegato
                </h2>
                <p className="text-sm text-gray-400">Associa la valutazione a un contatto esistente (opzionale).</p>
              </div>
              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Lead</Label>
                <Combobox
                  items={leadItems}
                  value={leadId}
                  onSelect={setLeadId}
                  onSearch={searchLeads}
                  placeholder="Cerca lead per nome... (opzionale)"
                  searchPlaceholder="Nome o cognome..."
                  emptyMessage="Nessun lead trovato."
                  className="rounded-2xl h-14 border-gray-100"
                />
              </div>
              <p className="text-xs text-gray-400 italic">
                Puoi creare una valutazione anche senza associarla a un contatto.
              </p>
            </div>
          )}

          {/* ── STEP 2: Dati Immobile ─────────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-7 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="space-y-1">
                <h2 className="text-xl font-bold flex items-center gap-2 text-[#1a1a1a]">
                  <Settings size={22} className="text-[#94b0ab]" /> Dati dell'Immobile
                </h2>
                <p className="text-sm text-gray-400">Inserisci le caratteristiche tecniche per la stima.</p>
              </div>
              <div className="grid grid-cols-3 gap-5">
                <div className="space-y-3 col-span-3">
                  <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Indirizzo *</Label>
                  <Input
                    value={indirizzo}
                    onChange={e => setIndirizzo(e.target.value)}
                    placeholder="Via Roma 12"
                    className="h-14 rounded-2xl border-gray-100"
                  />
                </div>
                <div className="space-y-3 col-span-2">
                  <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Città</Label>
                  <Input
                    value={citta}
                    onChange={e => setCitta(e.target.value)}
                    placeholder="Ranica"
                    className="h-14 rounded-2xl border-gray-100"
                  />
                </div>
                <div className="space-y-3">
                  <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Superficie m² *</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      min={1}
                      value={superficieMq}
                      onChange={e => { const v = e.target.value; if (v === '' || Number(v) > 0) setSuperficieMq(v); }}
                      onKeyDown={e => ['-', '+', 'e', 'E'].includes(e.key) && e.preventDefault()}
                      onWheel={e => e.currentTarget.blur()}
                      placeholder="80"
                      className="h-14 rounded-2xl border-gray-100"
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Tipologia</Label>
                  <Select value={tipologia} onValueChange={setTipologia}>
                    <SelectTrigger className="h-14 rounded-2xl border-gray-100">
                      <SelectValue placeholder="Seleziona..." />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl">
                      {TIPOLOGIE.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Stato conservativo</Label>
                  <Select value={statoConservativo} onValueChange={setStatoConservativo}>
                    <SelectTrigger className="h-14 rounded-2xl border-gray-100">
                      <SelectValue placeholder="Seleziona..." />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl">
                      {STATI_CONSERVATIVI.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Classe energetica</Label>
                  <Select value={classeEnergetica} onValueChange={setClasseEnergetica}>
                    <SelectTrigger className="h-14 rounded-2xl border-gray-100">
                      <SelectValue placeholder="Seleziona..." />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl">
                      {CLASSI_ENERGETICHE.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">N° locali</Label>
                  <NumericStepper value={numLocali} onChange={setNumLocali} min={1} max={10} />
                </div>
                <div className="space-y-3">
                  <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">N° camere</Label>
                  <NumericStepper value={numCamere} onChange={setNumCamere} min={1} max={8} />
                </div>
                <div className="space-y-3">
                  <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Piano</Label>
                  <NumericStepper value={piano} onChange={setPiano} min={0} max={30} />
                </div>
                <div className="space-y-3">
                  <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">N° bagni</Label>
                  <NumericStepper value={numBagni} onChange={setNumBagni} min={1} max={5} />
                </div>
                <div className="space-y-3 col-span-2">
                  <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Riscaldamento</Label>
                  <Select value={tipoRiscaldamento} onValueChange={setTipoRiscaldamento}>
                    <SelectTrigger className="h-14 rounded-2xl border-gray-100">
                      <SelectValue placeholder="Seleziona..." />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl">
                      {TIPI_RISCALDAMENTO.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3 col-span-3">
                  <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Anno costruzione</Label>
                  <Input
                    type="number"
                    value={annoCostruzione}
                    onChange={e => setAnnoCostruzione(e.target.value)}
                    onWheel={e => e.currentTarget.blur()}
                    placeholder="1995"
                    className="h-14 rounded-2xl border-gray-100 max-w-[200px]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 3: Comfort ───────────────────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-7 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="space-y-1">
                <h2 className="text-xl font-bold flex items-center gap-2 text-[#1a1a1a]">
                  <Star size={22} className="text-[#94b0ab]" /> Comfort e Dotazioni
                </h2>
                <p className="text-sm text-gray-400">Seleziona i servizi presenti nell'immobile.</p>
              </div>
              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Dotazioni</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {COMFORT_OPTIONS.map(({ key, label }) => {
                    const isActive = comfort[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleComfort(key)}
                        className={cn(
                          'flex items-center justify-between p-4 rounded-2xl border text-sm font-semibold transition-all text-left',
                          isActive
                            ? 'bg-[#94b0ab]/10 border-[#94b0ab] text-[#94b0ab]'
                            : 'bg-white border-gray-100 text-gray-500 hover:bg-gray-50',
                        )}
                      >
                        {label}
                        {isActive && <Check size={15} />}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Note tecniche</Label>
                <Textarea
                  value={noteTecniche}
                  onChange={e => setNoteTecniche(e.target.value)}
                  placeholder="Dettagli aggiuntivi sull'immobile..."
                  className="rounded-2xl border-gray-100 min-h-[100px] resize-none p-4"
                />
              </div>
            </div>
          )}

          {/* ── STEP 4: Stima & AI ────────────────────────────────────────── */}
          {step === 4 && (
            <div className="space-y-7 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="space-y-1">
                <h2 className="text-xl font-bold flex items-center gap-2 text-[#1a1a1a]">
                  <Calculator size={22} className="text-[#94b0ab]" /> Stima & Analisi
                </h2>
                <p className="text-sm text-gray-400">Genera la stima basata su dati OMI e transazioni reali.</p>
              </div>

              <Button
                type="button"
                onClick={handleGenerateAI}
                disabled={isGenerating}
                className="w-full h-14 rounded-2xl bg-[#94b0ab] hover:bg-[#7a948f] text-white font-bold gap-2 shadow-lg shadow-[#94b0ab]/20"
              >
                <Calculator size={18} />
                {isGenerating ? 'Analisi in corso...' : aiGenerated ? 'Rigenera stima' : 'Genera stima'}
              </Button>

              {isGenerating && loadingMsg && (
                <p className="text-center text-xs text-[#94b0ab] animate-pulse leading-relaxed px-2">
                  {loadingMsg}
                </p>
              )}

              {aiGenerated && (
                <>
                  {(stimaMin || stimaMax) && (
                    <div className="rounded-2xl bg-[#94b0ab]/8 border border-[#94b0ab]/20 px-6 py-5">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Stima suggerita</p>
                      <p className="text-2xl font-black text-[#94b0ab]">
                        {stimaMin ? `€${Number(stimaMin).toLocaleString('it-IT')}` : ''}
                        {stimaMin && stimaMax && <span className="text-gray-300 mx-2">–</span>}
                        {stimaMax ? `€${Number(stimaMax).toLocaleString('it-IT')}` : ''}
                      </p>
                    </div>
                  )}

                  <div className="space-y-3">
                    <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Analisi e motivazione</Label>
                    <Textarea
                      value={motivazioneAi}
                      onChange={e => setMotivazioneAi(e.target.value)}
                      placeholder="Il testo dell'analisi apparirà qui..."
                      className="rounded-2xl border-gray-100 min-h-[140px] resize-none p-4"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowPriceOverride(p => !p)}
                    className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors"
                  >
                    {showPriceOverride ? 'Nascondi modifica stima' : 'Modifica stima manualmente'}
                  </button>
                  {showPriceOverride && (
                    <div className="grid grid-cols-2 gap-5">
                      <div className="space-y-3">
                        <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Stima minima €</Label>
                        <div className="relative">
                          <Euro className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                          <Input
                            type="number"
                            value={stimaMin}
                            onChange={e => setStimaMin(e.target.value)}
                            onWheel={e => e.currentTarget.blur()}
                            placeholder="200000"
                            className="h-14 rounded-2xl border-gray-100 pl-12"
                          />
                        </div>
                      </div>
                      <div className="space-y-3">
                        <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Stima massima €</Label>
                        <div className="relative">
                          <Euro className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                          <Input
                            type="number"
                            value={stimaMax}
                            onChange={e => setStimaMax(e.target.value)}
                            onWheel={e => e.currentTarget.blur()}
                            placeholder="250000"
                            className="h-14 rounded-2xl border-gray-100 pl-12"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {!aiGenerated && !isGenerating && (
                <p className="text-xs text-gray-400 text-center italic">
                  Clicca "Genera stima" per ottenere la valutazione basata su dati OMI e transazioni reali nella zona.
                </p>
              )}
            </div>
          )}

          {/* ── STEP 5: Mercato ───────────────────────────────────────────── */}
          {step === 5 && (
            <div className="space-y-7 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="space-y-1">
                <h2 className="text-xl font-bold flex items-center gap-2 text-[#1a1a1a]">
                  <TrendingUp size={22} className="text-[#94b0ab]" /> Analisi di Mercato
                </h2>
                <p className="text-sm text-gray-400">
                  Aggiungi i link di immobili simili attualmente in vendita nella zona (opzionale, max 3).
                </p>
              </div>

              <div className="space-y-4">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">
                  Comparabili attivi sul mercato
                </Label>

                {comparabiliAttivi.map((c, idx) => (
                  <div key={idx} className="rounded-2xl border border-gray-100 bg-[#f9f9f7] p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                        Comparabile {idx + 1}
                      </span>
                      {comparabiliAttivi.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeComparabileAttivo(idx)}
                          className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-colors"
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Input
                        value={c.url}
                        onChange={e => updateComparabileAttivo(idx, 'url', e.target.value)}
                        placeholder="https://www.immobiliare.it/annunci/..."
                        className="h-11 rounded-xl border-gray-200 bg-white text-sm"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          value={c.titolo}
                          onChange={e => updateComparabileAttivo(idx, 'titolo', e.target.value)}
                          placeholder="Titolo (opz.)"
                          className="h-11 rounded-xl border-gray-200 bg-white text-sm"
                        />
                        <div className="relative">
                          <Euro className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" size={14} />
                          <Input
                            type="number"
                            value={c.prezzo}
                            onChange={e => updateComparabileAttivo(idx, 'prezzo', e.target.value)}
                            onWheel={e => e.currentTarget.blur()}
                            placeholder="Prezzo richiesto"
                            className="h-11 rounded-xl border-gray-200 bg-white text-sm pl-9"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {comparabiliAttivi.length < 3 && (
                  <button
                    type="button"
                    onClick={addComparabileAttivo}
                    className="w-full h-11 rounded-2xl border border-dashed border-gray-200 text-sm text-gray-400 font-semibold hover:border-[#94b0ab] hover:text-[#94b0ab] transition-colors flex items-center justify-center gap-2"
                  >
                    <Plus size={14} /> Aggiungi comparabile
                  </button>
                )}
              </div>

              <p className="text-xs text-gray-400 italic leading-relaxed">
                Questi dati vengono passati all'AI per calibrare il posizionamento competitivo dell'immobile e appariranno nel report.
              </p>
            </div>
          )}
        </div>

        {/* ── Footer navigation ──────────────────────────────────────────── */}
        <DialogFooter className="px-10 py-6 border-t border-gray-100 bg-white shrink-0 flex items-center justify-between sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={() => step > 1 ? setStep(s => s - 1) : onClose()}
            disabled={isGenerating}
            className="rounded-2xl h-14 px-8 text-gray-500 font-bold hover:bg-gray-50"
          >
            {step === 1 ? "Annulla" : <><ChevronLeft className="mr-2" size={18} /> Indietro</>}
          </Button>

          <div className="flex gap-3">
            {step < TOTAL_STEPS && (
              <Button
                type="button"
                onClick={() => {
                  if (step === 2) { handleNextFromStep2(); return; }
                  setStep(s => s + 1);
                }}
                className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-2xl h-14 px-10 font-bold shadow-lg shadow-[#94b0ab]/20 gap-1"
              >
                Avanti <ChevronRight size={18} />
              </Button>
            )}

            {step === TOTAL_STEPS && (
              <Button
                type="button"
                onClick={handleSave}
                disabled={isSaving || isGenerating}
                className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-2xl h-14 px-10 font-bold shadow-lg shadow-[#94b0ab]/20"
              >
                {isSaving ? 'Salvataggio...' : 'Salva Valutazione'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ValuationWizard;
