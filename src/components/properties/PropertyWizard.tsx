import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { 
  Upload, X, Check, ChevronRight, Image as ImageIcon, Plus, 
  Minus, Home, MapPin, Ruler, Euro, Settings, Info, Camera 
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
  onClose: () => void;
  onSuccess: () => void;
}

const PropertyWizard = ({ onClose, onSuccess }: PropertyWizardProps) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  
  // Form Data
  const [formData, setFormData] = useState({
    titolo: '',
    prezzo: '',
    mq: '',
    locali: '', 
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
    stato: 'Disponibile'
  });

  // Media State
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [galleryImages, setGalleryImages] = useState<File[]>([]);
  const [galleryPreviews, setGalleryPreviews] = useState<string[]>([]);

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
    if (!formData.titolo || !formData.prezzo || !coverImage) {
      showError("Titolo, Prezzo e Copertina sono obbligatori");
      return;
    }

    setLoading(true);
    try {
      const copertinaUrl = await uploadFile(coverImage);
      const galleriaUrls = [];
      for (const file of galleryImages) {
        const url = await uploadFile(file);
        galleriaUrls.push(url);
      }

      const { error } = await supabase.from('immobili').insert([{
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
        slug: formData.titolo.toLowerCase().replace(/ /g, '-')
      }]);

      if (error) throw error;

      showSuccess("Immobile pubblicato con successo!");
      onSuccess();
      onClose();
    } catch (error: any) {
      showError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 1. STICKY HEADER */}
      <DialogHeader className="px-8 py-6 border-b shrink-0 bg-white">
        <div className="flex justify-between items-center">
          <div>
            <DialogTitle className="text-2xl font-bold text-[#1a1a1a]">Nuovo Immobile</DialogTitle>
            <p className="text-sm text-gray-500">Step {step} di 4</p>
          </div>
          <div className="flex items-center gap-3">
            {[1, 2, 3, 4].map((s) => (
              <div 
                key={s} 
                className={cn(
                  "w-10 h-1 rounded-full transition-all duration-300",
                  step >= s ? "bg-[#94b0ab]" : "bg-gray-100"
                )} 
              />
            ))}
          </div>
        </div>
      </DialogHeader>

      {/* 2. SCROLLABLE BODY */}
      <div className="flex-1 overflow-y-auto px-8 py-8 space-y-8">
        
        {/* Step 1: Identità */}
        {step === 1 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <div className="space-y-1">
              <h2 className="text-xl font-bold flex items-center gap-2"><Home size={20} className="text-[#94b0ab]" /> L'Identità</h2>
              <p className="text-sm text-gray-500">Dati fondamentali per le card di anteprima.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2 col-span-full">
                <Label className="text-xs font-bold uppercase text-gray-400">Titolo Annuncio *</Label>
                <Input placeholder="Es: Trilocale panoramico..." value={formData.titolo} onChange={(e) => setFormData({...formData, titolo: e.target.value})} className="rounded-xl h-12" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-gray-400">Prezzo (€) *</Label>
                <Input type="number" placeholder="0" value={formData.prezzo} onChange={(e) => setFormData({...formData, prezzo: e.target.value})} className="rounded-xl h-12" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-gray-400">Metratura (mq)</Label>
                <Input type="number" placeholder="0" value={formData.mq} onChange={(e) => setFormData({...formData, mq: e.target.value})} className="rounded-xl h-12" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-gray-400">Tipologia</Label>
                <Select onValueChange={(v) => setFormData({...formData, locali: v})} value={formData.locali}>
                  <SelectTrigger className="rounded-xl h-12"><SelectValue placeholder="Seleziona..." /></SelectTrigger>
                  <SelectContent>
                    {['Monolocale', 'Bilocale', 'Trilocale', 'Quadrilocale', 'Villa', 'Attico', 'Loft'].map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-gray-400">Città / Zona</Label>
                <Input placeholder="Es: Bergamo" value={formData.citta} onChange={(e) => setFormData({...formData, citta: e.target.value, zona: e.target.value})} className="rounded-xl h-12" />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Tecnici */}
        {step === 2 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <div className="space-y-1">
              <h2 className="text-xl font-bold flex items-center gap-2"><Settings size={20} className="text-[#94b0ab]" /> Dettagli Tecnici</h2>
              <p className="text-sm text-gray-500">Specifiche e dotazioni dell'immobile.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="space-y-2"><Label className="text-xs font-bold uppercase text-gray-400">Piano</Label><Input placeholder="Es: 1" value={formData.piano} onChange={(e) => setFormData({...formData, piano: e.target.value})} className="rounded-xl h-12" /></div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-gray-400">Bagni</Label>
                  <div className="flex items-center gap-4 bg-gray-50 p-2 rounded-xl w-fit">
                    <Button variant="ghost" size="icon" onClick={() => setFormData({...formData, bagni: Math.max(1, formData.bagni - 1)})}><Minus size={16} /></Button>
                    <span className="text-lg font-bold w-6 text-center">{formData.bagni}</span>
                    <Button variant="ghost" size="icon" onClick={() => setFormData({...formData, bagni: formData.bagni + 1})}><Plus size={16} /></Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-gray-400">Classe Energetica</Label>
                  <Select onValueChange={(v) => setFormData({...formData, classe_energetica: v})} value={formData.classe_energetica}>
                    <SelectTrigger className="rounded-xl h-12"><SelectValue /></SelectTrigger>
                    <SelectContent>{['A4', 'A', 'B', 'C', 'D', 'E', 'F', 'G'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase text-gray-400">Dotazioni</Label>
                {[{id: 'garage', label: 'Box / Garage'}, {id: 'giardino', label: 'Giardino'}, {id: 'balcone', label: 'Balcone'}].map(item => (
                  <div key={item.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                    <span className="font-semibold">{item.label}</span>
                    <Switch checked={(formData as any)[item.id]} onCheckedChange={(c) => setFormData({...formData, [item.id]: c})} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Storytelling */}
        {step === 3 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <div className="space-y-1">
              <h2 className="text-xl font-bold flex items-center gap-2"><Info size={20} className="text-[#94b0ab]" /> Storytelling</h2>
              <p className="text-sm text-gray-500">La descrizione emozionale per i potenziali acquirenti.</p>
            </div>
            <Textarea placeholder="Racconta i punti di forza..." rows={12} value={formData.descrizione} onChange={(e) => setFormData({...formData, descrizione: e.target.value})} className="rounded-2xl p-4 text-base leading-relaxed" />
          </div>
        )}

        {/* Step 4: Media (Refactored Layout) */}
        {step === 4 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 pb-10">
            <div className="space-y-1">
              <h2 className="text-xl font-bold flex items-center gap-2"><Camera size={20} className="text-[#94b0ab]" /> Galleria Media</h2>
              <p className="text-sm text-gray-500">Carica le foto. La prima è fondamentale.</p>
            </div>

            {/* Zone A: Copertina Compatta */}
            <div className="space-y-3">
              <Label className="text-xs font-bold uppercase text-[#94b0ab] tracking-wider">Immagine di Copertina (Hero) *</Label>
              <div className={cn(
                "relative min-h-[150px] aspect-video h-48 border-2 border-dashed rounded-2xl overflow-hidden transition-all group",
                coverPreview ? "border-transparent" : "border-gray-200 hover:border-[#94b0ab] bg-gray-50/50"
              )}>
                <input type="file" accept="image/*" onChange={handleCoverChange} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                {coverPreview ? (
                  <img src={coverPreview} alt="Cover" className="w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 gap-2">
                    <ImageIcon size={24} className="text-[#94b0ab]" />
                    <p className="text-xs font-bold">Carica Foto Hero</p>
                  </div>
                )}
              </div>
            </div>

            {/* Zone B: Galleria Griglia Densa */}
            <div className="space-y-3">
              <Label className="text-xs font-bold uppercase text-gray-400 tracking-wider">Galleria Fotografica</Label>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                {galleryPreviews.map((url, i) => (
                  <div key={i} className="relative aspect-square rounded-xl overflow-hidden group shadow-sm bg-gray-100">
                    <img src={url} alt="Gallery" className="w-full h-full object-cover" />
                    <button onClick={() => removeGalleryImage(i)} className="absolute top-1 right-1 w-6 h-6 bg-white/90 text-red-500 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <div className="relative aspect-square min-h-[100px] border-2 border-dashed border-gray-200 rounded-xl hover:border-[#94b0ab] hover:bg-gray-50 transition-all flex flex-col items-center justify-center text-gray-400 gap-1 cursor-pointer">
                  <input type="file" multiple accept="image/*" onChange={handleGalleryChange} className="absolute inset-0 opacity-0 cursor-pointer" />
                  <Plus size={20} />
                  <span className="text-[10px] font-bold">Aggiungi</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. STICKY FOOTER */}
      <DialogFooter className="px-8 py-5 border-t bg-gray-50/80 backdrop-blur-sm shrink-0 sm:justify-between items-center">
        <Button 
          variant="ghost" 
          onClick={() => step > 1 ? setStep(step - 1) : onClose()}
          className="rounded-xl h-11 px-6 text-gray-500 font-semibold hover:bg-white"
        >
          {step === 1 ? "Annulla" : "Indietro"}
        </Button>
        
        {step < 4 ? (
          <Button 
            onClick={() => setStep(step + 1)}
            className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl px-8 h-11 shadow-lg shadow-[#94b0ab]/20 transition-all active:scale-95"
          >
            Continua <ChevronRight className="ml-2" size={18} />
          </Button>
        ) : (
          <Button 
            onClick={handleSubmit}
            disabled={loading || !coverImage}
            className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl px-12 h-11 shadow-lg shadow-[#94b0ab]/20 transition-all active:scale-95 disabled:opacity-50"
          >
            {loading ? "Pubblicazione..." : "Pubblica Immobile"}
          </Button>
        )}
      </DialogFooter>
    </div>
  );
};

export default PropertyWizard;