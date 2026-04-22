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
  Check, Sparkles, ChevronLeft, ChevronRight, Minus, Plus,
  Home, Settings, Star, Euro,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { showError, showSuccess } from '@/utils/toast';
import { cn } from '@/lib/utils';
import { Combobox, type ComboboxItem } from '@/components/ui/combobox';

// ── Constants ─────────────────────────────────────────────────────────────────

const TIPOLOGIE = ['Monolocale', 'Bilocale', 'Trilocale', 'Quadrilocale', 'Villa', 'Attico'];
const STATI_CONSERVATIVI = ['Da ristrutturare', 'Discreto', 'Buono', 'Ottimo', 'Nuova Costruzione'];
const CLASSI_ENERGETICHE = ['A4', 'A3', 'A2', 'A1', 'B', 'C', 'D', 'E', 'F', 'G'];

const COMFORT_OPTIONS = [
  { key: 'ha_box',        label: 'Box auto' },
  { key: 'ha_posto_auto', label: 'Posto auto' },
  { key: 'ha_cantina',    label: 'Cantina' },
  { key: 'ha_giardino',   label: 'Giardino' },
  { key: 'ascensore',     label: 'Ascensore' },
] as const;

const STEP_LABELS = ['Lead', 'Immobile', 'Comfort', 'Stima & AI'];

const LOADING_MESSAGES = [
  "L'intelligenza artificiale sta analizzando i dati OMI e i comparabili di zona...",
  'Geocodifica indirizzo in corso...',
  'Elaborazione dei dati tecnici...',
  'Generazione stima professionale...',
  'Redazione del razionale...',
];

// ── Types ─────────────────────────────────────────────────────────────────────

type ComfortKey = typeof COMFORT_OPTIONS[number]['key'];

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
}

const ValuationWizard = ({ open, onClose, onSaved }: ValuationWizardProps) => {
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
  const [piano, setPiano] = useState('');
  const [numBagni, setNumBagni] = useState('');
  const [annoCostruzione, setAnnoCostruzione] = useState('');
  const [classeEnergetica, setClasseEnergetica] = useState('');

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
    setPiano('');
    setNumBagni('');
    setAnnoCostruzione('');
    setClasseEnergetica('');
    setComfort({ ha_box: false, ha_posto_auto: false, ha_cantina: false, ha_giardino: false, ascensore: false });
    setNoteTecniche('');
    setStimaMin('');
    setStimaMax('');
    setMotivazioneAi('');
    setLoadingMsg('');
    setShowPriceOverride(false);

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setAgenteId(user.id);
    });
  }, [open]);

  const searchLeads = async (q: string) => {
    if (!q.trim()) { setLeadItems([]); return; }
    const { data: rows } = await supabase
      .from('leads')
      .select('id, nome, cognome, telefono')
      .or(`nome.ilike.%${q}%,cognome.ilike.%${q}%`)
      .limit(8);
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

  const buildDraftPayload = () => ({
    lead_id: leadId || null,
    agente_id: agenteId || null,
    indirizzo: indirizzo.trim(),
    citta: citta.trim() || 'Ranica',
    tipologia: tipologia || null,
    superficie_mq: Number(superficieMq),
    stato_conservativo: statoConservativo || null,
    num_locali: numLocali ? Number(numLocali) : null,
    piano: piano || null,
    num_bagni: numBagni ? Number(numBagni) : null,
    anno_costruzione: annoCostruzione ? Number(annoCostruzione) : null,
    classe_energetica: classeEnergetica || null,
    ha_box: comfort.ha_box,
    ha_posto_auto: comfort.ha_posto_auto,
    ha_cantina: comfort.ha_cantina,
    ha_giardino: comfort.ha_giardino,
    ascensore: comfort.ascensore,
    note_tecniche: noteTecniche.trim() || null,
  });

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

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) {
        throw new Error('Sessione scaduta. Effettua nuovamente il login e riprova.');
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
          num_bagni: numBagni ? Number(numBagni) : null,
          anno_costruzione: annoCostruzione ? Number(annoCostruzione) : null,
          classe_energetica: classeEnergetica || null,
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
      } else if (showPriceOverride) {
        await supabase
          .from('valutazioni')
          .update({
            stima_min: stimaMin ? Number(stimaMin) : undefined,
            stima_max: stimaMax ? Number(stimaMax) : undefined,
            motivazione_ai: motivazioneAi.trim() || undefined,
          })
          .eq('id', valutazioneId);
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
      <DialogContent className="max-w-2xl rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden" aria-describedby={undefined}>

        {/* Header */}
        <DialogHeader className="px-10 py-7 border-b border-gray-100 shrink-0 bg-white">
          <div className="flex justify-between items-center">
            <div>
              <DialogTitle className="text-3xl font-bold text-[#1a1a1a]">
                Nuova Valutazione
              </DialogTitle>
              <p className="text-sm text-gray-500 mt-1">
                Stai compilando lo step {step} di 4 — {STEP_LABELS[step - 1]}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4].map((s) => (
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
        <div className="px-10 py-7 space-y-7">

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
                  <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Piano</Label>
                  <NumericStepper value={piano} onChange={setPiano} min={0} max={30} />
                </div>
                <div className="space-y-3">
                  <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">N° bagni</Label>
                  <NumericStepper value={numBagni} onChange={setNumBagni} min={1} max={5} />
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
                  <Sparkles size={22} className="text-[#94b0ab]" /> Stima & Intelligenza Artificiale
                </h2>
                <p className="text-sm text-gray-400">Genera la stima con AI basata su dati OMI e transazioni reali.</p>
              </div>

              <Button
                type="button"
                onClick={handleGenerateAI}
                disabled={isGenerating}
                className="w-full h-14 rounded-2xl bg-[#94b0ab] hover:bg-[#7a948f] text-white font-bold gap-2 shadow-lg shadow-[#94b0ab]/20"
              >
                <Sparkles size={18} />
                {isGenerating ? 'Analisi in corso...' : aiGenerated ? 'Rigenera con AI' : 'Genera con AI ✨'}
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
                    <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Motivazione AI</Label>
                    <Textarea
                      value={motivazioneAi}
                      onChange={e => setMotivazioneAi(e.target.value)}
                      placeholder="Il testo generato dall'AI apparirà qui..."
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
                  Clicca "Genera con AI" per ottenere la stima basata su dati OMI e transazioni reali nella zona.
                </p>
              )}
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
            {step < 4 && (
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

            {step === 4 && (
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
