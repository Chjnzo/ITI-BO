"use client";

import React, { useState, useEffect } from 'react';
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
import { Check, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';
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

// ── Types ─────────────────────────────────────────────────────────────────────

type ComfortKey = typeof COMFORT_OPTIONS[number]['key'];

// ── Component ─────────────────────────────────────────────────────────────────

interface ValuationWizardProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const ValuationWizard = ({ open, onClose, onSaved }: ValuationWizardProps) => {
  const [step, setStep] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiGenerated, setAiGenerated] = useState(false);

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
  const [trendPrezzi, setTrendPrezzi] = useState('');
  const [loadingMsg, setLoadingMsg] = useState('');
  const [showPriceOverride, setShowPriceOverride] = useState(false);

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setLeadId('');
    setLeadItems([]);
    setAiGenerated(false);
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
    setTrendPrezzi('');
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

  const LOADING_MESSAGES = [
    'Analisi della zona in corso...',
    'Elaborazione dei dati tecnici...',
    'Generazione stima professionale...',
    'Redazione del razionale...',
  ];

  const handleGenerateAI = async () => {
    setIsGenerating(true);
    setLoadingMsg(LOADING_MESSAGES[0]);
    let msgIdx = 0;
    const interval = setInterval(() => {
      msgIdx = (msgIdx + 1) % LOADING_MESSAGES.length;
      setLoadingMsg(LOADING_MESSAGES[msgIdx]);
    }, 1800);
    try {
      const activeComfort = Object.entries(comfort)
        .filter(([, v]) => v)
        .map(([k]) => COMFORT_OPTIONS.find(c => c.key === k)?.label ?? k);
      const { data, error } = await supabase.functions.invoke('generate-evaluation', {
        body: {
          indirizzo,
          citta,
          metri_quadri: Number(superficieMq),
          tipologia: tipologia || undefined,
          condizioni: statoConservativo || undefined,
          comfort: activeComfort.length > 0 ? activeComfort : undefined,
        },
      });
      if (error) throw error;
      const parts: string[] = [];
      if (data.descrizione_zona) parts.push(data.descrizione_zona);
      if (data.razionale_valutazione) parts.push(data.razionale_valutazione);
      setMotivazioneAi(parts.join('\n\n'));
      if (data.stima_min) setStimaMin(String(data.stima_min));
      if (data.stima_max) setStimaMax(String(data.stima_max));
      if (data.trend_prezzi) setTrendPrezzi(JSON.stringify(data.trend_prezzi));
      setAiGenerated(true);
    } catch {
      showError('Errore durante la generazione AI. Riprova.');
    } finally {
      clearInterval(interval);
      setLoadingMsg('');
      setIsGenerating(false);
    }
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

  const handleSave = async () => {
    setIsSaving(true);
    const slug = generateSlug(indirizzo);
    const { data: inserted, error } = await supabase
      .from('valutazioni')
      .insert([{
        lead_id: leadId || null,
        agente_id: agenteId || null,
        indirizzo: indirizzo.trim(),
        citta: citta.trim() || 'Ranica',
        tipologia: tipologia || null,
        superficie_mq: Number(superficieMq),
        stato_conservativo: statoConservativo || null,
        num_locali: numLocali ? Number(numLocali) : null,
        piano: piano ? Number(piano) : null,
        num_bagni: numBagni ? Number(numBagni) : null,
        anno_costruzione: annoCostruzione ? Number(annoCostruzione) : null,
        classe_energetica: classeEnergetica || null,
        ha_box: comfort.ha_box,
        ha_posto_auto: comfort.ha_posto_auto,
        ha_cantina: comfort.ha_cantina,
        ha_giardino: comfort.ha_giardino,
        ascensore: comfort.ascensore,
        note_tecniche: noteTecniche.trim() || null,
        stima_min: stimaMin ? Number(stimaMin) : null,
        stima_max: stimaMax ? Number(stimaMax) : null,
        motivazione_ai: motivazioneAi.trim() || null,
        trend_mercato_locale: trendPrezzi || null,
        stato: 'Bozza',
        slug,
      }])
      .select('slug')
      .single();
    setIsSaving(false);
    if (error) {
      showError('Errore salvataggio: ' + error.message);
    } else {
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
      if (inserted?.slug) {
        window.open(`/report/${inserted.slug}`, '_blank');
      }
    }
  };

  // ── Step Indicator ──────────────────────────────────────────────────────────

  const StepIndicator = () => (
    <div className="flex items-center justify-center gap-3 pt-2 pb-1">
      {STEP_LABELS.map((label, i) => {
        const n = i + 1;
        const isActive = n === step;
        const isDone = n < step;
        return (
          <div key={n} className="flex flex-col items-center gap-1">
            <div className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all',
              isActive ? 'bg-[#94b0ab] text-white shadow-md shadow-[#94b0ab]/30' :
              isDone   ? 'bg-emerald-500 text-white' :
                         'bg-gray-100 text-gray-400',
            )}>
              {isDone ? <Check size={13} /> : n}
            </div>
            <span className={cn(
              'text-[10px] font-semibold',
              isActive ? 'text-[#94b0ab]' : isDone ? 'text-emerald-500' : 'text-gray-300',
            )}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden">
        <DialogHeader className="px-8 pt-8 pb-4 border-b border-slate-100">
          <DialogTitle className="text-xl font-bold text-gray-900">Nuova Valutazione</DialogTitle>
          <StepIndicator />
        </DialogHeader>

        <div className="px-8 py-6 space-y-5 overflow-y-auto max-h-[55vh]">

          {/* ── STEP 1: Lead ─────────────────────────────────────────────── */}
          {step === 1 && (
            <>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Lead collegato</Label>
                <Combobox
                  items={leadItems}
                  value={leadId}
                  onSelect={setLeadId}
                  onSearch={searchLeads}
                  placeholder="Cerca lead per nome... (opzionale)"
                  searchPlaceholder="Nome o cognome..."
                  emptyMessage="Nessun lead trovato."
                />
              </div>
              <p className="text-xs text-gray-400 italic">
                Il lead è opzionale. Puoi creare una valutazione anche senza associarla a un contatto.
              </p>
            </>
          )}

          {/* ── STEP 2: Dati Immobile ─────────────────────────────────────── */}
          {step === 2 && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2">
                  <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Indirizzo *</Label>
                  <Input value={indirizzo} onChange={e => setIndirizzo(e.target.value)}
                    placeholder="Via Roma 12" className="h-12 rounded-xl border-slate-100" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Città</Label>
                  <Input value={citta} onChange={e => setCitta(e.target.value)}
                    placeholder="Ranica" className="h-12 rounded-xl border-slate-100" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Superficie m² *</Label>
                  <Input type="number" value={superficieMq} onChange={e => setSuperficieMq(e.target.value)}
                    placeholder="80" className="h-12 rounded-xl border-slate-100" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Tipologia</Label>
                  <Select value={tipologia} onValueChange={setTipologia}>
                    <SelectTrigger className="h-12 rounded-xl border-slate-100">
                      <SelectValue placeholder="Seleziona..." />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {TIPOLOGIE.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Stato conservativo</Label>
                  <Select value={statoConservativo} onValueChange={setStatoConservativo}>
                    <SelectTrigger className="h-12 rounded-xl border-slate-100">
                      <SelectValue placeholder="Seleziona..." />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {STATI_CONSERVATIVI.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">N° locali</Label>
                  <Input type="number" value={numLocali} onChange={e => setNumLocali(e.target.value)}
                    placeholder="3" className="h-12 rounded-xl border-slate-100" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Piano</Label>
                  <Input type="number" value={piano} onChange={e => setPiano(e.target.value)}
                    placeholder="2" className="h-12 rounded-xl border-slate-100" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">N° bagni</Label>
                  <Input type="number" value={numBagni} onChange={e => setNumBagni(e.target.value)}
                    placeholder="1" className="h-12 rounded-xl border-slate-100" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Anno costruzione</Label>
                  <Input type="number" value={annoCostruzione} onChange={e => setAnnoCostruzione(e.target.value)}
                    placeholder="1995" className="h-12 rounded-xl border-slate-100" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Classe energetica</Label>
                  <Select value={classeEnergetica} onValueChange={setClasseEnergetica}>
                    <SelectTrigger className="h-12 rounded-xl border-slate-100">
                      <SelectValue placeholder="Seleziona..." />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {CLASSI_ENERGETICHE.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}

          {/* ── STEP 3: Comfort ───────────────────────────────────────────── */}
          {step === 3 && (
            <>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Dotazioni</Label>
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
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Note tecniche</Label>
                <Textarea
                  value={noteTecniche}
                  onChange={e => setNoteTecniche(e.target.value)}
                  placeholder="Dettagli aggiuntivi sull'immobile..."
                  className="rounded-xl border-slate-100 min-h-[80px] resize-none"
                />
              </div>
            </>
          )}

          {/* ── STEP 4: Stima & AI ────────────────────────────────────────── */}
          {step === 4 && (
            <>
              {/* Primary CTA */}
              <Button
                type="button"
                onClick={handleGenerateAI}
                disabled={isGenerating}
                className="w-full h-12 rounded-xl bg-[#94b0ab] hover:bg-[#7a948f] text-white font-bold gap-2"
              >
                <Sparkles size={15} />
                {isGenerating ? 'Generazione in corso...' : 'Genera con AI ✨'}
              </Button>

              {/* Animated loading message */}
              {isGenerating && loadingMsg && (
                <p className="text-center text-xs text-[#94b0ab] animate-pulse">{loadingMsg}</p>
              )}

              {/* AI-filled price display + editable text */}
              {aiGenerated && (
                <>
                  {(stimaMin || stimaMax) && (
                    <div className="rounded-2xl bg-[#94b0ab]/8 border border-[#94b0ab]/20 px-5 py-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Stima suggerita</p>
                      <p className="text-xl font-black text-[#94b0ab]">
                        {stimaMin ? `€${Number(stimaMin).toLocaleString('it-IT')}` : ''}
                        {stimaMin && stimaMax && <span className="text-gray-300 mx-2">–</span>}
                        {stimaMax ? `€${Number(stimaMax).toLocaleString('it-IT')}` : ''}
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Motivazione AI</Label>
                    <Textarea
                      value={motivazioneAi}
                      onChange={e => setMotivazioneAi(e.target.value)}
                      placeholder="Il testo generato dall'AI apparirà qui..."
                      className="rounded-xl border-slate-100 min-h-[150px] resize-none"
                    />
                  </div>

                  {/* Override prices (collapsible) */}
                  <button
                    type="button"
                    onClick={() => setShowPriceOverride(p => !p)}
                    className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors"
                  >
                    {showPriceOverride ? 'Nascondi modifica stima' : 'Modifica stima manualmente'}
                  </button>
                  {showPriceOverride && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Stima minima €</Label>
                        <Input type="number" value={stimaMin} onChange={e => setStimaMin(e.target.value)}
                          placeholder="200000" className="h-12 rounded-xl border-slate-100" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Stima massima €</Label>
                        <Input type="number" value={stimaMax} onChange={e => setStimaMax(e.target.value)}
                          placeholder="250000" className="h-12 rounded-xl border-slate-100" />
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Pre-generation: manual entry fallback (no AI yet) */}
              {!aiGenerated && !isGenerating && (
                <p className="text-xs text-gray-400 text-center italic">
                  Clicca "Genera con AI" per ottenere la stima e l'analisi automaticamente.
                </p>
              )}
            </>
          )}
        </div>

        {/* ── Footer navigation ──────────────────────────────────────────── */}
        <DialogFooter className="px-8 py-5 border-t border-slate-100 bg-slate-50/50 flex items-center gap-3">
          {step > 1 && (
            <Button type="button" variant="outline"
              onClick={() => setStep(s => s - 1)}
              className="rounded-xl h-11 border-gray-200 gap-1"
            >
              <ChevronLeft size={15} /> Indietro
            </Button>
          )}

          <div className="flex-1" />

          {step < 4 && (
            <Button
              type="button"
              onClick={() => {
                if (step === 2) { handleNextFromStep2(); return; }
                setStep(s => s + 1);
              }}
              className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl h-11 px-6 font-bold gap-1"
            >
              Avanti <ChevronRight size={15} />
            </Button>
          )}

          {step === 4 && (
            <Button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl h-11 px-8 font-bold"
            >
              {isSaving ? 'Salvataggio...' : 'Salva Valutazione'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ValuationWizard;
