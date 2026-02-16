"use client";

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { 
  X, ChevronRight, Image as ImageIcon, Plus, 
  Minus, Home, Settings, Info, Camera, ChevronLeft, Link as LinkIcon, Save
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
    classe_energetica: 'A',
    garage: false,
    giardino: false,
    balcone: false,
    descrizione: '',
    stato: 'Disponibile',
    link_immobiliare: ''
  });

  // Media State
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [galleryImages, setGalleryImages] = useState<File[]>([]);
  const [galleryPreviews, setGalleryPreviews] = useState<string[]>([]);

  // Pre-fill data if editing
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
        classe_energetica: initialData.classe_energetica || 'A',
        garage: initialData.garage || false,
        giardino: initialData.giardino || false,
        balcone: initialData.balcone || false,
        descrizione: initialData.descrizione || '',
        stato: initialData.stato || 'Disponibile',
        link_immobiliare: initialData.link_immobiliare || ''
      });
      if (initialData.copertina_url) setCoverPreview(initialData.copertina_url);
      if (initialData.immagini_urls) setGalleryPreviews(initialData.immagini_urls);
    }
  }, [initialData]);

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

  const removeGalleryImage = (index: number) => {
    setGalleryImages(prev => prev.filter((_, i) => i !== index));
    setGalleryPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const uploadFile = async (file: File) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random()}.${fileExt}`;
    const { error: uploadError } = await supabase.storage
      .from('immobili-images')
      .upload(fileName, file);
    
    if (uploadError) throw uploadError;
    
    const { data: { publicUrl } } = supabase.storage
      .from('immobili-images')
      .getPublicUrl(fileName);
    
    return publicUrl;
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
        garage: formData.garage,
        giardino: formData.giardino,
        balcone: formData.balcone,
        descrizione: formData.descrizione,
        copertina_url: copertinaUrl,
        immagini_urls: galleriaUrls,
        stato: formData.stato,
        link_immobiliare: formData.link_immobiliare,
        slug: formData.titolo.toLowerCase().trim().replace(/ /g, '-')
      };

      if (initialData) {
        const { error } = await supabase.from('immobili').update(propertyPayload).eq('id', initialData.id);
        if (error) throw error;
        showSuccess("Immobile aggiornato con successo!");
      } else {
        const { error } = await supabase.from('immobili').insert([propertyPayload]);
        if (error) throw error;
        showSuccess("Immobile pubblicato con successo!");
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
      {/* 1. FIXED HEADER */}
      <DialogHeader className="px-10 py-8 border-b shrink-0 bg-white">
        <div className="flex justify-between items-center">
          <div>
            <DialogTitle className="text-3xl font-bold text-[#1a1a1a]">
              {initialData ? "Modifica Immobile" : "Nuovo Immobile"}
            </DialogTitle>
            <p className="text-sm text-gray-500 mt-1">Stai compilando lo step {step} di 4</p>
          </div>
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4].map((s) => (
              <button 
                key={s} 
                onClick={() => setStep(s)}
                className={cn(
                  "h-2 rounded-full transition-all duration-300 relative group",
                  step === s ? "w-12 bg-[#94b0ab]" : "w-8 bg-gray-100 hover:bg-gray-200"
                )}
              >
                 <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-black text-[#94b0ab] opacity-0 group-hover:opacity-100 transition-opacity">
                   {s}
                 </span>
              </button>
            ))}
          </div>
        </div>
      </DialogHeader>

      {/* 2. SCROLLABLE BODY */}
      <div className="flex-1 overflow-y-auto px-10 py-10 space-y-10">
        
        {/* Step 1: Identità */}
        {step === 1 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="space-y-1">
              <h2 className="text-xl font-bold flex items-center gap-2 text-[#1a1a1a]">
                <Home size={22} className="text-[#94b0ab]" /> Dati Principali
              </h2>
              <p className="text-sm text-gray-400">Le informazioni fondamentali dell'annuncio.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-3 col-span-full">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Titolo dell'annuncio *</Label>
                <Input placeholder="Es: Trilocale panoramico..." value={formData.titolo} onChange={(e) => setFormData({...formData, titolo: e.target.value})} className="rounded-2xl h-14 border-gray-100 focus:ring-[#94b0ab]" />
              </div>
              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Prezzo di Vendita (€) *</Label>
                <Input type="number" placeholder="0" value={formData.prezzo} onChange={(e) => setFormData({...formData, prezzo: e.target.value})} className="rounded-2xl h-14 border-gray-100" />
              </div>
              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Superficie (mq)</Label>
                <Input type="number" placeholder="0" value={formData.mq} onChange={(e) => setFormData({...formData, mq: e.target.value})} className="rounded-2xl h-14 border-gray-100" />
              </div>
              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Tipologia Locali</Label>
                <Select onValueChange={(v) => setFormData({...formData, locali: v})} value={formData.locali}>
                  <SelectTrigger className="rounded-2xl h-14 border-gray-100"><SelectValue placeholder="Seleziona..." /></SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    {['Monolocale', 'Bilocale', 'Trilocale', 'Quadrilocale', 'Villa', 'Attico', 'Loft'].map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Città</Label>
                <Input placeholder="Es: Bergamo" value={formData.citta} onChange={(e) => setFormData({...formData, citta: e.target.value})} className="rounded-2xl h-14 border-gray-100" />
              </div>
              <div className="space-y-3 col-span-full">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500 flex items-center gap-2">
                  <LinkIcon size={14} className="text-[#94b0ab]" /> Link Immobiliare.it
                </Label>
                <Input 
                  placeholder="Incolla il link dell'annuncio..." 
                  value={formData.link_immobiliare} 
                  onChange={(e) => setFormData({...formData, link_immobiliare: e.target.value})} 
                  className="rounded-2xl h-14 border-gray-100 focus:ring-[#94b0ab]" 
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Tecnici */}
        {step === 2 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="space-y-1">
              <h2 className="text-xl font-bold flex items-center gap-2 text-[#1a1a1a]">
                <Settings size={22} className="text-[#94b0ab]" /> Specifiche Tecniche
              </h2>
              <p className="text-sm text-gray-400">Dettagli costruttivi e dotazioni dell'immobile.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-8">
                <div className="space-y-3">
                  <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Piano</Label>
                  <Input placeholder="Es: 1, Ultimo, Terra" value={formData.piano} onChange={(e) => setFormData({...formData, piano: e.target.value})} className="rounded-2xl h-14 border-gray-100" />
                </div>
                <div className="space-y-3">
                  <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Numero Bagni</Label>
                  <div className="flex items-center gap-6 bg-gray-50/50 p-2.5 rounded-2xl w-fit border border-gray-100">
                    <Button variant="ghost" size="icon" className="rounded-xl h-10 w-10" onClick={() => setFormData({...formData, bagni: Math.max(1, formData.bagni - 1)})}><Minus size={18} /></Button>
                    <span className="text-xl font-bold w-6 text-center">{formData.bagni}</span>
                    <Button variant="ghost" size="icon" className="rounded-xl h-10 w-10" onClick={() => setFormData({...formData, bagni: formData.bagni + 1})}><Plus size={18} /></Button>
                  </div>
                </div>
                <div className="space-y-3">
                  <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Classe Energetica</Label>
                  <Select onValueChange={(v) => setFormData({...formData, classe_energetica: v})} value={formData.classe_energetica}>
                    <SelectTrigger className="rounded-2xl h-14 border-gray-100"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-2xl">
                      {['A4', 'A', 'B', 'C', 'D', 'E', 'F', 'G'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-4">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500 block mb-2">Dotazioni Incluse</Label>
                {[
                  {id: 'garage', label: 'Box / Posto Auto'}, 
                  {id: 'giardino', label: 'Giardino Privato'}, 
                  {id: 'balcone', label: 'Balcone / Terrazzo'}
                ].map(item => (
                  <div key={item.id} className="flex items-center justify-between p-5 bg-gray-50/30 border border-gray-100 rounded-[1.5rem] transition-colors hover:bg-white hover:shadow-sm">
                    <span className="font-bold text-gray-700">{item.label}</span>
                    <Switch checked={(formData as any)[item.id]} onCheckedChange={(c) => setFormData({...formData, [item.id]: c})} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Descrizione */}
        {step === 3 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="space-y-1">
              <h2 className="text-xl font-bold flex items-center gap-2 text-[#1a1a1a]">
                <Info size={22} className="text-[#94b0ab]" /> Descrizione Annuncio
              </h2>
              <p className="text-sm text-gray-400">Racconta l'immobile per catturare l'interesse.</p>
            </div>
            <Textarea 
              placeholder="Inserisci qui la descrizione completa..." 
              rows={14} 
              value={formData.descrizione} 
              onChange={(e) => setFormData({...formData, descrizione: e.target.value})} 
              className="rounded-[2rem] p-6 text-lg leading-relaxed border-gray-100 focus:ring-[#94b0ab]" 
            />
          </div>
        )}

        {/* Step 4: Media */}
        {step === 4 && (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-10">
            <div className="space-y-1">
              <h2 className="text-xl font-bold flex items-center gap-2 text-[#1a1a1a]">
                <Camera size={22} className="text-[#94b0ab]" /> Foto e Galleria
              </h2>
              <p className="text-sm text-gray-400">La copertina è l'immagine che attira i clienti.</p>
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
                    <p className="text-xs font-bold uppercase">Carica Copertina</p>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Altre Foto</Label>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-4">
                {galleryPreviews.map((url, i) => (
                  <div key={i} className="relative aspect-square rounded-[1.5rem] overflow-hidden group border border-gray-100">
                    <img src={url} alt={`Gallery ${i}`} className="w-full h-full object-cover" />
                    <button onClick={() => removeGalleryImage(i)} className="absolute top-2 right-2 w-8 h-8 bg-white/90 text-red-500 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-lg">
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

      {/* 3. FIXED FOOTER */}
      <DialogFooter className="px-10 py-6 border-t bg-white shrink-0 flex items-center justify-between sm:justify-between z-20">
        <Button 
          variant="ghost" 
          onClick={() => step > 1 ? setStep(step - 1) : onClose()}
          className="rounded-2xl h-14 px-8 text-gray-500 font-bold hover:bg-gray-50"
        >
          {step === 1 ? "Annulla" : <><ChevronLeft className="mr-2" size={18} /> Indietro</>}
        </Button>
        
        <div className="flex gap-3">
          {/* Conditional Save Button for Edit Mode */}
          {initialData && (
            <Button 
              variant="outline"
              onClick={handleSubmit}
              disabled={loading}
              className="border-2 border-[#94b0ab] text-[#94b0ab] hover:bg-[#94b0ab]/5 rounded-2xl px-8 h-14 font-bold transition-all flex items-center gap-2"
            >
              <Save size={18} /> {loading ? "Salvataggio..." : "Salva Modifiche"}
            </Button>
          )}

          {step < 4 ? (
            <Button 
              onClick={() => setStep(step + 1)}
              className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-2xl px-10 h-14 shadow-xl shadow-[#94b0ab]/20 font-bold transition-all active:scale-95"
            >
              Avanti <ChevronRight className="ml-2" size={18} />
            </Button>
          ) : !initialData ? (
            <Button 
              onClick={handleSubmit}
              disabled={loading || (!coverPreview && !coverImage)}
              className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-2xl px-14 h-14 shadow-xl shadow-[#94b0ab]/20 font-bold transition-all active:scale-95 disabled:opacity-50"
            >
              {loading ? "Pubblicazione..." : "Pubblica Immobile"}
            </Button>
          ) : null}
        </div>
      </DialogFooter>
    </div>
  );
};

export default PropertyWizard;