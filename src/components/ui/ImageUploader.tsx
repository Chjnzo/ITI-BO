"use client";

import React, { useState, useRef } from 'react';
import { UploadCloud, Loader2, X, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { showError } from '@/utils/toast';

interface ImageUploaderProps {
  onUploadSuccess: (url: string) => void;
  onRemove?: () => void;
  defaultValue?: string;
  label?: string;
  className?: string;
}

const ImageUploader = ({ 
  onUploadSuccess, 
  onRemove, 
  defaultValue, 
  label = "Trascina qui la foto o clicca per caricare",
  className 
}: ImageUploaderProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(defaultValue || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    if (!file) return;

    const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
    const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

    if (!cloudName || !uploadPreset) {
      showError("Configurazione Cloudinary mancante (env variables)");
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', uploadPreset);

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        {
          method: 'POST',
          body: formData,
        }
      );

      if (!response.ok) throw new Error('Errore durante l\'upload');

      const data = await response.json();
      const imageUrl = data.secure_url;

      setPreview(imageUrl);
      onUploadSuccess(imageUrl);
    } catch (error) {
      console.error("Cloudinary Upload Error:", error);
      showError("Caricamento fallito. Riprova.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  };

  const removeImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPreview(null);
    if (onRemove) onRemove();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div 
      className={cn(
        "relative w-full group transition-all duration-300",
        className
      )}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <input 
        type="file" 
        className="hidden" 
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
      />

      {preview ? (
        <div className="relative h-64 w-full rounded-[2rem] overflow-hidden border-2 border-transparent shadow-md">
          <img src={preview} alt="Anteprima" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="bg-white/90 text-gray-900 px-4 py-2 rounded-xl text-sm font-bold shadow-lg"
            >
              Cambia Foto
            </button>
          </div>
          <button 
            onClick={removeImage}
            className="absolute top-4 right-4 bg-red-500 hover:bg-red-600 text-white p-2 rounded-xl shadow-lg transition-transform active:scale-90"
          >
            <X size={18} />
          </button>
        </div>
      ) : (
        <div 
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "h-64 border-2 border-dashed rounded-[2rem] flex flex-col items-center justify-center gap-4 cursor-pointer transition-all",
            "bg-gray-50/50 border-gray-200 hover:border-[#94b0ab] hover:bg-[#94b0ab]/5",
            isUploading && "pointer-events-none opacity-60"
          )}
        >
          {isUploading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="animate-spin text-[#94b0ab]" size={48} />
              <p className="text-sm font-bold text-[#94b0ab] uppercase tracking-widest">Caricamento in corso...</p>
            </div>
          ) : (
            <>
              <div className="w-16 h-16 rounded-2xl bg-white shadow-sm flex items-center justify-center text-[#94b0ab]">
                <UploadCloud size={32} />
              </div>
              <div className="text-center px-6">
                <p className="font-bold text-gray-900">{label}</p>
                <p className="text-xs text-gray-400 mt-1 uppercase tracking-tighter">PNG, JPG fino a 10MB</p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ImageUploader;