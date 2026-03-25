import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { showSuccess, showError } from '@/utils/toast';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface AgentProfile {
  id: string;
  nome_completo: string | null;
  colore_calendario: string | null;
  avatar_url: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  profile: AgentProfile;
  userId: string;
  onSaved: (updated: AgentProfile) => void;
}

const PRESET_COLORS = [
  '#94b0ab', '#7c9e98', '#b8cfc9', // brand tones
  '#a8b9d4', '#8ba3c4', '#6b87b0', // blues
  '#c4a8b8', '#b08ba3', '#9a6f8e', // mauves
  '#c4b8a8', '#b0a08b', '#9a896f', // warm neutrals
  '#a8c4a8', '#8bb08b', '#6f9a6f', // greens
  '#c4c4a8', '#b0b08b', '#9a9a6f', // olive
];

const ProfileSettingsSheet = ({ open, onClose, profile, userId, onSaved }: Props) => {
  const [nome, setNome] = useState(profile.nome_completo ?? '');
  const [colore, setColore] = useState(profile.colore_calendario ?? '#94b0ab');
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? '');
  const [saving, setSaving] = useState(false);

  // Sync form when profile changes (e.g. on first load)
  useEffect(() => {
    setNome(profile.nome_completo ?? '');
    setColore(profile.colore_calendario ?? '#94b0ab');
    setAvatarUrl(profile.avatar_url ?? '');
  }, [profile]);

  const initials = nome
    ? nome.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      nome_completo: nome.trim() || null,
      colore_calendario: colore,
      avatar_url: avatarUrl.trim() || null,
    };
    const { error } = await supabase
      .from('profili_agenti')
      .update(payload)
      .eq('id', userId);

    setSaving(false);
    if (error) {
      showError('Errore durante il salvataggio.');
      return;
    }
    showSuccess('Profilo aggiornato.');
    onSaved({ id: userId, ...payload });
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-0 p-0 overflow-y-auto">

        {/* Header */}
        <div className="p-6 pb-4 border-b border-gray-100">
          <SheetHeader>
            <SheetTitle className="text-xl font-bold">Il tuo profilo</SheetTitle>
            <SheetDescription>
              Aggiorna nome, colore e immagine del profilo.
            </SheetDescription>
          </SheetHeader>

          {/* Avatar preview */}
          <div className="flex justify-center mt-6">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center text-white font-bold text-2xl overflow-hidden select-none shadow-md"
              style={{ backgroundColor: avatarUrl ? 'transparent' : colore }}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={nome}
                  className="w-full h-full object-cover"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                initials
              )}
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="flex-1 p-6 space-y-6">

          {/* Nome */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">
              Nome completo
            </label>
            <Input
              value={nome}
              onChange={e => setNome(e.target.value)}
              placeholder="Es. Matteo Rossi"
              className="rounded-xl border-gray-200"
            />
          </div>

          {/* Colore calendario */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">
              Colore calendario
            </label>
            <div className="grid grid-cols-6 gap-2">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColore(c)}
                  className={cn(
                    'w-9 h-9 rounded-full transition-all border-2',
                    colore === c ? 'border-gray-800 scale-110' : 'border-transparent hover:scale-105'
                  )}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
            {/* Custom color input */}
            <div className="flex items-center gap-3 mt-1">
              <input
                type="color"
                value={colore}
                onChange={e => setColore(e.target.value)}
                className="w-9 h-9 rounded-full cursor-pointer border-0 bg-transparent p-0"
                title="Colore personalizzato"
              />
              <span className="text-sm text-gray-400 font-mono">{colore}</span>
            </div>
          </div>

          {/* Avatar URL */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">
              URL immagine profilo
            </label>
            <Input
              value={avatarUrl}
              onChange={e => setAvatarUrl(e.target.value)}
              placeholder="https://..."
              className="rounded-xl border-gray-200 font-mono text-sm"
            />
            <p className="text-xs text-gray-400">
              Incolla l'URL di un'immagine pubblica (es. da Google Drive, Cloudinary, ecc.)
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 pt-4 border-t border-gray-100">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-[#94b0ab] hover:bg-[#7c9e98] text-white font-bold py-3 rounded-2xl transition-colors disabled:opacity-60"
          >
            {saving ? 'Salvataggio...' : 'Salva modifiche'}
          </button>
        </div>

      </SheetContent>
    </Sheet>
  );
};

export default ProfileSettingsSheet;
