"use client";

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { DialogTitle } from '@/components/ui/dialog';
import {
  X, ChevronRight, Image as ImageIcon, Plus,
  Home, Settings, Info, Camera, ChevronLeft,
  Link as LinkIcon, Save, Sparkles, Euro, History, Check
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { showSuccess, showError } from '@/utils/toast';
import { compressCopertina, compressGalleria } from '@/utils/imageCompression';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Combobox, type ComboboxItem } from '@/components/ui/combobox';

interface PropertyWizardProps {
  initialData?: any;
  onClose: () => void;
  onSuccess: () => void;
  /** ID of the lead that originated this property listing (used for automation hooks). */
  leadId?: string;
  /** Called with the new immobile ID after a successful save, when leadId is provided. */
  onLeadLinked?: (leadId: string, immobileId: string) => void;
}

const PREDEFINED_FEATURES = [
  "Aria Condizionata", "Ascensore", "Balcone", "Terrazzo",
  "Box Auto", "Posto Auto", "Cantina", "Giardino Privato",
  "Domotica", "Allarme", "Piscina", "Pannelli Solari"
];

const PropertyWizard = ({ initialData, onClose, onSuccess, leadId, onLeadLinked }: PropertyWizardProps) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    titolo: '',
    prezzo: '',
    mq: '',
    locali: 'Trilocale',
    citta: '',
    indirizzo: '',
    piano: '',
    bagni: 1,
    classe_energetica: 'A1',
    stato_immobile: 'Ottimo/Ristrutturato',
    spese_condominiali: '',
    anno_costruzione: '',
    caratteristiche: [] as string[],
    descrizione: '',
    stato: 'Disponibile',
    link_immobiliare: '',
    proprietario: '',
  });

  const [prezzoSuRichiesta, setPrezzoSuRichiesta] = useState(false);
  const [proprietarioLeadId, setProprietarioLeadId] = useState('');
  const [proprietarioItems, setProprietarioItems] = useState<ComboboxItem[]>([]);
  const [customFeatureInput, setCustomFeatureInput] = useState('');

  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [galleryImages, setGalleryImages] = useState<File[]>([]);
  const [galleryPreviews, setGalleryPreviews] = useState<string[]>([]);

  useEffect(() => {
    supabase
      .from('leads')
      .select('id, nome, cognome, telefono')
      .in('tipo_cliente', ['Proprietario', 'Ibrido'])
      .order('cognome')
      .limit(100)
      .then(({ data: rows }) => {
        if (!rows) return;
        const items: ComboboxItem[] = rows.map(r => ({
          id: r.id,
          label: `${r.nome} ${r.cognome}`,
          sublabel: r.telefono ?? undefined,
        }));
        setProprietarioItems(items);
        if (initialData?.proprietario) {
          const match = items.find(
            i => i.label.toLowerCase() === initialData.proprietario.toLowerCase()
          );
          if (match) setProprietarioLeadId(match.id);
        }
      });
  }, []);

  useEffect(() => {
    if (initialData) {
      setFormData({
        titolo: initialData.titolo || '',
        prezzo: initialData.prezzo ? initialData.prezzo.toString() : '',
        mq: initialData.mq?.toString() || '',
        locali: initialData.locali || 'Trilocale',
        citta: initialData.citta || '',
        indirizzo: initialData.indirizzo || '',
        piano: initialData.piano || '',
        bagni: initialData.bagni || 1,
        classe_energetica: initialData.classe_energetica || 'A1',
        stato_immobile: initialData.stato_immobile || 'Ottimo/Ristrutturato',
        spese_condominiali: initialData.spese_condominiali?.toString() || '',
        anno_costruzione: initialData.anno_costruzione?.toString() || '',
        caratteristiche: initialData.caratteristiche || [],
        descrizione: initialData.descrizione || '',
        stato: initialData.stato || 'Disponibile',
        link_immobiliare: initialData.link_immobiliare || '',
        proprietario: initialData.proprietario || '',
      });
      if (!initialData.prezzo) setPrezzoSuRichiesta(true);
      if (initialData.copertina_url) setCoverPreview(initialData.copertina_url);
      if (initialData.immagini_urls) setGalleryPreviews(initialData.immagini_urls);
    }
  }, [initialData]);

  const buildPayload = () => {
    const slug = formData.titolo.toLowerCase().trim().replace(/ /g, '-').replace(/[^\w-]+/g, '');
    return {
      titolo: formData.titolo,
      prezzo: prezzoSuRichiesta ? null : (parseFloat(formData.prezzo) || null),
      mq: parseInt(formData.mq) || 0,
      locali: formData.locali,
      citta: formData.citta,
      indirizzo: formData.indirizzo,
      piano: formData.piano,
      bagni: formData.bagni,
      classe_energetica: formData.classe_energetica,
      stato_immobile: formData.stato_immobile,
      spese_condominiali: parseFloat(formData.spese_condominiali) || 0,
      anno_costruzione: parseInt(formData.anno_costruzione) || null,
      caratteristiche: formData.caratteristiche,
      descrizione: formData.descrizione,
      link_immobiliare: formData.link_immobiliare,
      proprietario: formData.proprietario || null,
      slug,
    };
  };

  const autoSave = (targetId: string) => {
    supabase.from('immobili').update(buildPayload()).eq('id', targetId);
  };

  const handleNextStep = async () => {
    if (step === 1 && !initialData && !draftId) {
      if (!formData.titolo) {
        showError("Inserisci un titolo per continuare");
        return;
      }
      setLoading(true);
      try {
        const { data: inserted, error } = await supabase
          .from('immobili')
          .insert([{ ...buildPayload(), stato: 'Bozza', copertina_url: null, immagini_urls: [] }])
          .select('id')
          .single();
        if (error) throw error;
        setDraftId(inserted.id);
      } catch (err: any) {
        console.error("Supabase Error Details:", err.message, err.details, err.hint);
        showError("Errore nel salvataggio bozza: " + err.message);
        setLoading(false);
        return;
      }
      setLoading(false);
    } else {
      const targetId = draftId || initialData?.id;
      if (targetId) autoSave(targetId);
    }
    setStep(s => s + 1);
  };

  // Called only by the explicit X button — saves progress as Bozza before closing
  const handleClose = async () => {
    if (!initialData && !draftId && formData.titolo) {
      try {
        await supabase
          .from('immobili')
          .insert([{ ...buildPayload(), stato: 'Bozza', copertina_url: null, immagini_urls: [] }]);
        showSuccess("Bozza salvata");
        onSuccess();
      } catch {}
    } else if (draftId) {
      autoSave(draftId);
      onSuccess();
    }
    onClose();
  };

  const toggleFeature = (feature: string) => {
    setFormData(prev => ({
      ...prev,
      caratteristiche: prev.caratteristiche.includes(feature)
        ? prev.caratteristiche.filter(f => f !== feature)
        : [...prev.caratteristiche, feature]
    }));
  };

  const addCustomFeature = () => {
    const trimmed = customFeatureInput.trim();
    if (!trimmed || formData.caratteristiche.includes(trimmed)) return;
    setFormData(prev => ({ ...prev, caratteristiche: [...prev.caratteristiche, trimmed] }));
    setCustomFeatureInput('');
  };

  const removeCustomFeature = (feature: string) => {
    if (PREDEFINED_FEATURES.includes(feature)) return;
    setFormData(prev => ({
      ...prev,
      caratteristiche: prev.caratteristiche.filter(f => f !== feature),
    }));
  };

  const handleProprietarioSelect = (id: string) => {
    setProprietarioLeadId(id);
    if (!id) {
      setFormData(prev => ({ ...prev, proprietario: '' }));
      return;
    }
    const item = proprietarioItems.find(i => i.id === id);
    if (item) setFormData(prev => ({ ...prev, proprietario: item.label }));
  };

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      setCoverImage(file);
      setCoverPreview(URL.createObjectURL(file));
    }
  };

  const handleGalleryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setGalleryImages(prev => [...prev, ...newFiles]);
      const newPreviews = newFiles.map(file => URL.createObjectURL(file));
      setGalleryPreviews(prev => [...prev, ...newPreviews]);
    }
  };

  const uploadToStorage = async (file: File, path: string): Promise<string> => {
    const { error } = await supabase.storage.from('immobili').upload(path, file, { upsert: true });
    if (error) throw new Error(`Upload fallito (${path}): ${error.message}`);
    const { data } = supabase.storage.from('immobili').getPublicUrl(path);
    return data.publicUrl;
  };

  const handleSubmit = async () => {
    if (!formData.titolo || (!prezzoSuRichiesta && !formData.prezzo)) {
      showError("Titolo e Prezzo sono obbligatori");
      setStep(1);
      return;
    }

    setIsCompressing(true);
    let compressedCover: File | null = null;
    let compressedGallery: File[] = [];
    try {
      if (coverImage) compressedCover = await compressCopertina(coverImage);
      if (galleryImages.length > 0) {
        compressedGallery = await Promise.all(galleryImages.map(f => compressGalleria(f)));
      }
    } catch (error: any) {
      showError("Errore durante la compressione delle immagini: " + error.message);
      setIsCompressing(false);
      return;
    } finally {
      setIsCompressing(false);
    }

    setLoading(true);
    try {
      const targetId = draftId || initialData?.id;
      let immobileId: string;

      if (targetId) {
        immobileId = targetId;
      } else {
        // Fallback for edge case where draft was never created
        const { data: inserted, error: insertErr } = await supabase
          .from('immobili')
          .insert([{ ...buildPayload(), stato: formData.stato, copertina_url: null, immagini_urls: [] }])
          .select('id')
          .single();
        if (insertErr) throw insertErr;
        immobileId = inserted.id;
      }

      const ts = Date.now();
      let copertinaUrl: string | null = coverPreview?.startsWith('http') ? coverPreview : null;
      if (compressedCover) {
        copertinaUrl = await uploadToStorage(compressedCover, `immobili/${immobileId}/copertina_${ts}.webp`);
      }

      const newGalleryUrls = await Promise.all(
        compressedGallery.map((file, i) =>
          uploadToStorage(file, `immobili/${immobileId}/galleria_${ts}_${i}.webp`)
        )
      );

      const imagePayload = {
        copertina_url: copertinaUrl,
        immagini_urls: [
          ...galleryPreviews.filter(p => p.startsWith('http')),
          ...newGalleryUrls,
        ],
      };

      const { error } = await supabase
        .from('immobili')
        .update({ ...buildPayload(), stato: formData.stato, ...imagePayload })
        .eq('id', immobileId);
      if (error) throw error;

      if (proprietarioLeadId) {
        supabase.from('leads').update({ stato_venditore: 'Chiuso' }).eq('id', proprietarioLeadId);
      }

      showSuccess(initialData ? "Immobile aggiornato correttamente" : "Immobile pubblicato con successo");
      onSuccess();
      if (leadId && onLeadLinked) onLeadLinked(leadId, immobileId);
      onClose();
    } catch (error: any) {
      showError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const customFeatures = formData.caratteristiche.filter(f => !PREDEFINED_FEATURES.includes(f));

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">

      {/* Header — fixed, never scrolls */}
      <div className="px-10 py-7 border-b shrink-0 bg-white">
        <div className="flex justify-between items-center">
          <div>
            <DialogTitle className="text-3xl font-bold text-[#1a1a1a]">
              {initialData ? "Modifica Immobile" : "Nuovo Immobile"}
            </DialogTitle>
            <p className="text-sm text-gray-500 mt-1 flex items-center gap-1.5">
              {draftId && !initialData && (
                <span className="inline-flex items-center gap-1 text-[#94b0ab] font-semibold">
                  <Save size={11} /> Bozza ·{' '}
                </span>
              )}
              Step {step} di 5
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  onClick={() => setStep(s)}
                  className={cn(
                    "h-2 rounded-full transition-all duration-300",
                    step === s ? "w-12 bg-[#94b0ab]" : "w-6 bg-gray-100 hover:bg-gray-200"
                  )}
                />
              ))}
            </div>
            <button
              onClick={handleClose}
              className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all"
              aria-label="Chiudi"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Step Content — takes remaining space, scrolls independently */}
      <div className="flex-1 overflow-y-auto px-10 py-7">

        {/* Step 1: Identità */}
        {step === 1 && (
          <div className="space-y-7 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="space-y-1">
              <h2 className="text-xl font-bold flex items-center gap-2 text-[#1a1a1a]">
                <Home size={22} className="text-[#94b0ab]" /> Dati Principali
              </h2>
              <p className="text-sm text-gray-400">Inserisci le informazioni di base dell'annuncio.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3 col-span-full">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Titolo dell'annuncio *</Label>
                <Input placeholder="Es: Trilocale con vista parco..." value={formData.titolo} onChange={(e) => setFormData({...formData, titolo: e.target.value})} className="rounded-2xl h-14 border-gray-100" />
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Prezzo (€) *</Label>
                  <button
                    type="button"
                    onClick={() => { setPrezzoSuRichiesta(v => !v); setFormData(prev => ({ ...prev, prezzo: '' })); }}
                    className={cn(
                      "text-xs font-bold px-3 py-1 rounded-full border transition-all",
                      prezzoSuRichiesta
                        ? "bg-[#94b0ab]/10 border-[#94b0ab] text-[#94b0ab]"
                        : "bg-white border-gray-200 text-gray-400 hover:border-gray-300"
                    )}
                  >
                    Su richiesta
                  </button>
                </div>
                <div className="relative">
                  <Euro className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                  <Input
                    type="number"
                    placeholder={prezzoSuRichiesta ? "—" : "0"}
                    value={prezzoSuRichiesta ? '' : formData.prezzo}
                    onChange={(e) => setFormData({...formData, prezzo: e.target.value})}
                    onWheel={(e) => e.currentTarget.blur()}
                    disabled={prezzoSuRichiesta}
                    className={cn("rounded-2xl h-14 pl-12 border-gray-100", prezzoSuRichiesta && "opacity-40 cursor-not-allowed")}
                  />
                </div>
              </div>
              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Superficie (mq)</Label>
                <Input type="number" placeholder="0" value={formData.mq} onChange={(e) => setFormData({...formData, mq: e.target.value})} onWheel={(e) => e.currentTarget.blur()} className="rounded-2xl h-14 border-gray-100" />
              </div>
              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Tipologia</Label>
                <Select onValueChange={(v) => setFormData({...formData, locali: v})} value={formData.locali}>
                  <SelectTrigger className="rounded-2xl h-14 border-gray-100"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    {['Monolocale', 'Bilocale', 'Trilocale', 'Quadrilocale', 'Villa', 'Attico', 'Loft'].map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Città</Label>
                <Input placeholder="Bergamo" value={formData.citta} onChange={(e) => setFormData({...formData, citta: e.target.value})} className="rounded-2xl h-14 border-gray-100" />
              </div>
              <div className="space-y-3 col-span-full">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Proprietario</Label>
                <Combobox
                  items={proprietarioItems}
                  value={proprietarioLeadId}
                  onSelect={handleProprietarioSelect}
                  placeholder="Cerca proprietario o ibrido..."
                  searchPlaceholder="Nome o cognome..."
                  emptyMessage="Nessun lead trovato."
                  className="rounded-2xl h-14 border-gray-100 bg-white"
                />
                {!proprietarioLeadId && formData.proprietario && (
                  <p className="text-xs text-gray-400 mt-1">Attuale: {formData.proprietario}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Dati Tecnici */}
        {step === 2 && (
          <div className="space-y-7 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="space-y-1">
              <h2 className="text-xl font-bold flex items-center gap-2 text-[#1a1a1a]">
                <Settings size={22} className="text-[#94b0ab]" /> Dettagli Tecnici
              </h2>
              <p className="text-sm text-gray-400">Specifiche costruttive e costi di gestione.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Stato Immobile</Label>
                <Select onValueChange={(v) => setFormData({...formData, stato_immobile: v})} value={formData.stato_immobile}>
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
                <Select onValueChange={(v) => setFormData({...formData, classe_energetica: v})} value={formData.classe_energetica}>
                  <SelectTrigger className="rounded-2xl h-14 border-gray-100"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    {["A4", "A3", "A2", "A1", "B", "C", "D", "E", "F", "G", "Esente"].map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Spese Condominiali (€/mese)</Label>
                <div className="relative">
                  <Euro className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                  <Input type="number" placeholder="Es: 120" value={formData.spese_condominiali} onChange={(e) => setFormData({...formData, spese_condominiali: e.target.value})} onWheel={(e) => e.currentTarget.blur()} className="rounded-2xl h-14 pl-12 border-gray-100" />
                </div>
              </div>
              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Anno di Costruzione</Label>
                <div className="relative">
                  <History className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                  <Input type="number" placeholder="Es: 2015" value={formData.anno_costruzione} onChange={(e) => setFormData({...formData, anno_costruzione: e.target.value})} onWheel={(e) => e.currentTarget.blur()} className="rounded-2xl h-14 pl-12 border-gray-100" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Comfort & Dotazioni */}
        {step === 3 && (
          <div className="space-y-7 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="space-y-1">
              <h2 className="text-xl font-bold flex items-center gap-2 text-[#1a1a1a]">
                <Sparkles size={22} className="text-[#94b0ab]" /> Comfort e Dotazioni
              </h2>
              <p className="text-sm text-gray-400">Seleziona le caratteristiche e aggiungi quelle personalizzate.</p>
            </div>
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
            <div className="space-y-3">
              <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Aggiungi caratteristica personalizzata</Label>
              <div className="flex gap-3">
                <Input
                  placeholder="Es: Portone blindato, Doppi vetri..."
                  value={customFeatureInput}
                  onChange={(e) => setCustomFeatureInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomFeature(); } }}
                  className="rounded-2xl h-12 border-gray-100 flex-1"
                />
                <Button
                  type="button"
                  onClick={addCustomFeature}
                  disabled={!customFeatureInput.trim()}
                  className="h-12 px-5 rounded-2xl bg-[#94b0ab] hover:bg-[#7a948f] text-white font-bold shrink-0"
                >
                  <Plus size={18} />
                </Button>
              </div>
            </div>
            {customFeatures.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {customFeatures.map((feature) => (
                  <span
                    key={feature}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-[#94b0ab]/10 border border-[#94b0ab] text-[#94b0ab] text-sm font-semibold"
                  >
                    {feature}
                    <button
                      onClick={() => removeCustomFeature(feature)}
                      className="hover:text-red-500 transition-colors ml-0.5"
                    >
                      <X size={13} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 4: Descrizione */}
        {step === 4 && (
          <div className="space-y-7 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="space-y-1">
              <h2 className="text-xl font-bold flex items-center gap-2 text-[#1a1a1a]">
                <Info size={22} className="text-[#94b0ab]" /> Testi e Link
              </h2>
              <p className="text-sm text-gray-400">Dettagli descrittivi per il marketing.</p>
            </div>
            <div className="space-y-6">
              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Descrizione dell'annuncio</Label>
                <Textarea
                  placeholder="Inserisci la descrizione completa..."
                  rows={7}
                  value={formData.descrizione}
                  onChange={(e) => setFormData({...formData, descrizione: e.target.value})}
                  className="rounded-3xl p-6 border-gray-100"
                />
              </div>
              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500 flex items-center gap-2">
                  <LinkIcon size={14} /> Link Immobiliare.it (opzionale)
                </Label>
                <Input placeholder="Incolla l'URL..." value={formData.link_immobiliare} onChange={(e) => setFormData({...formData, link_immobiliare: e.target.value})} className="rounded-2xl h-14 border-gray-100" />
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Media */}
        {step === 5 && (
          <div className="space-y-7 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="space-y-1">
              <h2 className="text-xl font-bold flex items-center gap-2 text-[#1a1a1a]">
                <Camera size={22} className="text-[#94b0ab]" /> Foto e Galleria
              </h2>
              <p className="text-sm text-gray-400">Le immagini sono fondamentali per convertire i lead.</p>
            </div>

            <div className="space-y-4">
              <Label className="text-xs font-bold uppercase tracking-widest text-[#94b0ab]">Copertina *</Label>
              <div className={cn(
                "relative h-52 border-2 border-dashed rounded-[2rem] overflow-hidden transition-all group",
                coverPreview ? "border-transparent" : "border-gray-200 hover:border-[#94b0ab] bg-gray-50/30"
              )}>
                <input type="file" accept="image/*" onChange={handleCoverChange} className="absolute inset-0 opacity-0 cursor-pointer z-20" />
                {coverPreview ? (
                  <img src={coverPreview} alt="Cover" className="w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 gap-3">
                    <ImageIcon size={24} />
                    <p className="text-xs font-bold uppercase">Scegli Copertina</p>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Galleria Fotografica</Label>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-4">
                {galleryPreviews.map((url, i) => (
                  <div key={i} className="relative aspect-square rounded-[1.5rem] overflow-hidden group">
                    <img src={url} alt={`Gallery ${i}`} className="w-full h-full object-cover" />
                    <button
                      onClick={() => {
                        setGalleryImages(prev => prev.filter((_, idx) => idx !== i));
                        setGalleryPreviews(prev => prev.filter((_, idx) => idx !== i));
                      }}
                      className="absolute top-2 right-2 w-8 h-8 bg-white/90 text-red-500 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
                <div className="relative aspect-square border-2 border-dashed border-gray-200 rounded-[1.5rem] hover:border-[#94b0ab] transition-all flex flex-col items-center justify-center text-gray-400 cursor-pointer group">
                  <input type="file" multiple accept="image/*" onChange={handleGalleryChange} className="absolute inset-0 opacity-0 cursor-pointer" />
                  <Plus size={24} className="group-hover:scale-110 transition-transform" />
                  <span className="text-[10px] font-bold uppercase">Aggiungi</span>
                </div>
              </div>
              {isCompressing && (
                <p className="text-sm text-[#94b0ab] font-medium mt-2 animate-pulse">
                  Ottimizzazione foto in corso...
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer — fixed, always visible */}
      <div className="shrink-0 border-t bg-white px-10 py-6 flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => step > 1 ? setStep(step - 1) : onClose()}
          className="rounded-2xl h-14 px-8 text-gray-500 font-bold hover:bg-gray-50"
        >
          {step === 1 ? "Annulla" : <><ChevronLeft className="mr-2" size={18} /> Indietro</>}
        </Button>

        <div className="flex gap-3">
          {initialData && (
            <Button
              variant="outline"
              onClick={handleSubmit}
              disabled={loading || isCompressing}
              className="border-2 border-[#94b0ab] text-[#94b0ab] hover:bg-[#94b0ab]/5 rounded-2xl px-8 h-14 font-bold"
            >
              <Save size={18} className="mr-2" />
              {isCompressing ? "Ottimizzazione foto..." : loading ? "Salvataggio..." : "Salva"}
            </Button>
          )}

          {step < 5 ? (
            <Button
              onClick={handleNextStep}
              disabled={loading}
              className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-2xl px-10 h-14 shadow-lg shadow-[#94b0ab]/20 font-bold"
            >
              {loading ? "Salvataggio..." : <> Avanti <ChevronRight className="ml-2" size={18} /></>}
            </Button>
          ) : !initialData ? (
            <Button
              onClick={handleSubmit}
              disabled={loading || isCompressing || !coverPreview}
              className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-2xl px-14 h-14 shadow-lg shadow-[#94b0ab]/20 font-bold"
            >
              {isCompressing ? "Ottimizzazione foto..." : loading ? "Pubblicazione..." : "Pubblica Annuncio"}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default PropertyWizard;
