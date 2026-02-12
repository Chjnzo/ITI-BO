import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Upload, X, Check, ChevronRight, Image as ImageIcon, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { showSuccess, showError } from '@/utils/toast';
import { cn } from '@/lib/utils';

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
    citta: '',
    descrizione: '',
    stanze: '',
    classe_energetica: 'A',
    garage: false,
    giardino: false,
    balcone: false,
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
    if (!coverImage) {
      showError("La foto di copertina è obbligatoria");
      return;
    }

    setLoading(true);
    try {
      // 1. Upload Cover
      const copertinaUrl = await uploadFile(coverImage);

      // 2. Upload Gallery
      const galleriaUrls = [];
      for (const file of galleryImages) {
        const url = await uploadFile(file);
        galleriaUrls.push(url);
      }

      // 3. Save Property
      const { error } = await supabase.from('immobili').insert([{
        titolo: formData.titolo,
        prezzo: parseFloat(formData.prezzo) || 0,
        mq: parseInt(formData.mq) || 0,
        citta: formData.citta,
        descrizione: formData.descrizione,
        stanze: parseInt(formData.stanze) || 0,
        classe_energetica: formData.classe_energetica,
        garage: formData.garage,
        giardino: formData.giardino,
        balcone: formData.balcone,
        copertina_url: copertinaUrl,
        immagini_urls: galleriaUrls,
        stato: 'Disponibile'
      }]);

      if (error) throw error;

      showSuccess("Immobile pubblicato con successo!");
      onSuccess();
      onClose();
    } catch (error: any) {
      showError(error.message || "Errore durante il salvataggio");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Progress Bar */}
      <div className="flex justify-between items-center mb-8 px-4">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center flex-1 last:flex-none">
            <div className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all",
              step >= s ? "bg-[#94b0ab] text-white shadow-lg shadow-[#94b0ab]/20" : "bg-gray-100 text-gray-400"
            )}>
              {step > s ? <Check size={20} /> : s}
            </div>
            {s < 3 && (
              <div className={cn(
                "h-1 flex-1 mx-4 rounded-full",
                step > s ? "bg-[#94b0ab]" : "bg-gray-100"
              )} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Info Base */}
      {step === 1 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold text-[#1a1a1a]">Informazioni Base</h2>
            <p className="text-gray-500">I dati principali che verranno mostrati nell'anteprima.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-gray-700">Titolo Annuncio</Label>
              <Input 
                placeholder="Es: Trilocale moderno con vista" 
                value={formData.titolo}
                onChange={(e) => setFormData({...formData, titolo: e.target.value})}
                className="rounded-xl border-gray-200 focus:ring-[#94b0ab] focus:border-[#94b0ab]"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-gray-700">Prezzo (€)</Label>
              <Input 
                type="number" 
                placeholder="250000" 
                value={formData.prezzo}
                onChange={(e) => setFormData({...formData, prezzo: e.target.value})}
                className="rounded-xl border-gray-200"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-gray-700">Metri Quadri (mq)</Label>
              <Input 
                type="number" 
                placeholder="90" 
                value={formData.mq}
                onChange={(e) => setFormData({...formData, mq: e.target.value})}
                className="rounded-xl border-gray-200"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-gray-700">Città</Label>
              <Input 
                placeholder="Milano" 
                value={formData.citta}
                onChange={(e) => setFormData({...formData, citta: e.target.value})}
                className="rounded-xl border-gray-200"
              />
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Dettagli */}
      {step === 2 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold text-[#1a1a1a]">Dettagli Immobile</h2>
            <p className="text-gray-500">Caratteristiche tecniche e descrizione estesa.</p>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-gray-700">Descrizione</Label>
              <Textarea 
                placeholder="Descrivi i punti di forza dell'immobile..." 
                rows={5}
                value={formData.descrizione}
                onChange={(e) => setFormData({...formData, descrizione: e.target.value})}
                className="rounded-xl border-gray-200"
              />
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-700">Numero Stanze</Label>
                <Input 
                  type="number" 
                  value={formData.stanze}
                  onChange={(e) => setFormData({...formData, stanze: e.target.value})}
                  className="rounded-xl border-gray-200"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-700">Classe Energetica</Label>
                <select 
                  className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#94b0ab]/20"
                  value={formData.classe_energetica}
                  onChange={(e) => setFormData({...formData, classe_energetica: e.target.value})}
                >
                  {['A+', 'A', 'B', 'C', 'D', 'E', 'F', 'G'].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 pt-4">
              <div className="flex flex-col gap-2 p-4 bg-gray-50 rounded-2xl">
                <div className="flex items-center justify-between">
                  <Label htmlFor="garage" className="font-semibold">Garage</Label>
                  <Switch 
                    id="garage" 
                    checked={formData.garage}
                    onCheckedChange={(checked) => setFormData({...formData, garage: checked})}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2 p-4 bg-gray-50 rounded-2xl">
                <div className="flex items-center justify-between">
                  <Label htmlFor="giardino" className="font-semibold">Giardino</Label>
                  <Switch 
                    id="giardino" 
                    checked={formData.giardino}
                    onCheckedChange={(checked) => setFormData({...formData, giardino: checked})}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2 p-4 bg-gray-50 rounded-2xl">
                <div className="flex items-center justify-between">
                  <Label htmlFor="balcone" className="font-semibold">Balcone</Label>
                  <Switch 
                    id="balcone" 
                    checked={formData.balcone}
                    onCheckedChange={(checked) => setFormData({...formData, balcone: checked})}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Media (Refactored) */}
      {step === 3 && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold text-[#1a1a1a]">Foto e Media</h2>
            <p className="text-gray-500">La prima immagine sarà la copertina dell'annuncio.</p>
          </div>

          {/* Area 1: Copertina */}
          <div className="space-y-3">
            <Label className="text-sm font-bold uppercase tracking-wider text-gray-400">Foto Principale (Quella che si vede nelle card)</Label>
            <div 
              className={cn(
                "relative h-64 border-2 border-dashed rounded-3xl overflow-hidden transition-all group",
                coverPreview ? "border-transparent" : "border-gray-200 hover:border-[#94b0ab] bg-gray-50"
              )}
            >
              <input 
                type="file" 
                accept="image/*" 
                onChange={handleCoverChange}
                className="absolute inset-0 opacity-0 cursor-pointer z-10"
              />
              
              {coverPreview ? (
                <>
                  <img src={coverPreview} alt="Cover" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <p className="text-white font-bold">Cambia Foto Principale</p>
                  </div>
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 gap-3">
                  <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-sm">
                    <ImageIcon size={32} className="text-[#94b0ab]" />
                  </div>
                  <div className="text-center">
                    <p className="text-[#1a1a1a] font-bold">Carica Copertina</p>
                    <p className="text-xs">Trascina qui l'immagine hero</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Area 2: Galleria */}
          <div className="space-y-3">
            <Label className="text-sm font-bold uppercase tracking-wider text-gray-400">Altre foto dell'immobile</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {galleryPreviews.map((url, i) => (
                <div key={i} className="relative aspect-square rounded-2xl overflow-hidden group border border-gray-100">
                  <img src={url} alt="Gallery" className="w-full h-full object-cover" />
                  <button 
                    onClick={() => removeGalleryImage(i)}
                    className="absolute top-2 right-2 w-8 h-8 bg-white/90 backdrop-blur-sm text-red-500 rounded-xl shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
              <div className="relative aspect-square border-2 border-dashed border-gray-200 rounded-2xl hover:border-[#94b0ab] hover:bg-gray-50 transition-all flex flex-col items-center justify-center text-gray-400 gap-1 cursor-pointer">
                <input 
                  type="file" 
                  multiple 
                  accept="image/*" 
                  onChange={handleGalleryChange}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <Plus size={24} />
                <span className="text-xs font-medium">Aggiungi</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex justify-between pt-8 border-t border-gray-100">
        <Button 
          variant="ghost" 
          onClick={() => step > 1 ? setStep(step - 1) : onClose()}
          className="rounded-xl px-8 h-12 text-gray-500 font-semibold"
        >
          {step === 1 ? "Annulla" : "Indietro"}
        </Button>
        
        {step < 3 ? (
          <Button 
            onClick={() => setStep(step + 1)}
            className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl px-8 h-12 shadow-lg shadow-[#94b0ab]/20 transition-all active:scale-95"
          >
            Avanti <ChevronRight className="ml-2" size={18} />
          </Button>
        ) : (
          <Button 
            onClick={handleSubmit}
            disabled={loading || !coverImage}
            className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl px-12 h-12 shadow-lg shadow-[#94b0ab]/20 transition-all active:scale-95 disabled:opacity-50 disabled:grayscale"
          >
            {loading ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Pubblicazione...</span>
              </div>
            ) : "Pubblica Immobile"}
          </Button>
        )}
      </div>
    </div>
  );
};

export default PropertyWizard;