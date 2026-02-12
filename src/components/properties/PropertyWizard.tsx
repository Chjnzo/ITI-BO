import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Upload, X, Check, ChevronRight, ChevronLeft } from 'lucide-react';
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
  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setImages([...images, ...newFiles]);
      const newPreviews = newFiles.map(file => URL.createObjectURL(file));
      setPreviews([...previews, ...newPreviews]);
    }
  };

  const removeImage = (index: number) => {
    const newImages = [...images];
    newImages.splice(index, 1);
    setImages(newImages);
    
    const newPreviews = [...previews];
    newPreviews.splice(index, 1);
    setPreviews(newPreviews);
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      // 1. Upload Images
      const imageUrls = [];
      for (const file of images) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const { data, error: uploadError } = await supabase.storage
          .from('immobili-images')
          .upload(fileName, file);
        
        if (uploadError) throw uploadError;
        
        const { data: { publicUrl } } = supabase.storage
          .from('immobili-images')
          .getPublicUrl(fileName);
        
        imageUrls.push(publicUrl);
      }

      // 2. Save Property
      const { error } = await supabase.from('immobili').insert([{
        ...formData,
        prezzo: parseFloat(formData.prezzo),
        mq: parseInt(formData.mq),
        stanze: parseInt(formData.stanze),
        immagini_urls: imageUrls,
        stato: 'Disponibile'
      }]);

      if (error) throw error;

      showSuccess("Immobile aggiunto con successo!");
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
      <div className="flex justify-between items-center mb-8">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center flex-1 last:flex-none">
            <div className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all",
              step >= s ? "bg-[#94b0ab] text-white" : "bg-gray-100 text-gray-400"
            )}>
              {step > s ? <Check size={20} /> : s}
            </div>
            {s < 3 && (
              <div className={cn(
                "h-1 flex-1 mx-4 rounded",
                step > s ? "bg-[#94b0ab]" : "bg-gray-100"
              )} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Info Base */}
      {step === 1 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
          <h2 className="text-2xl font-bold">Informazioni Base</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Titolo Annuncio</Label>
              <Input 
                placeholder="Es: Trilocale moderno in centro" 
                value={formData.titolo}
                onChange={(e) => setFormData({...formData, titolo: e.target.value})}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Prezzo (€)</Label>
              <Input 
                type="number" 
                placeholder="250000" 
                value={formData.prezzo}
                onChange={(e) => setFormData({...formData, prezzo: e.target.value})}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Metri Quadri (mq)</Label>
              <Input 
                type="number" 
                placeholder="90" 
                value={formData.mq}
                onChange={(e) => setFormData({...formData, mq: e.target.value})}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Città</Label>
              <Input 
                placeholder="Milano" 
                value={formData.citta}
                onChange={(e) => setFormData({...formData, citta: e.target.value})}
                className="rounded-xl"
              />
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Dettagli */}
      {step === 2 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
          <h2 className="text-2xl font-bold">Dettagli Immobile</h2>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Descrizione</Label>
              <Textarea 
                placeholder="Descrivi l'immobile..." 
                rows={4}
                value={formData.descrizione}
                onChange={(e) => setFormData({...formData, descrizione: e.target.value})}
                className="rounded-xl"
              />
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Numero Stanze</Label>
                <Input 
                  type="number" 
                  value={formData.stanze}
                  onChange={(e) => setFormData({...formData, stanze: e.target.value})}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Classe Energetica</Label>
                <select 
                  className="w-full h-10 px-3 rounded-xl border border-input bg-background"
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
              <div className="flex items-center space-x-2">
                <Switch 
                  id="garage" 
                  checked={formData.garage}
                  onCheckedChange={(checked) => setFormData({...formData, garage: checked})}
                />
                <Label htmlFor="garage">Garage</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch 
                  id="giardino" 
                  checked={formData.giardino}
                  onCheckedChange={(checked) => setFormData({...formData, giardino: checked})}
                />
                <Label htmlFor="giardino">Giardino</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch 
                  id="balcone" 
                  checked={formData.balcone}
                  onCheckedChange={(checked) => setFormData({...formData, balcone: checked})}
                />
                <Label htmlFor="balcone">Balcone</Label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Media */}
      {step === 3 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
          <h2 className="text-2xl font-bold">Foto e Media</h2>
          <div className="border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center hover:border-[#94b0ab] transition-colors cursor-pointer relative">
            <input 
              type="file" 
              multiple 
              accept="image/*" 
              onChange={handleImageChange}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
            <Upload className="mx-auto text-gray-400 mb-4" size={48} />
            <p className="text-lg font-medium">Trascina qui le foto o clicca per selezionarle</p>
            <p className="text-sm text-gray-400">Supporta JPG, PNG (max 5MB per foto)</p>
          </div>

          {previews.length > 0 && (
            <div className="grid grid-cols-3 md:grid-cols-4 gap-4">
              {previews.map((url, i) => (
                <div key={i} className="relative aspect-square rounded-xl overflow-hidden group">
                  <img src={url} alt="Preview" className="w-full h-full object-cover" />
                  <button 
                    onClick={() => removeImage(i)}
                    className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex justify-between pt-8 border-t border-gray-100">
        <Button 
          variant="ghost" 
          onClick={() => step > 1 ? setStep(step - 1) : onClose()}
          className="rounded-xl px-8"
        >
          {step === 1 ? "Annulla" : "Indietro"}
        </Button>
        
        {step < 3 ? (
          <Button 
            onClick={() => setStep(step + 1)}
            className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl px-8"
          >
            Avanti <ChevronRight className="ml-2" size={18} />
          </Button>
        ) : (
          <Button 
            onClick={handleSubmit}
            disabled={loading || images.length === 0}
            className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl px-8"
          >
            {loading ? "Salvataggio..." : "Pubblica Immobile"}
          </Button>
        )}
      </div>
    </div>
  );
};

export default PropertyWizard;