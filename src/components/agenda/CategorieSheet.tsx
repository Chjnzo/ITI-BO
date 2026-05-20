"use client";

import React, { useState, useEffect, useRef } from 'react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Settings2, Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { showError, showSuccess } from '@/utils/toast';
import type { TipologiaRow } from './EventFormModal';

// Darkens a hex color by `amount` (0–1)
function darkenHex(hex: string, amount = 0.18): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, Math.floor(((n >> 16) & 0xff) * (1 - amount)));
  const g = Math.max(0, Math.floor(((n >> 8) & 0xff) * (1 - amount)));
  const b = Math.max(0, Math.floor((n & 0xff) * (1 - amount)));
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

// ── TipologiaItem ─────────────────────────────────────────────────────────────

interface TipologiaItemProps {
  tipologia: TipologiaRow;
  onColor: (id: string, oldNome: string, color: string) => void;
  onRename: (id: string, oldNome: string, newNome: string) => void;
  onDelete: (id: string, nome: string) => void;
}

const TipologiaItem = ({ tipologia, onColor, onRename, onDelete }: TipologiaItemProps) => {
  const [editing, setEditing] = useState(false);
  const [nome, setNome] = useState(tipologia.nome);
  const colorInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setNome(tipologia.nome); }, [tipologia.nome]);

  const commitRename = () => {
    setEditing(false);
    onRename(tipologia.id, tipologia.nome, nome);
  };

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 group transition-colors">
      {/* Color swatch — click opens native color picker */}
      <div
        className="relative w-8 h-8 rounded-lg shrink-0 cursor-pointer shadow-sm ring-1 ring-black/10"
        style={{ backgroundColor: tipologia.colore_bg }}
        title="Clicca per cambiare colore"
        onClick={() => colorInputRef.current?.click()}
      >
        <input
          ref={colorInputRef}
          type="color"
          value={tipologia.colore_bg}
          onChange={e => onColor(tipologia.id, tipologia.nome, e.target.value)}
          className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
        />
      </div>

      {/* Name */}
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={nome}
              onChange={e => setNome(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') { setNome(tipologia.nome); setEditing(false); }
              }}
              className="flex-1 text-sm font-semibold bg-transparent border-b-2 border-[#94b0ab] outline-none py-0.5 min-w-0"
            />
            <button type="button" onMouseDown={commitRename} className="text-[#94b0ab] p-0.5 rounded">
              <Check size={13} />
            </button>
            <button type="button" onMouseDown={() => { setNome(tipologia.nome); setEditing(false); }} className="text-gray-400 p-0.5 rounded">
              <X size={13} />
            </button>
          </div>
        ) : (
          <span
            className="text-sm font-semibold text-gray-700 cursor-pointer hover:text-gray-900 flex items-center gap-1.5"
            onClick={() => setEditing(true)}
          >
            {tipologia.nome}
            <Pencil size={11} className="opacity-0 group-hover:opacity-40 transition-opacity shrink-0" />
          </span>
        )}
      </div>

      {/* Delete */}
      <button
        type="button"
        onClick={() => onDelete(tipologia.id, tipologia.nome)}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-500 p-1 rounded-lg"
        title="Elimina categoria"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
};

// ── CategorieSheet ────────────────────────────────────────────────────────────

interface CategorieSheetProps {
  onRefresh: () => void;
}

