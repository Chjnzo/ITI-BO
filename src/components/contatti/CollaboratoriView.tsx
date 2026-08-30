"use client";

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { showError, showSuccess } from '@/utils/toast';
import { z } from 'zod';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Phone, User, Search, Save, X, Plus, Trash2, Briefcase, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CollaboratoreRecord {
  id?: string;
  nome: string;
  cognome?: string | null;
  email?: string | null;
  telefono?: string | null;
  professione?: string | null;
  note_interne?: string | null;
  is_deleted?: boolean;
  deleted_at?: string | null;
  created_at?: string;
}

const safeFormat = (date: string | number | Date | null | undefined, fmt: string, options?: object): string => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return format(d, fmt, options);
};

const CollaboratoreValidationSchema = z.object({
  nome: z.string().max(100).optional().or(z.literal('')),
  cognome: z.string().max(100).optional().or(z.literal('')),
  email: z.string().email('Email non valida').optional().or(z.literal('')),
  telefono: z.string().optional(),
}).refine(
  (data) => (data.nome?.trim() ?? '').length > 0 || (data.cognome?.trim() ?? '').length > 0,
  { message: 'Inserisci almeno il nome o il cognome' },
);

const CollaboratoriView = () => {
  const [collaboratori, setCollaboratori] = useState<CollaboratoreRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selected, setSelected] = useState<CollaboratoreRecord | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [toDelete, setToDelete] = useState<{ id: string; nome: string; cognome?: string | null } | null>(null);

  const fetchCollaboratori = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('collaboratori')
      .select('id, nome, cognome, email, telefono, professione, note_interne, contatti(created_at)')
      .eq('is_deleted', false)
      .order('created_at', { ascending: false, foreignTable: 'contatti' });
    if (signal?.aborted) return;
    if (error) {
      showError('Errore nel caricamento collaboratori');
    } else {
      const rows = (data || []).map((r) => {
        const row = r as unknown as CollaboratoreRecord & { contatti?: { created_at?: string } };
        return { ...row, created_at: row.contatti?.created_at };
      });
      setCollaboratori(rows);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchCollaboratori(controller.signal);
    return () => controller.abort();
  }, [fetchCollaboratori]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return collaboratori;
    const tokens = q.split(/\s+/).filter(Boolean);
    return collaboratori.filter((c) => {
      const fullName = `${c.nome ?? ''} ${c.cognome ?? ''}`.toLowerCase();
      const phoneNorm = (c.telefono ?? '').replace(/[\s-]/g, '');
      return tokens.every((token) => {
        const tokenPhone = token.replace(/[\s-]/g, '');
        return (
          fullName.includes(token) ||
          c.email?.toLowerCase().includes(token) ||
          (tokenPhone && phoneNorm.includes(tokenPhone)) ||
          c.professione?.toLowerCase().includes(token) ||
          c.note_interne?.toLowerCase().includes(token)
        );
      });
    });
  }, [collaboratori, searchQuery]);

  const openCreateModal = () => setSelected({ nome: '', cognome: '', email: '', telefono: '', professione: '' });
  const openEditModal = (c: CollaboratoreRecord) => setSelected(c);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;

    const validation = CollaboratoreValidationSchema.safeParse({
      nome: selected.nome?.trim() ?? '',
      cognome: selected.cognome?.trim() ?? '',
      email: selected.email ?? '',
      telefono: selected.telefono ?? '',
    });
    if (!validation.success) {
      showError(validation.error.errors[0].message);
      return;
    }

    const isCreateMode = !selected.id;
    const payload = {
      nome: selected.nome.trim(),
      cognome: selected.cognome?.trim() || null,
      email: selected.email || null,
      telefono: selected.telefono || null,
      professione: selected.professione || null,
      note_interne: selected.note_interne || null,
    };

    setIsSaving(true);

    if (isCreateMode) {
      // Two-step insert: contatti first (base row), then collaboratori with the
      // same id. No automatic rollback if the second insert fails — surfaced
      // via showError. collaboratori has no _version column (plain update).
      const { data: contatto, error: contattoError } = await supabase
        .from('contatti')
        .insert({})
        .select()
        .single();

      if (contattoError || !contatto) {
        showError('Errore nella creazione del contatto: ' + (contattoError?.message ?? ''));
        setIsSaving(false);
        return;
      }

      const { error } = await supabase
        .from('collaboratori')
        .insert({ id: contatto.id, ...payload });

      if (error) {
        showError('Errore nella creazione: ' + error.message);
      } else {
        showSuccess('Collaboratore creato correttamente');
        fetchCollaboratori();
        setSelected(null);
      }
    } else {
      const { error } = await supabase
        .from('collaboratori')
        .update(payload)
        .eq('id', selected.id);

      if (error) {
        showError('Errore nel salvataggio');
      } else {
        showSuccess('Collaboratore aggiornato');
        fetchCollaboratori();
        setSelected(null);
      }
    }

    setIsSaving(false);
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    const targetId = toDelete.id;
    setToDelete(null);
    const { error } = await supabase
      .from('collaboratori')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', targetId);
    if (error) {
      showError("Errore nell'eliminazione.");
    } else {
      showSuccess('Collaboratore eliminato.');
      fetchCollaboratori();
    }
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden min-h-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 shrink-0 pt-2">
        <p className="text-gray-500 font-medium">{filtered.length} collaboratori</p>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={15} />
              </button>
            ) : (
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={15} />
            )}
            <Input
              placeholder="Cerca per nome, telefono, email, professione..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoComplete="off"
              name="search-collaboratori"
              className="h-11 pl-9 w-[280px] rounded-xl border-gray-200 bg-white"
            />
          </div>

          <Button
            onClick={openCreateModal}
            className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-2xl px-7 h-11 shadow-lg shadow-[#94b0ab]/20 font-bold transition-all"
          >
            <Plus className="mr-2" size={16} /> Nuovo Collaboratore
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden min-h-0">
        <div className="h-full bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-y-auto">
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left table-fixed">
              <colgroup>
                <col style={{ width: '35%' }} />
                <col style={{ width: '25%' }} />
                <col style={{ width: '30%' }} />
                <col style={{ width: '10%' }} />
              </colgroup>
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100">
                  <th className="px-8 py-5 text-xs font-bold uppercase tracking-widest text-gray-400">Contatto</th>
                  <th className="px-8 py-5 text-xs font-bold uppercase tracking-widest text-gray-400">Professione</th>
                  <th className="px-8 py-5 text-xs font-bold uppercase tracking-widest text-gray-400">Email</th>
                  <th className="px-8 py-5 text-xs font-bold uppercase tracking-widest text-gray-400 text-right">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="px-8 py-5">
                        <div className="h-4 bg-gray-100 rounded-lg animate-pulse w-40 mb-1.5" />
                        <div className="h-3 bg-gray-50 rounded-lg animate-pulse w-24" />
                      </td>
                      <td className="px-8 py-5"><div className="h-3 bg-gray-50 rounded-lg animate-pulse w-24" /></td>
                      <td className="px-8 py-5"><div className="h-3 bg-gray-50 rounded-lg animate-pulse w-32" /></td>
                      <td className="px-8 py-5"><div className="h-8 bg-gray-50 rounded-xl animate-pulse w-16 ml-auto" /></td>
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={4} className="px-8 py-16 text-center text-gray-300 italic">Nessun collaboratore trovato</td></tr>
                ) : filtered.map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-gray-50/30 transition-colors group cursor-pointer"
                    onClick={() => openEditModal(c)}
                  >
                    <td className="px-8 py-5 min-w-0">
                      <div className="font-bold text-gray-900 truncate">{c.nome} {c.cognome}</div>
                      <div className="text-xs text-gray-400 font-medium flex items-center gap-1.5 mt-0.5 min-w-0">
                        <Phone size={10} className="text-gray-300 shrink-0" />
                        <span className="truncate">{c.telefono || 'N/D'}</span>
                      </div>
                    </td>
                    <td className="px-8 py-5 min-w-0">
                      {c.professione
                        ? <span className="text-xs text-gray-500 truncate block">{c.professione}</span>
                        : <span className="text-xs text-gray-200">—</span>}
                    </td>
                    <td className="px-8 py-5 min-w-0">
                      <span className="text-xs text-gray-500 truncate block">{c.email || '—'}</span>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Elimina collaboratore"
                          onClick={() => setToDelete({ id: c.id!, nome: c.nome, cognome: c.cognome })}
                          className="h-8 w-8 p-0 rounded-xl text-gray-300 hover:text-red-500 hover:bg-red-50"
                        >
                          <Trash2 size={15} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent className="w-full sm:max-w-lg p-0 overflow-hidden flex flex-col gap-0 border-none shadow-2xl">
          {selected && (
            <form onSubmit={handleSave} className="flex flex-col min-h-0">
              {(() => {
                const isCreate = !selected.id;
                return (
                  <DialogHeader className="px-7 pt-5 pb-4 border-b bg-white shrink-0">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center shrink-0",
                        isCreate ? "bg-[#94b0ab] text-white" : "bg-[#94b0ab]/10 text-[#94b0ab]"
                      )}>
                        {isCreate ? <Plus size={22} /> : <User size={22} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <DialogTitle className="text-xl font-bold text-gray-900 leading-none">
                          {isCreate ? 'Nuovo Collaboratore' : `${selected.nome} ${selected.cognome ?? ''}`}
                        </DialogTitle>
                        <DialogDescription className="text-xs text-gray-400 font-medium mt-1">
                          {isCreate
                            ? 'Compila il profilo e salva per creare il collaboratore.'
                            : <>Collaboratore aggiunto il {safeFormat(selected.created_at, 'PPP', { locale: it })}</>
                          }
                        </DialogDescription>
                      </div>
                    </div>
                  </DialogHeader>
                );
              })()}

              <div className="p-6 space-y-5 bg-slate-50 max-h-[65vh] overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-gray-500">Nome <span className="text-red-400">*</span></Label>
                    <Input
                      required
                      value={selected.nome || ''}
                      onChange={(e) => setSelected({ ...selected, nome: e.target.value })}
                      className="h-11 rounded-xl border-gray-200 bg-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-gray-500">Cognome</Label>
                    <Input
                      value={selected.cognome || ''}
                      onChange={(e) => setSelected({ ...selected, cognome: e.target.value })}
                      className="h-11 rounded-xl border-gray-200 bg-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-gray-500 flex items-center gap-1.5"><Mail size={11} /> Email</Label>
                    <Input
                      type="email"
                      value={selected.email || ''}
                      onChange={(e) => setSelected({ ...selected, email: e.target.value })}
                      className="h-11 rounded-xl border-gray-200 bg-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-gray-500 flex items-center gap-1.5"><Phone size={11} /> Telefono</Label>
                    <Input
                      value={selected.telefono || ''}
                      onChange={(e) => setSelected({ ...selected, telefono: e.target.value })}
                      className="h-11 rounded-xl border-gray-200 bg-white"
                    />
                  </div>
                  <div className="space-y-2 col-span-full">
                    <Label className="text-xs font-bold text-gray-500 flex items-center gap-1.5"><Briefcase size={11} /> Professione</Label>
                    <Input
                      value={selected.professione || ''}
                      onChange={(e) => setSelected({ ...selected, professione: e.target.value })}
                      placeholder="Es. Notaio, Geometra, Fotografo..."
                      className="h-11 rounded-xl border-gray-200 bg-white"
                    />
                  </div>
                  <div className="space-y-2 col-span-full">
                    <Label className="text-xs font-bold text-gray-500">Note</Label>
                    <Textarea
                      value={selected.note_interne || ''}
                      onChange={(e) => setSelected({ ...selected, note_interne: e.target.value })}
                      placeholder="Note interne..."
                      className="rounded-xl border-gray-200 bg-white min-h-[80px] resize-none"
                    />
                  </div>
                </div>
              </div>

              <div className="px-7 py-4 bg-white border-t shrink-0 flex items-center justify-end gap-4">
                <Button
                  type="submit"
                  disabled={isSaving}
                  className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-2xl px-8 h-11 shadow-md shadow-[#94b0ab]/20 text-sm font-bold transition-all active:scale-[0.97]"
                >
                  {isSaving
                    ? 'Salvataggio...'
                    : selected.id
                      ? <><Save size={13} className="mr-1.5" /> Salva</>
                      : <><Plus size={16} className="mr-2" /> Crea Collaboratore</>
                  }
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent className="border-none shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold">Confermi l'eliminazione?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 font-medium">
              Stai per eliminare <span className="font-bold text-gray-800">{toDelete?.nome} {toDelete?.cognome}</span>. L'operazione è irreversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-xl border-gray-200 font-bold">Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold">Sì, elimina</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CollaboratoriView;
