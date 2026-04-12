"use client";

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  Sparkles, ChevronLeft, Euro, Home, Check, AlertCircle
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { showSuccess, showError } from '@/utils/toast';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";

interface ValuationFormProps {
  onClose: () => void;
  onSuccess?: () => void;
}

const PREDEFINED_FEATURES = [
  "Box Auto", "Posto Auto", "Cantina", "Giardino Privato",
  "Ascensore", "Balcone", "Terrazzo", "Domotica"
];

interface ValuationResult {
  descrizione_zona: string;
  razionale_valutazione: string;
  stima_min: number;
  stima_max: number;
  trend_prezzi: Array<{ anno: number; prezzo_mq: number }>;
}

const ValuationForm = ({ onClose, onSuccess }: ValuationFormProps) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [generatingValuation, setGeneratingValuation] = useState(false);
  const [valuation, setValuation] = useState<ValuationResult | null>(null);

  const [formData, setFormData] = useState({
    indirizzo: '',
    citta: 'Ranica',
    zona: '',
    tipologia: 'Trilocale',
    superficie_mq: '',
    piano: '',
    num_locali: 3,
    num_bagni: 1,
    anno_costruzione: '',
    stato_conservativo: 'Buono',
    classe_energetica: 'D',
    spese_condominiali_annue: '',
    caratteristiche: [] as string[],
    note_tecniche: '',
  });

  const [agente, setAgente] = useState<{ id: string; nome: string } | null>(null);

  useEffect(() => {
    // Get current user (agente)
    const getCurrentAgent = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profili_agenti')
          .select('id, nome_completo')
          .eq('id', user.id)
          .single();
        if (profile) {
          setAgente({ id: profile.id, nome: profile.nome_completo });
        }
      }
    };
    getCurrentAgent();
  }, []);

  const toggleFeature = (feature: string) => {
    setFormData(prev => ({
      ...prev,
      caratteristiche: prev.caratteristiche.includes(feature)
        ? prev.caratteristiche.filter(f => f !== feature)
        : [...prev.caratteristiche, feature]
    }));
  };

  const generateValuation = async () => {
    if (!formData.indirizzo || !formData.superficie_mq) {
      showError("Indirizzo e Superficie sono obbligatori");
      return;
    }

    setGeneratingValuation(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-evaluation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({
          indirizzo: formData.indirizzo,
          citta: formData.citta,
          metri_quadri: parseInt(formData.superficie_mq),
          tipologia: formData.tipologia,
          condizioni: formData.stato_conservativo,
          comfort: formData.caratteristiche,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Errore nella generazione della valutazione");
      }

      const result = await response.json() as ValuationResult;
      setValuation(result);
      setStep(3); // Vai a step di riepilogo
    } catch (error: any) {
      showError(`Errore: ${error.message}`);
    } finally {
      setGeneratingValuation(false);
    }
  };

  const saveValuation = async () => {
    if (!valuation || !agente) {
      showError("Errore: dati incompleti");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from('valutazioni').insert([{
        agente_id: agente.id,
        indirizzo: formData.indirizzo,
        citta: formData.citta,
        zona: formData.zona || null,
        tipologia: formData.tipologia,
        superficie_mq: parseInt(formData.superficie_mq),
        piano: formData.piano || null,
        num_locali: formData.num_locali,
        num_bagni: formData.num_bagni,
        anno_costruzione: formData.anno_costruzione ? parseInt(formData.anno_costruzione) : null,
        stato_conservativo: formData.stato_conservativo,
        classe_energetica: formData.classe_energetica,
        spese_condominiali_annue: formData.spese_condominiali_annue ? parseFloat(formData.spese_condominiali_annue) : null,
        // Extract boolean features
        ha_box: formData.caratteristiche.includes("Box Auto"),
        ha_posto_auto: formData.caratteristiche.includes("Posto Auto"),
        ha_cantina: formData.caratteristiche.includes("Cantina"),
        ha_giardino: formData.caratteristiche.includes("Giardino Privato"),
        ascensore: formData.caratteristiche.includes("Ascensore"),
        note_tecniche: formData.note_tecniche || null,
        // AI Results
        stima_min: valuation.stima_min,
        stima_max: valuation.stima_max,
        motivazione_ai: valuation.razionale_valutazione,
        trend_mercato_locale: valuation.trend_prezzi,
        slug: `${formData.indirizzo.toLowerCase().replace(/ /g, '-')}-${Date.now()}`,
        stato: 'Bozza',
      }]);

      if (error) throw error;
      showSuccess("Valutazione salvata con successo");
      onSuccess?.();
      onClose();
    } catch (error: any) {
      showError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      <DialogHeader className="px-10 py-8 border-b shrink-0 bg-white">
        <div className="flex justify-between items-center">
          <div>
            <DialogTitle className="text-3xl font-bold text-[#1a1a1a]">
              Nuova Valutazione
            </DialogTitle>
            <p className="text-sm text-gray-500 mt-1">
              {valuation ? "Rivedi la valutazione generata" : `Step ${step} di 3`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((s) => (
              <button
                key={s}
                onClick={() => !valuation && setStep(s)}
                className={cn(
                  "h-2 rounded-full transition-all duration-300 relative group",
                  (step === s || (valuation && s === 3)) ? "w-12 bg-[#94b0ab]" : "w-6 bg-gray-100 hover:bg-gray-200"
                )}
              />
            ))}
          </div>
        </div>
      </DialogHeader>

      <div className="flex-1 overflow-y-auto px-10 py-10 space-y-10">

        {/* Step 1: Dati Immobile */}
        {step === 1 && !valuation && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="space-y-1">
              <h2 className="text-xl font-bold flex items-center gap-2 text-[#1a1a1a]">
                <Home size={22} className="text-[#94b0ab]" /> Dati Principali
              </h2>
              <p className="text-sm text-gray-400">Informazioni di base dell'immobile da valutare.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-3 col-span-full">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Indirizzo *</Label>
                <Input
                  placeholder="Es: Via Roma 123"
                  value={formData.indirizzo}
                  onChange={(e) => setFormData({...formData, indirizzo: e.target.value})}
                  className="rounded-2xl h-14 border-gray-100"
                />
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Città</Label>
                <Input
                  placeholder="Ranica"
                  value={formData.citta}
                  onChange={(e) => setFormData({...formData, citta: e.target.value})}
                  className="rounded-2xl h-14 border-gray-100"
                />
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Zona/Quartiere</Label>
                <Input
                  placeholder="Es: Centro Storico"
                  value={formData.zona}
                  onChange={(e) => setFormData({...formData, zona: e.target.value})}
                  className="rounded-2xl h-14 border-gray-100"
                />
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Tipologia</Label>
                <Select value={formData.tipologia} onValueChange={(v) => setFormData({...formData, tipologia: v})}>
                  <SelectTrigger className="rounded-2xl h-14 border-gray-100"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    {['Monolocale', 'Bilocale', 'Trilocale', 'Quadrilocale', 'Villa', 'Attico', 'Loft'].map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Superficie (mq) *</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={formData.superficie_mq}
                  onChange={(e) => setFormData({...formData, superficie_mq: e.target.value})}
                  className="rounded-2xl h-14 border-gray-100"
                />
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Locali</Label>
                <Input
                  type="number"
                  placeholder="3"
                  value={formData.num_locali}
                  onChange={(e) => setFormData({...formData, num_locali: parseInt(e.target.value) || 0})}
                  className="rounded-2xl h-14 border-gray-100"
                />
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Bagni</Label>
                <Input
                  type="number"
                  placeholder="1"
                  value={formData.num_bagni}
                  onChange={(e) => setFormData({...formData, num_bagni: parseInt(e.target.value) || 0})}
                  className="rounded-2xl h-14 border-gray-100"
                />
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Piano</Label>
                <Input
                  placeholder="Es: 2°"
                  value={formData.piano}
                  onChange={(e) => setFormData({...formData, piano: e.target.value})}
                  className="rounded-2xl h-14 border-gray-100"
                />
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Anno Costruzione</Label>
                <Input
                  type="number"
                  placeholder="Es: 2015"
                  value={formData.anno_costruzione}
                  onChange={(e) => setFormData({...formData, anno_costruzione: e.target.value})}
                  className="rounded-2xl h-14 border-gray-100"
                />
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Stato Conservativo</Label>
                <Select value={formData.stato_conservativo} onValueChange={(v) => setFormData({...formData, stato_conservativo: v})}>
                  <SelectTrigger className="rounded-2xl h-14 border-gray-100"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    {["Nuovo", "Ottimo/Ristrutturato", "Buono", "Da ristrutturare"].map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Classe Energetica</Label>
                <Select value={formData.classe_energetica} onValueChange={(v) => setFormData({...formData, classe_energetica: v})}>
                  <SelectTrigger className="rounded-2xl h-14 border-gray-100"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    {["A4", "A3", "A2", "A1", "B", "C", "D", "E", "F", "G", "Esente"].map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Spese Condominiali (€/anno)</Label>
                <div className="relative">
                  <Euro className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                  <Input
                    type="number"
                    placeholder="Es: 1200"
                    value={formData.spese_condominiali_annue}
                    onChange={(e) => setFormData({...formData, spese_condominiali_annue: e.target.value})}
                    className="rounded-2xl h-14 pl-12 border-gray-100"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Dotazioni */}
        {step === 2 && !valuation && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="space-y-1">
              <h2 className="text-xl font-bold flex items-center gap-2 text-[#1a1a1a]">
                <Sparkles size={22} className="text-[#94b0ab]" /> Dotazioni e Note
              </h2>
              <p className="text-sm text-gray-400">Seleziona le dotazioni e aggiungi note tecniche.</p>
            </div>

            <div className="space-y-6">
              <div>
                <Label className="text-sm font-bold text-gray-900 mb-4 block">Dotazioni Disponibili</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {PREDEFINED_FEATURES.map((feature) => {
                    const isActive = formData.caratteristiche.includes(feature);
                    return (
                      <button
                        key={feature}
                        onClick={() => toggleFeature(feature)}
                        className={cn(
                          "flex items-center justify-between p-4 rounded-2xl border text-sm font-semibold transition-all text-left",
                          isActive
                            ? "bg-[#94b0ab]/10 border-[#94b0ab] text-[#94b0ab]"
                            : "bg-white border-gray-100 text-gray-500 hover:bg-gray-50"
                        )}
                      >
                        {feature}
                        {isActive && <Check size={16} />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Note Tecniche (opzionali)</Label>
                <Textarea
                  placeholder="Aggiungi dettagli specifici dell'immobile..."
                  rows={8}
                  value={formData.note_tecniche}
                  onChange={(e) => setFormData({...formData, note_tecniche: e.target.value})}
                  className="rounded-3xl p-6 border-gray-100"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Riepilogo Valutazione */}
        {(step === 3 && valuation) && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="space-y-1">
              <h2 className="text-xl font-bold flex items-center gap-2 text-[#1a1a1a]">
                <Sparkles size={22} className="text-[#94b0ab]" /> Valutazione Generata
              </h2>
              <p className="text-sm text-gray-400">La valutazione è stata generata con successo da OpenAI.</p>
            </div>

            <div className="space-y-6">
              {/* Stima Prezzo */}
              <Card className="border border-[#94b0ab]/20 bg-[#94b0ab]/5 rounded-[2rem]">
                <CardContent className="pt-8 pb-6">
                  <div className="grid grid-cols-2 gap-8 mb-6">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Stima Minima</p>
                      <p className="text-3xl font-bold text-[#94b0ab]">
                        {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(valuation.stima_min)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Stima Massima</p>
                      <p className="text-3xl font-bold text-[#94b0ab]">
                        {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(valuation.stima_max)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Descrizione Zona */}
              <div className="space-y-3">
                <Label className="text-sm font-bold text-gray-900">Analisi della Zona</Label>
                <div className="p-6 bg-gray-50 border border-gray-100 rounded-2xl">
                  <p className="text-sm text-gray-700 leading-relaxed">{valuation.descrizione_zona}</p>
                </div>
              </div>

              {/* Razionale Valutazione */}
              <div className="space-y-3">
                <Label className="text-sm font-bold text-gray-900">Razionale della Valutazione</Label>
                <div className="p-6 bg-gray-50 border border-gray-100 rounded-2xl">
                  <p className="text-sm text-gray-700 leading-relaxed">{valuation.razionale_valutazione}</p>
                </div>
              </div>

              {/* Trend Prezzi */}
              <div className="space-y-3">
                <Label className="text-sm font-bold text-gray-900">Andamento Storico Prezzi (€/mq)</Label>
                <div className="bg-gray-50 border border-gray-100 rounded-2xl p-6">
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
                    {valuation.trend_prezzi?.map((trend, idx) => (
                      <div key={idx} className="text-center">
                        <p className="text-xs text-gray-500 font-bold">{trend.anno}</p>
                        <p className="text-sm font-bold text-[#94b0ab] mt-1">€{trend.prezzo_mq}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex gap-3">
                <AlertCircle size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-blue-800">
                  Questa valutazione è generata da AI e non vincolante. Rivedi attentamente i dati inseriti prima di salvare.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <DialogFooter className="px-10 py-6 border-t bg-white shrink-0 flex items-center justify-between sm:justify-between z-20">
        <Button
          variant="ghost"
          onClick={() => {
            if (valuation) {
              setValuation(null);
              setStep(2);
            } else if (step > 1) {
              setStep(step - 1);
            } else {
              onClose();
            }
          }}
          disabled={generatingValuation || loading}
          className="rounded-2xl h-14 px-8 text-gray-500 font-bold hover:bg-gray-50"
        >
          {(valuation && step === 3) ? "Indietro" : step === 1 ? "Annulla" : "<ChevronLeft className=\"mr-2\" size={18} /> Indietro"}
        </Button>

        <div className="flex gap-3">
          {!valuation ? (
            <>
              {step < 2 && (
                <Button
                  onClick={() => setStep(step + 1)}
                  className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-2xl px-10 h-14 shadow-lg shadow-[#94b0ab]/20 font-bold"
                >
                  Avanti
                </Button>
              )}
              {step === 2 && (
                <Button
                  onClick={generateValuation}
                  disabled={generatingValuation || !formData.indirizzo || !formData.superficie_mq}
                  className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-2xl px-10 h-14 shadow-lg shadow-[#94b0ab]/20 font-bold"
                >
                  {generatingValuation ? "Generazione..." : "Genera Valutazione"}
                </Button>
              )}
            </>
          ) : (
            <Button
              onClick={saveValuation}
              disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl px-14 h-14 shadow-lg shadow-emerald-600/20 font-bold"
            >
              {loading ? "Salvataggio..." : "Salva Valutazione"}
            </Button>
          )}
        </div>
      </DialogFooter>
    </div>
  );
};

export default ValuationForm;