const CategorieSheet = ({ onRefresh }: CategorieSheetProps) => {
  const [open, setOpen] = useState(false);
  const [tipologie, setTipologie] = useState<TipologiaRow[]>([]);
  const [adding, setAdding] = useState(false);
  const [newNome, setNewNome] = useState('');

  const fetchTipologie = async () => {
    const { data } = await supabase
      .from('tipologie_appuntamenti')
      .select('*')
      .order('ordine');
    setTipologie((data as TipologiaRow[]) ?? []);
  };

  useEffect(() => {
    if (open) fetchTipologie();
  }, [open]);

  const handleColor = async (id: string, _oldNome: string, color: string) => {
    const border = darkenHex(color);
    setTipologie(prev =>
      prev.map(t => t.id === id ? { ...t, colore_bg: color, colore_border: border } : t),
    );
    await supabase
      .from('tipologie_appuntamenti')
      .update({ colore_bg: color, colore_border: border })
      .eq('id', id);
    onRefresh();
  };

  const handleRename = async (id: string, oldNome: string, newNome: string) => {
    const trimmed = newNome.trim();
    if (!trimmed || trimmed === oldNome) return;
    if (tipologie.some(t => t.id !== id && t.nome.toLowerCase() === trimmed.toLowerCase())) {
      showError('Nome già esistente');
      return;
    }
    const { error } = await supabase
      .from('tipologie_appuntamenti')
      .update({ nome: trimmed })
      .eq('id', id);
    if (error) { showError('Errore nel rinominare'); return; }
    // Cascade: aggiorna gli appuntamenti già creati con il vecchio nome
    await supabase
      .from('appuntamenti')
      .update({ tipologia: trimmed })
      .eq('tipologia', oldNome);
    setTipologie(prev => prev.map(t => t.id === id ? { ...t, nome: trimmed } : t));
    onRefresh();
  };

  const handleDelete = async (id: string, nome: string) => {
    const { count } = await supabase
      .from('appuntamenti')
      .select('id', { count: 'exact', head: true })
      .eq('tipologia', nome);
    if ((count ?? 0) > 0) {
      showError(`"${nome}" è usata in ${count} appuntament${count === 1 ? 'o' : 'i'} — rinomina prima`);
      return;
    }
    await supabase.from('tipologie_appuntamenti').delete().eq('id', id);
    setTipologie(prev => prev.filter(t => t.id !== id));
    onRefresh();
  };

  const handleAdd = async () => {
    const trimmed = newNome.trim();
    if (!trimmed) return;
    if (tipologie.some(t => t.nome.toLowerCase() === trimmed.toLowerCase())) {
      showError('Nome già esistente');
      return;
    }
    const ordine = (tipologie[tipologie.length - 1]?.ordine ?? 0) + 1;
    const { error } = await supabase.from('tipologie_appuntamenti').insert({
      nome: trimmed,
      colore_bg: '#6b7280',
      colore_border: '#4b5563',
      ordine,
    });
    if (error) { showError('Errore nella creazione'); return; }
    setNewNome('');
    setAdding(false);
    await fetchTipologie();
    onRefresh();
    showSuccess(`"${trimmed}" aggiunta`);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="h-11 w-11 rounded-xl border-gray-200"
          title="Gestisci categorie"
        >
          <Settings2 size={15} />
        </Button>
      </SheetTrigger>

      <SheetContent className="w-[400px] sm:w-[460px] flex flex-col gap-0 p-0 rounded-l-[2rem]">
        <SheetHeader className="px-7 pt-7 pb-5 border-b border-gray-100 shrink-0">
          <SheetTitle className="text-xl font-extrabold">Categorie appuntamenti</SheetTitle>
          <p className="text-sm text-gray-400 mt-1">
            Clicca sul colore per cambiarlo · clicca sul nome per rinominarlo
          </p>
        </SheetHeader>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
          {tipologie.map(t => (
            <TipologiaItem
              key={t.id}
              tipologia={t}
              onColor={handleColor}
              onRename={handleRename}
              onDelete={handleDelete}
            />
          ))}
        </div>

        {/* Add new */}
        <div className="px-6 py-5 border-t border-gray-100 shrink-0">
          {adding ? (
            <div className="flex gap-2">
              <Input
                autoFocus
                value={newNome}
                onChange={e => setNewNome(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleAdd();
                  if (e.key === 'Escape') { setAdding(false); setNewNome(''); }
                }}
                placeholder="Nome categoria..."
                className="rounded-xl h-10 border-gray-200 flex-1 text-sm"
              />
              <Button
                onClick={handleAdd}
                className="rounded-xl h-10 bg-[#94b0ab] hover:bg-[#7a948f] text-white font-bold px-4"
              >
                Aggiungi
              </Button>
              <Button
                variant="ghost"
                onClick={() => { setAdding(false); setNewNome(''); }}
                className="rounded-xl h-10 px-3"
              >
                <X size={14} />
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              className="w-full rounded-xl h-10 border-dashed border-gray-300 text-gray-500 hover:text-gray-700 font-semibold gap-2 text-sm"
              onClick={() => setAdding(true)}
            >
              <Plus size={14} /> Nuova categoria
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default CategorieSheet;
