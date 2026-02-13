import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
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
    locali: '', // Tipologia
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
    <div className="space-y-8">
      {/* Step Header */}
      <div className="flex justify-between items-center mb-8 px-4">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className="flex items-center flex-1 last:flex-none">
            <div className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all duration-300",
              step >= s ? "bg-[#94b0ab] text-white shadow-lg shadow-[#94b0ab]/20" : "bg-gray-100 text-gray-400"
            )}>
              {step > s ? <Check size={20} /> : s}
            </div>
            {s < 4 && (
              <div className={cn(
                "h-1 flex-1 mx-4 rounded-full transition-all duration-500",
                step > s ? "bg-[#94b0ab]" : "bg-gray-100"
              )} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Identità */}
      {step === 1 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold text-[#1a1a1a] flex items-center gap-2">
              <Home className="text-[#94b0ab]" size={24} /> L'Identità
            </h2>
            <p className="text-gray-500">Informazioni essenziali per la card dell'annuncio.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2 col-span-full">
              <Label className="text-sm font-semibold">Titolo Annuncio *</Label>
              <Input 
                placeholder="Es: Trilocale panoramico con terrazzo vivibile" 
                value={formData.titolo}
                onChange={(e) => setFormData({...formData, titolo: e.target.value})}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Prezzo (€) *</Label>
              <Input 
                type="number" 
                placeholder="0" 
                value={formData.prezzo}
                onChange={(e) => setFormData({...formData, prezzo: e.target.value})}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Metratura (mq)</Label>
              <Input 
                type="number" 
                placeholder="0" 
                value={formData.mq}
                onChange={(e) => setFormData({...formData, mq: e.target.value})}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Tipologia</Label>
              <Select onValueChange={(v) => setFormData({...formData, locali: v})} value={formData.locali}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Seleziona tipologia" />
                </SelectTrigger>
                <SelectContent>
                  {['Monolocale', 'Bilocale', 'Trilocale', 'Quadrilocale', 'Villa', 'Attico', 'Loft'].map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Città / Zona</Label>
              <Input 
                placeholder="Es: Bergamo Centro" 
                value={formData.citta}
                onChange={(e) => setFormData({...formData, citta: e.target.value, zona: e.target.value})}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2 col-span-full">
              <Label className="text-sm font-semibold">Indirizzo (Per uso interno)</Label>
              <Input 
                placeholder="Via Roma, 12" 
                value={formData.indirizzo}
                onChange={(e) => setFormData({...formData, indirizzo: e.target.value})}
                className="rounded-xl"
              />
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Dettagli Tecnici */}
      {step === 2 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold text-[#1a1a1a] flex items-center gap-2">
              <Settings className="text-[#94b0ab]" size={24} /> Dettagli Tecnici
            </h2>
            <p className="text-gray-500">Dati per le specifiche tecniche e l'accordion.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Piano</Label>
                <Input 
                  placeholder="Es: Terra, 1, Ultimo" 
                  value={formData.piano}
                  onChange={(e) => setFormData({...formData, piano: e.target.value})}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Numero Bagni</Label>
                <div className="flex items-center gap-4">
                  <Button 
                    variant="outline" size="icon" className="rounded-lg"
                    onClick={() => setFormData({...formData, bagni: Math.max(1, formData.bagni - 1)})}
                  >
                    <Minus size={16} />
                  </Button>
                  <span className="text-xl font-bold w-8 text-center">{formData.bagni}</span>
                  <Button 
                    variant="outline" size="icon" className="rounded-lg"
                    onClick={() => setFormData({...formData, bagni: formData.bagni + 1})}
                  >
                    <Plus size={16} />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Classe Energetica</Label>
                <Select onValueChange={(v) => setFormData({...formData, classe_energetica: v})} value={formData.classe_energetica}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['A4', 'A', 'B', 'C', 'D', 'E', 'F', 'G'].map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-4">
              <Label className="text-sm font-semibold block mb-2">Dotazioni</Label>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                  <div className="flex flex-col">
                    <span className="font-semibold">Box / Garage</span>
                    <span className="text-xs text-gray-400">Include posto auto</span>
                  </div>
                  <Switch 
                    checked={formData.garage}
                    onCheckedChange={(c) => setFormData({...formData, garage: c})}
                  />
                </div>
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                  <div className="flex flex-col">
                    <span className="font-semibold">Giardino</span>
                    <span className="text-xs text-gray-400">Privato o condominiale</span>
                  </div>
                  <Switch 
                    checked={formData.giardino}
                    onCheckedChange={(c) => setFormData({...formData, giardino: c})}
                  />
                </div>
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                  <div className="flex flex-col">
                    <span className="font-semibold">Balcone</span>
                    <span className="text-xs text-gray-400">Terrazzi o balconi</span>
                  </div>
                  <Switch 
                    checked={formData.balcone}
                    onCheckedChange={(c) => setFormData({...formData, balcone: c})}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Storytelling */}
      {step === 3 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold text-[#1a1a1a] flex items-center gap-2">
              <Info className="text-[#94b0ab]" size={24} /> Storytelling
            </h2>
            <p className="text-gray-500">La descrizione che emozionerà il potenziale acquirente.</p>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Descrizione Estesa</Label>
              <Textarea 
                placeholder="Racconta i punti di forza dell'immobile, l'esposizione, le finiture..." 
                rows={10}
                value={formData.descrizione}
                onChange={(e) => setFormData({...formData, descrizione: e.target.value})}
                className="rounded-2xl border-gray-200 focus:ring-[#94b0ab]"
              />
            </div>
            <div className="p-4 bg-blue-50 text-blue-700 rounded-2xl text-sm">
              <strong>Consiglio:</strong> Una descrizione dettagliata aumenta del 40% la probabilità di ricevere lead qualificati.
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Media Gallery */}
      {step === 4 && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold text-[#1a1a1a] flex items-center gap-2">
              <Camera className="text-[#94b0ab]" size={24} /> Galleria Media
            </h2>
            <p className="text-gray-500">Carica le foto. La prima è fondamentale!</p>
          </div>

          <div className="space-y-8">
            {/* Zone A: Copertina */}
            <div className="space-y-4">
              <Label className="text-xs font-bold uppercase tracking-widest text-[#94b0ab]">Immagine di Copertina (Hero)</Label>
              <div 
                className={cn(
                  "relative h-72 border-2 border-dashed rounded-3xl overflow-hidden transition-all group",
                  coverPreview ? "border-transparent" : "border-gray-200 hover:border-[#94b0ab] bg-gray-50/50"
                )}
              >
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={handleCoverChange}
                  className="absolute inset-0 opacity-0 cursor-pointer z-10"
                />
                
                {coverPreview ? (
                  <div className="relative w-full h-full">
                    <img src={coverPreview} alt="Cover" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="bg-white text-black px-4 py-2 rounded-full font-bold text-sm">Cambia Copertina</div>
                    </div>
                  </div>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 gap-4">
                    <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-sm">
                      <ImageIcon size={32} className="text-[#94b0ab]" />
                    </div>
                    <div className="text-center">
                      <p className="text-[#1a1a1a] font-bold">Carica Immagine Hero</p>
                      <p className="text-xs">Usa una foto luminosa dell'esterno o del living</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Zone B: Galleria */}
            <div className="space-y-4">
              <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Galleria Fotografica (Il Tour)</Label>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {galleryPreviews.map((url, i) => (
                  <div key={i} className="relative aspect-square rounded-2xl overflow-hidden group shadow-sm">
                    <img src={url} alt={`Gallery ${i}`} className="w-full h-full object-cover" />
                    <button 
                      onClick={() => removeGalleryImage(i)}
                      className="absolute top-2 right-2 w-8 h-8 bg-white/90 backdrop-blur-sm text-red-500 rounded-xl shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
                <div className="relative aspect-square border-2 border-dashed border-gray-200 rounded-2xl hover:border-[#94b0ab] hover:bg-gray-50 transition-all flex flex-col items-center justify-center text-gray-400 gap-2 cursor-pointer">
                  <input 
                    type="file" 
                    multiple 
                    accept="image/*" 
                    onChange={handleGalleryChange}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <Plus size={24} />
                  <span className="text-xs font-bold">Aggiungi</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Footer */}
      <div className="flex justify-between pt-8 border-t border-gray-100">
        <Button 
          variant="ghost" 
          onClick={() => step > 1 ? setStep(step - 1) : onClose()}
          className="rounded-xl px-8 h-12 text-gray-500 font-semibold"
        >
          {step === 1 ? "Annulla" : "Indietro"}
        </Button>
        
        {step < 4 ? (
          <Button 
            onClick={() => setStep(step + 1)}
            className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl px-10 h-12 shadow-lg shadow-[#94b0ab]/20 transition-all active:scale-95"
          >
            Continua <ChevronRight className="ml-2" size={18} />
          </Button>
        ) : (
          <Button 
            onClick={handleSubmit}
            disabled={loading || !coverImage}
            className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl px-14 h-12 shadow-lg shadow-[#94b0ab]/20 transition-all active:scale-95 disabled:opacity-50"
          >
            {loading ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Pubblicazione...</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Check size={20} />
                <span>Pubblica Immobile</span>
              </div>
            )}
          </Button>
        )}
      </div>
    </div>
  );
};

export default PropertyWizard;