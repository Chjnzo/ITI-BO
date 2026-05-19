"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Plus, Pencil, Trash2, X, Check, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import { ImmobileUnita } from "@/types";

interface UnitaSheetProps {
  property: { id: string; titolo: string };
  onClose: () => void;
}

const TIPOLOGIE_UNITA = ['Monolocale','Bilocale','Trilocale','Quadrilocale','Pentalocale+','Attico','Loft'];
const PIANI = ['Piano Terra','1° Piano','2° Piano','3° Piano','4° Piano','5° Piano','6° Piano','7° Piano','8° Piano','9° Piano','10° Piano+'];

const DEFAULT_FORM = {
  tipologia: 'Trilocale',
  superficie_mq: '',
  piano: '',
  bagni: '1',
  camere: '2',
  terrazzo: false,
  prezzo: '',
  prezzoSuRichiesta: false,
  stato: 'Disponibile' as 'Disponibile' | 'Riservato' | 'Venduto',
};

const STATO_COLORS: Record<string, string> = {
  Disponibile: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  Riservato:   'bg-amber-50 text-amber-700 border-amber-100',
  Venduto:     'bg-gray-100 text-gray-500 border-gray-200',
};

const UnitaSheet = ({ property, onClose }: UnitaSheetProps) => {
  const [unita, setUnita] = useState<ImmobileUnita[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);

  const fetchUnita = useCallback(async () => {
    const { data, error } = await supabase
      .from('immobile_unita')
      .select('*')
      .eq('immobile_id', property.id)
      .order('created_at', { ascending: true });
    if (error) showError('Errore caricamento unità');
    else setUnita((data ?? []) as ImmobileUnita[]);
    setLoading(false);
  }, [property.id]);

  useEffect(() => { fetchUnita(); }, [fetchUnita]);

  const openAddForm = () => {
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setFormOpen(true);
  };

  const openEditForm = (u: ImmobileUnita) => {
    setEditingId(u.id);
    setForm({
      tipologia: u.tipologia,
      superficie_mq: String(u.superficie_mq),
      piano: u.piano,
      bagni: String(u.bagni),
      camere: String(u.camere),
      terrazzo: u.terrazzo,
      prezzo: u.prezzo ? String(u.prezzo) : '',
      prezzoSuRichiesta: u.prezzo === null,
      stato: u.stato,
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.superficie_mq || !form.piano) {
      showError('Superficie e piano sono obbligatori');
      return;
    }
    setSaving(true);
    const payload = {
      immobile_id: property.id,
      tipologia: form.tipologia,
      superficie_mq: parseInt(form.superficie_mq) || 0,
      piano: form.piano,
      bagni: parseInt(form.bagni) || 1,
      camere: parseInt(form.camere) || 1,
      terrazzo: form.terrazzo,
      prezzo: form.prezzoSuRichiesta ? null : (parseInt(form.prezzo) || null),
      stato: form.stato,
    };

    if (editingId) {
      const { error } = await supabase.from('immobile_unita').update(payload).eq('id', editingId);
      if (error) { showError(error.message); setSaving(false); return; }
      showSuccess('Unità aggiornata');
    } else {
      const { error } = await supabase.from('immobile_unita').insert([payload]);
      if (error) { showError(error.message); setSaving(false); return; }
      showSuccess('Unità aggiunta');
    }
    setSaving(false);
    setFormOpen(false);
    setEditingId(null);
    setForm(DEFAULT_FORM);
    fetchUnita();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('immobile_unita').delete().eq('id', id);
    if (error) showError(error.message);
    else { showSuccess('Unità rimossa'); fetchUnita(); }
  };

  const counts = {
    disponibili: unita.filter(u => u.stato === 'Disponibile').length,
    riservate: unita.filter(u => u.stato === 'Riservato').length,
    vendute: unita.filter(u => u.stato === 'Venduto').length,
  };

  const formatPrezzo = (p: number | null) =>
    p ? `€ ${p.toLocaleString('it-IT')}` : 'Su richiesta';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between px-8 py-6 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#94b0ab]/10 flex items-center justify-center">
            <Building2 size={20} className="text-[#94b0ab]" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 leading-tight">Gestione Unità</h2>
            <p className="text-sm text-gray-400 truncate max-w-[360px]">{property.titolo}</p>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-300 hover:text-gray-600 transition-colors mt-1">
          <X size={20} />
        </button>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 px-8 py-4 bg-gray-50/50 border-b border-gray-100 shrink-0">
        <span className="text-sm font-bold text-gray-700">{unita.length} unità totali</span>
        <div className="flex items-center gap-2 ml-auto">
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border bg-emerald-50 text-emerald-700 border-emerald-100">
            {counts.disponibili} disponibili
          </span>
          {counts.riservate > 0 && (
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border bg-amber-50 text-amber-700 border-amber-100">
              {counts.riservate} riservate
            </span>
          )}
          {counts.vendute > 0 && (
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border bg-gray-100 text-gray-500 border-gray-200">
              {counts.vendute} vendute
            </span>
          )}
        </div>
        <Button
          size="sm"
          onClick={openAddForm}
          className="rounded-xl bg-[#94b0ab] hover:bg-[#83a09b] text-white ml-2"
        >
          <Plus size={14} className="mr-1" /> Aggiungi Unità
        </Button>
      </div>

      {/* Form (collapsible) */}
      {formOpen && (
        <div className="border-b border-gray-100 bg-blue-50/30 px-8 py-5 shrink-0">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-gray-700">
              {editingId ? 'Modifica unità' : 'Nuova unità'}
            </h3>
            <button onClick={() => { setFormOpen(false); setEditingId(null); }} className="text-gray-400 hover:text-gray-600">
              <ChevronUp size={16} />
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {/* Tipologia */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Tipologia</Label>
              <Select value={form.tipologia} onValueChange={(v) => setForm(f => ({ ...f, tipologia: v }))}>
                <SelectTrigger className="h-10 rounded-xl border-gray-200 bg-white text-sm"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-xl">
                  {TIPOLOGIE_UNITA.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {/* Piano */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Piano *</Label>
              <Select value={form.piano} onValueChange={(v) => setForm(f => ({ ...f, piano: v }))}>
                <SelectTrigger className="h-10 rounded-xl border-gray-200 bg-white text-sm"><SelectValue placeholder="Seleziona..." /></SelectTrigger>
                <SelectContent className="rounded-xl">
                  {PIANI.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {/* Superficie */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Superficie (mq) *</Label>
              <Input
                type="number" min={1} placeholder="65"
                value={form.superficie_mq}
                onChange={(e) => setForm(f => ({ ...f, superficie_mq: e.target.value }))}
                onWheel={(e) => e.currentTarget.blur()}
                className="h-10 rounded-xl border-gray-200 bg-white text-sm"
              />
            </div>
            {/* Camere */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Camere</Label>
              <Input
                type="number" min={1} placeholder="2"
                value={form.camere}
                onChange={(e) => setForm(f => ({ ...f, camere: e.target.value }))}
                onWheel={(e) => e.currentTarget.blur()}
                className="h-10 rounded-xl border-gray-200 bg-white text-sm"
              />
            </div>
            {/* Bagni */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Bagni</Label>
              <Input
                type="number" min={1} placeholder="1"
                value={form.bagni}
                onChange={(e) => setForm(f => ({ ...f, bagni: e.target.value }))}
                onWheel={(e) => e.currentTarget.blur()}
                className="h-10 rounded-xl border-gray-200 bg-white text-sm"
              />
            </div>
            {/* Stato */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Stato</Label>
              <Select value={form.stato} onValueChange={(v: any) => setForm(f => ({ ...f, stato: v }))}>
                <SelectTrigger className="h-10 rounded-xl border-gray-200 bg-white text-sm"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="Disponibile">Disponibile</SelectItem>
                  <SelectItem value="Riservato">Riservato</SelectItem>
                  <SelectItem value="Venduto">Venduto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Prezzo */}
            <div className="space-y-1.5 col-span-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Prezzo (€)</Label>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, prezzoSuRichiesta: !f.prezzoSuRichiesta, prezzo: '' }))}
                  className={cn(
                    "text-[10px] font-bold px-2.5 py-0.5 rounded-full border transition-all",
                    form.prezzoSuRichiesta
                      ? "bg-[#94b0ab]/10 border-[#94b0ab] text-[#94b0ab]"
                      : "bg-white border-gray-200 text-gray-400"
                  )}
                >
                  Su richiesta
                </button>
              </div>
              <Input
                type="number" min={0} placeholder="250000"
                value={form.prezzoSuRichiesta ? '' : form.prezzo}
                onChange={(e) => setForm(f => ({ ...f, prezzo: e.target.value }))}
                onWheel={(e) => e.currentTarget.blur()}
                disabled={form.prezzoSuRichiesta}
                className={cn("h-10 rounded-xl border-gray-200 bg-white text-sm", form.prezzoSuRichiesta && "opacity-40 cursor-not-allowed")}
              />
            </div>
            {/* Terrazzo */}
            <div className="space-y-1.5 flex flex-col justify-end">
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, terrazzo: !f.terrazzo }))}
                className={cn(
                  "h-10 rounded-xl border text-sm font-semibold flex items-center justify-center gap-2 transition-all",
                  form.terrazzo
                    ? "bg-[#94b0ab]/10 border-[#94b0ab] text-[#94b0ab]"
                    : "bg-white border-gray-200 text-gray-400"
                )}
              >
                {form.terrazzo && <Check size={14} />}
                Terrazzo
              </button>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => { setFormOpen(false); setEditingId(null); }}>
              Annulla
            </Button>
            <Button size="sm" disabled={saving} onClick={handleSave} className="rounded-xl bg-[#94b0ab] hover:bg-[#83a09b] text-white">
              {saving ? 'Salvataggio...' : (editingId ? 'Aggiorna' : 'Aggiungi')}
            </Button>
          </div>
        </div>
      )}

      {/* Unit list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : unita.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-300">
            <Building2 size={48} className="mb-3 opacity-40" />
            <p className="text-sm font-medium">Nessuna unità ancora inserita</p>
            <p className="text-xs mt-1 opacity-70">Clicca "Aggiungi Unità" per iniziare</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Tipologia</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Piano</th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-gray-400 uppercase tracking-widest">MQ</th>
                <th className="px-4 py-3 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">Camere</th>
                <th className="px-4 py-3 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">Bagni</th>
                <th className="px-4 py-3 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">Terrazzo</th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-gray-400 uppercase tracking-widest">Prezzo</th>
                <th className="px-4 py-3 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">Stato</th>
                <th className="px-6 py-3 text-right text-[10px] font-bold text-gray-400 uppercase tracking-widest">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {unita.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50/40 transition-colors">
                  <td className="px-6 py-4 font-semibold text-gray-800">{u.tipologia}</td>
                  <td className="px-4 py-4 text-gray-500">{u.piano}</td>
                  <td className="px-4 py-4 text-right font-medium text-gray-700">{u.superficie_mq} m²</td>
                  <td className="px-4 py-4 text-center text-gray-500">{u.camere}</td>
                  <td className="px-4 py-4 text-center text-gray-500">{u.bagni}</td>
                  <td className="px-4 py-4 text-center">
                    {u.terrazzo ? <Check size={14} className="text-[#94b0ab] mx-auto" /> : <span className="text-gray-200">—</span>}
                  </td>
                  <td className="px-4 py-4 text-right font-bold text-gray-800">{formatPrezzo(u.prezzo)}</td>
                  <td className="px-4 py-4 text-center">
                    <span className={cn("px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border", STATO_COLORS[u.stato])}>
                      {u.stato}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEditForm(u)} className="text-gray-300 hover:text-[#94b0ab] transition-colors">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => handleDelete(u.id)} className="text-gray-300 hover:text-red-400 transition-colors">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default UnitaSheet;
