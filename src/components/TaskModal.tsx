"use client";

import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { CalendarIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { showError, showSuccess } from '@/utils/toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Combobox, type ComboboxItem } from '@/components/ui/combobox';

interface TaskModalProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  defaultLeadId?: string;
  defaultLeadName?: string;
}

const TASK_COLORS = [
  { id: 'red',    hex: '#ef4444', label: 'Rosso' },
  { id: 'orange', hex: '#f97316', label: 'Arancione' },
  { id: 'yellow', hex: '#eab308', label: 'Giallo' },
  { id: 'teal',   hex: '#14b8a6', label: 'Verde acqua' },
  { id: 'violet', hex: '#8b5cf6', label: 'Viola' },
];

const TaskModal = ({ open, onClose, onSaved, defaultLeadId, defaultLeadName }: TaskModalProps) => {
  const [titolo, setTitolo] = useState('');
  const [telefono, setTelefono] = useState('');
  const [leadId, setLeadId] = useState('');
  const [leadItems, setLeadItems] = useState<ComboboxItem[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [ora, setOra] = useState('');
  const [nota, setNota] = useState('');
  const [agenteId, setAgenteId] = useState('');
  const [colore, setColore] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [currentUserId, setCurrentUserId] = useState('');
  const [teamMembers, setTeamMembers] = useState<{ id: string; nome_completo: string | null }[]>([]);

  useEffect(() => {
    if (!open) return;
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        setCurrentUserId(user.id);
        setAgenteId(user.id);
      }
      const { data, error } = await supabase.from('profili_agenti').select('id, nome_completo');
      if (!error && data && data.length > 0) {
        setTeamMembers(data);
      } else if (user) {
        setTeamMembers([{ id: user.id, nome_completo: 'Tu' }]);
      }
    });
    setTitolo('');
    setTelefono('');
    setSelectedDate(new Date());
    setOra('');
    setNota('');
    setColore(null);
    if (defaultLeadId) {
      setLeadId(defaultLeadId);
      setLeadItems(defaultLeadName ? [{ id: defaultLeadId, label: defaultLeadName }] : []);
    } else {
      setLeadId('');
      setLeadItems([]);
    }
  }, [open, defaultLeadId, defaultLeadName]);

  const searchLeadsAbortRef = React.useRef<AbortController | null>(null);

  const searchLeads = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) { setLeadItems([]); return; }
    searchLeadsAbortRef.current?.abort();
    const controller = new AbortController();
    searchLeadsAbortRef.current = controller;

    const { buildLeadSearchClauses } = await import('@/utils/search');
    const clauses = buildLeadSearchClauses(trimmed);
    let query = supabase.from('leads').select('id, nome, cognome, telefono');
    for (const clause of clauses) query = query.or(clause);
    const { data: rows } = await query.limit(8);

    if (controller.signal.aborted) return;
    setLeadItems((rows ?? []).map(r => ({
      id: r.id,
      label: `${r.nome} ${r.cognome}`,
      sublabel: r.telefono ?? undefined,
    })));
  };

  const handleSave = async () => {
    if (!titolo.trim()) {
      showError('Il titolo della task è obbligatorio');
      return;
    }
    if (!selectedDate) {
      showError('Seleziona una data');
      return;
    }
    if (!currentUserId) {
      showError('Utente non autenticato');
      return;
    }
    setIsSaving(true);
    const { error } = await supabase.from('tasks').insert({
      titolo: titolo.trim(),
      telefono: telefono.trim() || null,
      lead_id: leadId || null,
      agente_id: agenteId || currentUserId,
      nota: nota.trim() || null,
      data: format(selectedDate!, 'yyyy-MM-dd'),
      ora: ora || null,
      stato: 'Da fare',
      colore: colore || null,
    });
    setIsSaving(false);
    if (error) {
      if (import.meta.env.DEV) console.error('[TaskModal] insert error', error);
      showError('Errore: ' + error.message);
    } else {
      showSuccess('Task creata');
      onSaved?.();
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl w-full h-[85vh] flex flex-col border-none shadow-2xl p-0 overflow-hidden">
        <DialogHeader className="px-8 pt-8 pb-5 border-b border-slate-100">
          <DialogTitle className="text-xl font-bold text-gray-900">Nuova Task</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-8 py-7 space-y-6">
          {/* Titolo task */}
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Titolo task *</Label>
            <Input
              value={titolo}
              onChange={(e) => setTitolo(e.target.value)}
              placeholder="Es: Richiamare cliente, Preparare documentazione..."
              className="h-11 border-slate-200 bg-slate-50/50"
            />
          </div>

          {/* Colore */}
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Colore</Label>
            <div className="flex items-center gap-2">
              {TASK_COLORS.map(c => (
                <button
                  key={c.id}
                  type="button"
                  title={c.label}
                  onClick={() => setColore(colore === c.hex ? null : c.hex)}
                  className="w-8 h-8 rounded-full transition-all"
                  style={{
                    backgroundColor: c.hex,
                    outline: colore === c.hex ? `3px solid ${c.hex}` : '3px solid transparent',
                    outlineOffset: '2px',
                    transform: colore === c.hex ? 'scale(1.15)' : 'scale(1)',
                  }}
                />
              ))}
              {colore && (
                <button
                  type="button"
                  onClick={() => setColore(null)}
                  className="ml-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Rimuovi
                </button>
              )}
            </div>
          </div>

          {/* Agente assegnato */}
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Agente assegnato *</Label>
            <Select value={agenteId} onValueChange={setAgenteId}>
              <SelectTrigger className="h-11 border-slate-200 bg-slate-50/50">
                <SelectValue placeholder="Seleziona agente..." />
              </SelectTrigger>
              <SelectContent className="rounded-none">
                {teamMembers.map(m => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.nome_completo ?? m.id.substring(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Lead collegato (opzionale) */}
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Lead collegato</Label>
            {defaultLeadId ? (
              <div className="h-11 flex items-center px-3 rounded-none border border-slate-100 bg-slate-100 text-sm text-gray-700 font-medium">
                {defaultLeadName || 'Lead selezionato'}
              </div>
            ) : (
              <Combobox
                items={leadItems}
                value={leadId}
                onSelect={(id) => {
                  setLeadId(id);
                  if (!telefono.trim()) {
                    const found = leadItems.find(i => i.id === id);
                    if (found?.sublabel) setTelefono(found.sublabel);
                  }
                }}
                onSearch={searchLeads}
                placeholder="Cerca lead per nome o telefono... (opzionale)"
                searchPlaceholder="Nome, cognome o telefono..."
                emptyMessage="Nessun lead trovato."
                className="h-11"
              />
            )}
          </div>

          {/* Telefono */}
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Numero di cellulare</Label>
            <Input
              type="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="+39 333 1234567"
              className="h-11 border-slate-200 bg-slate-50/50"
            />
          </div>

          {/* Data + Ora */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Data *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal rounded-none bg-gray-50/50 border-gray-100 hover:bg-gray-100 h-11',
                      !selectedDate && 'text-muted-foreground',
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-[#94b0ab]" />
                    {selectedDate ? format(selectedDate, 'PPP', { locale: it }) : 'Seleziona data'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 border-none rounded-none shadow-xl" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    initialFocus
                    locale={it}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Ora</Label>
              <Input
                type="time"
                value={ora}
                onChange={(e) => setOra(e.target.value)}
                className="h-11 border-slate-200 bg-slate-50/50"
              />
            </div>
          </div>

          {/* Nota */}
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Nota</Label>
            <Textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Aggiungi un promemoria..."
              className="border-slate-200 bg-slate-50/50 min-h-[80px] resize-none"
            />
          </div>
        </div>

        <DialogFooter className="px-8 py-5 border-t border-slate-100 bg-slate-50/50 gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="flex-1 rounded-none h-11 border-slate-100"
          >
            Annulla
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-none h-11 font-bold"
          >
            {isSaving ? 'Salvataggio...' : 'Crea Task'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TaskModal;
