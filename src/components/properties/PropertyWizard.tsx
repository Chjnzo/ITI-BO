"use client";

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { 
  X, ChevronRight, Image as ImageIcon, Plus, 
  Home, Settings, Info, Camera, ChevronLeft, 
  Link as LinkIcon, Save, Sparkles, Euro, History, Check
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

interface PropertyWizardProps {
  initialData?: any;
  onClose: () => void;
  onSuccess: () => void;
}

const PREDEFINED_FEATURES = [
  "Aria Condizionata", "Ascensore", "Balcone", "Terrazzo", 
  "Box Auto", "Posto Auto", "Cantina", "Giardino Privato", 
  "Domotica", "Allarme", "Piscina", "Pannelli Solari"
];

const PropertyWizard = ({ initialData, onClose, onSuccess }: PropertyWizardProps) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  
  // Form Data
  const [formData, setFormData] = useState({
    titolo: '',
    prezzo: '',
    mq: '',
    locali: 'Trilocale', 
    citta: '',
    zona: '',
    indirizzo: '',
    piano: '',
    bagni: 1,
    // New Fields
    classe_energetica: 'A1',
    stato_immobile: 'Ottimo/Ristrutturato',
    spese_condominiali: '',
    anno_costruzione: '',
    caratteristiche: [] as string[],
    // Legacy/Basic
    descrizione: '',
    stato: 'Disponibile',
    link_immobiliare: ''
  });

  // Media State
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [galleryImages, setGalleryImages] = useState<File[]>([]);
  const [galleryPreviews, setGalleryPreviews] = useState<string[]>([]);

  useEffect(() => {
    if (initialData) {
      setFormData({
        titolo: initialData.titolo || '',
        prezzo: initialData.prezzo?.toString() || '',
        mq: initialData.mq?.toString() || '',
        locali: initialData.locali || 'Trilocale',
        citta: initialData.citta || '',
        zona: initialData.zona || '',
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
        link_immobiliare: initialData.link_immobiliare || ''
      });
      if (initialData.copertina_url) setCoverPreview(initialData.copertina_url);
      if (initialData.immagini_urls) setGalleryPreviews(initialData.immagini_urls);
    }
  }, [initialData]);

  const toggleFeature = (feature: string) => {
    setFormData(prev => ({
      ...prev,
      caratteristiche: prev.caratteristiche.includes(feature)
        ? prev.caratteristiche.filter(f => f !== feature)
        : [...prev.caratteristiche, feature]
    }));
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

  /**
   * Refactored upload function to use Cloudinary API
   */
  const uploadFile = async (file: File) => {
    const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
    const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

    if (!cloudName || !uploadPreset) {
      throw new Error("Configurazione Cloudinary mancante (VITE_CLOUDINARY_CLOUD_NAME o VITE_CLOUDINARY_UPLOAD_PRESET)");
    }

    const formDataCloudinary = new FormData();
    formDataCloudinary.append('file', file);
    formDataCloudinary.append('upload_preset', uploadPreset);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      {
        method: 'POST',
        body: formDataCloudinary,
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || "Errore durante l'upload su Cloudinary");
    }

    const data = await response.json();
    return data.secure_url;
  };

  const handleSubmit = async () => {
    if (!formData.titolo || !formData.prezzo) {
      showError("Titolo e Prezzo sono obbligatori");
      setStep(1);
      return;
    }

    setLoading(true);
    try {
      let copertinaUrl = coverPreview;
      if (coverImage) {
        copertinaUrl = await uploadFile(coverImage);
      }

      const galleriaUrls = [...galleryPreviews.filter(p => p.startsWith('http'))];
      for (const file of galleryImages) {
        const url = await uploadFile(file);
        galleriaUrls.push(url);
      }

      const propertyPayload = {
        titolo: formData.titolo,
        prezzo: parseFloat(formData.prezzo) || 0,
        mq: parseInt(formData.mq) || 0,
        locali: formData.locali,
        citta: formData.citta,
        zona: formData.zona,
        indirizzo: formData.indirizzo,
        piano: formData.piano,
        bagni: formData.bagni,
        classe_energetica: formData.classe_energetica,
        stato_immobile: formData.stato_immobile,
        spese_condominiali: parseFloat(formData.spese_condominiali) || 0,
        anno_costruzione: parseInt(formData.anno_costruzione) || null,
        caratteristiche: formData.caratteristiche,
        descrizione: formData.descrizione,
        copertina_url: copertinaUrl,
        immagini_urls: galleriaUrls,
        stato: formData.stato,
        link_immobiliare: formData.link_immobiliare,
        slug: formData.titolo.toLowerCase().trim().replace(/ /g, '-').replace(/[^\w-]+/g, '')
      };

      if (initialData) {
        const { error } = await supabase.from('immobili').update(propertyPayload).eq('id', initialData.id);
        if (error) throw error;
        showSuccess("Immobile aggiornato correttamente");
      } else {
        const { error } = await supabase.from('immobili').insert([propertyPayload]);
        if (error) throw error;
        showSuccess("Immobile pubblicato con successo");
      }

      onSuccess();
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
              {initialData ? "Modifica Immobile" : "Nuovo Immobile"}
            </DialogTitle>
            <p className="text-sm text-gray-500 mt-1">Stai compilando lo step {step} di 5</p>
          </div>
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((s) => (
              <button 
                key={s} 
                onClick={() => setStep(s)}
                className={cn(
                  "h-2 rounded-full transition-all duration-300 relative group",
                  step === s ? "w-12 bg-[#94b0ab]" : "w-6 bg-gray-100 hover:bg-gray-200"
                )}
              />
            ))}
          </div>
        </div>
      </DialogHeader>

      <div className="flex-1 overflow-y-auto px-10 py-10 space-y-10">
        
        {/* Step 1: Identità */}
        {step === 1 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="space-y-1">
              <h2 className="text-xl font-bold flex items-center gap-2 text-[#1a1a1a]">
                <Home size={22} className="text-[#94b0ab]" /> Dati Principali
              </h2>
              <p className="text-sm text-gray-400">Inserisci le informazioni di base dell'annuncio.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-3 col-span-full">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Titolo dell'annuncio *</Label>
                <Input placeholder="Es: Trilocale con vista parco..." value={formData.titolo} onChange={(e) => setFormData({...formData, titolo: e.target.value})} className="rounded-2xl h-14 border-gray-100" />
              </div>
              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Prezzo (€) *</Label>
                <div className="relative">
                  <Euro className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                  <Input type="number" placeholder="0" value={formData.prezzo} onChange={(e) => setFormData({...formData, prezzo: e.target.value})} className="rounded-2xl h-14 pl-12 border-gray-100" />
                </div>
              </div>
              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Superficie (mq)</Label>
                <Input type="number" placeholder="0" value={formData.mq} onChange={(e) => setFormData({...formData, mq: e.target.value})} className="rounded-2xl h-14 border-gray-100" />
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
            </div>
          </div>
        )}

        {/* Step 2: Dati Tecnici */}
        {step === 2 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="space-y-1">
              <h2 className="text-xl font-bold flex items-center gap-2 text-[#1a1a1a]">
                <Settings size={22} className="text-[#94b0ab]" /> Dettagli Tecnici
              </h2>
              <p className="text-sm text-gray-400">Specifiche costruttive e costi di gestione.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
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
                  <Input type="number" placeholder="Es: 120" value={formData.spese_condominiali} onChange={(e) => setFormData({...formData, spese_condominiali: e.target.value})} className="rounded-2xl h-14 pl-12 border-gray-100" />
                </div>
              </div>
              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Anno di Costruzione</Label>
                <div className="relative">
                  <History className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                  <Input type="number" placeholder="Es: 2015" value={formData.anno_costruzione} onChange={(e) => setFormData({...formData, anno_costruzione: e.target.value})} className="rounded-2xl h-14 pl-12 border-gray-100" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Comfort & Dotazioni */}
        {step === 3 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="space-y-1">
              <h2 className="text-xl font-bold flex items-center gap-2 text-[#1a1a1a]">
                <Sparkles size={22} className="text-[#94b0ab]" /> Comfort e Dotazioni
              </h2>
              <p className="text-sm text-gray-400">Seleziona i servizi e le caratteristiche aggiuntive.</p>
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
          </div>
        )}

        {/* Step 4: Descrizione */}
        {step === 4 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
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
                  rows={10} 
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
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-10">
            <div className="space-y-1">
              <h2 className="text-xl font-bold flex items-center gap-2 text-[#1a1a1a]">
                <Camera size={22} className="text-[#94b0ab]" /> Foto e Galleria
              </h2>
              <p className="text-sm text-gray-400">Le immagini sono fondamentali per convertire i lead.</p>
            </div>

            <div className="space-y-4">
              <Label className="text-xs font-bold uppercase tracking-widest text-[#94b0ab]">Copertina *</Label>
              <div className={cn(
                "relative h-56 border-2 border-dashed rounded-[2rem] overflow-hidden transition-all group",
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
                    <button onClick={() => {
                      setGalleryImages(prev => prev.filter((_, idx) => idx !== i));
                      setGalleryPreviews(prev => prev.filter((_, idx) => idx !== i));
                    }} className="absolute top-2 right-2 w-8 h-8 bg-white/90 text-red-500 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
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
            </div>
          </div>
        )}
      </div>

      <DialogFooter className="px-10 py-6 border-t bg-white shrink-0 flex items-center justify-between sm:justify-between z-20">
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
              disabled={loading}
              className="border-2 border-[#94b0ab] text-[#94b0ab] hover:bg-[#94b0ab]/5 rounded-2xl px-8 h-14 font-bold"
            >
              <Save size={18} className="mr-2" /> {loading ? "Salvataggio..." : "Salva"}
            </Button>
          )}

          {step < 5 ? (
            <Button 
              onClick={() => setStep(step + 1)}
              className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-2xl px-10 h-14 shadow-lg shadow-[#94b0ab]/20 font-bold"
            >
              Avanti <ChevronRight className="ml-2" size={18} />
            </Button>
          ) : !initialData ? (
            <Button 
              onClick={handleSubmit}
              disabled={loading || !coverPreview}
              className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-2xl px-14 h-14 shadow-lg shadow-[#94b0ab]/20 font-bold"
            >
              {loading ? "Pubblicazione..." : "Pubblica Annuncio"}
            </Button>
          ) : null}
        </div>
      </DialogFooter>
    </div>
  );
};

export default PropertyWizard;