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
import { Search, Trash2, CalendarIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { showError, showSuccess } from '@/utils/toast';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';

// ── Shared Types ──────────────────────────────────────────────────────────────

export interface Appointment {
  id: string;
  agente_id: string;
  tipologia: string;
  lead_id: string | null;
  immobile_id: string | null;
  data: string;         // 'yyyy-MM-dd'
  ora_inizio: string | null;  // 'HH:mm:ss' or 'HH:mm'
  ora_fine: string | null;
  note: string | null;
  leads?: { nome: string; cognome: string } | null;
  immobili?: { titolo: string } | null;
}

export interface AgentProfile {
  id: string;
  nome_completo: string | null;
  colore_calendario?: string | null;
}

// ── Tipologia config ──────────────────────────────────────────────────────────

export const TIPOLOGIE = [
  'Prima visita',
  'Seconda Visita',
  'Terza Visita',
  'Valutazione Vendita',
  'Valutazione Affitto',
  'Incontro con proprietario',
  'Firma proposta',
  'Rogito',
  'Preliminare',
  'Telefonata',
  'Riunione',
  'Consulente finanziario',
  'Foto/video',
  'Perito',
  'Altro',
] as const;

export const TIPOLOGIA_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'Prima visita':              { bg: '#dcfce7', text: '#166534', border: '#86efac' },
  'Seconda Visita':            { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' },
  'Terza Visita':              { bg: '#ccfbf1', text: '#134e4a', border: '#5eead4' },
  'Valutazione Vendita':       { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  'Valutazione Affitto':       { bg: '#e0f2fe', text: '#075985', border: '#7dd3fc' },
  'Incontro con proprietario': { bg: '#ede9fe', text: '#4c1d95', border: '#c4b5fd' },
  'Firma proposta':            { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
  'Rogito':                    { bg: '#fed7aa', text: '#9a3412', border: '#fdba74' },
  'Preliminare':               { bg: '#fce7f3', text: '#9d174d', border: '#f9a8d4' },
  'Telefonata':                { bg: '#d4f1ee', text: '#134e4a', border: '#94b0ab' },
  'Riunione':                  { bg: '#e8f4f2', text: '#1d4038', border: '#94b0ab' },
  'Consulente finanziario':    { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' },
  'Foto/video':                { bg: '#f5f3ff', text: '#4c1d95', border: '#ddd6fe' },
  'Perito':                    { bg: '#fef9c3', text: '#713f12', border: '#fef08a' },
  'Altro':                     { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const addOneHour = (timeStr: string): string => {
  const [h, m] = timeStr.split(':').map(Number);
  const totalMin = h * 60 + m + 60;
  const newH = Math.floor(totalMin / 60) % 24;
  const newM = totalMin % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
};

// ── Component ─────────────────────────────────────────────────────────────────

interface Property {
  id: string;
  titolo: string;
}

interface EventFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  event?: Appointment;
  defaultAgentId?: string;
  defaultDate?: string;
  defaultTimeStart?: string;
  defaultLeadId?: string;
  defaultLeadName?: string;
  agents: AgentProfile[];
  properties: Property[];
}

const EventFormModal = ({
  open, onClose, onSaved, event,
  defaultAgentId, defaultDate, defaultTimeStart,
  defaultLeadId, defaultLeadName,
  agents, properties,
}: EventFormModalProps) => {
  const isEdit = !!event;

  const [agenteId, setAgenteId] = useState('');
  const [tipologia, setTipologia] = useState('');
  const [leadId, setLeadId] = useState('');
  const [leadSearch, setLeadSearch] = useState('');
  const [leadResults, setLeadResults] = useState<any[]>([]);
  const [showLeadDrop, setShowLeadDrop] = useState(false);
  const [immobileId, setImmobileId] = useState('none');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [oraInizio, setOraInizio] = useState('');
  const [oraFine, setOraFine] = useState('');
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (event) {
      setAgenteId(event.agente_id);
      setTipologia(event.tipologia);
      setLeadId(event.lead_id ?? '');
      setLeadSearch(event.leads ? `${event.leads.nome} ${event.leads.cognome}` : '');
      setImmobileId(event.immobile_id ?? 'none');
      setSelectedDate(parseISO(event.data));
      setOraInizio(event.ora_inizio?.slice(0, 5) ?? '');
      setOraFine(event.ora_fine?.slice(0, 5) ?? '');
      setNote(event.note ?? '');
    } else {
      setAgenteId(defaultAgentId ?? agents[0]?.id ?? '');
      setTipologia('');
      setLeadId(defaultLeadId ?? '');
      setLeadSearch(defaultLeadName ?? '');
      setImmobileId('none');
      setSelectedDate(defaultDate ? parseISO(defaultDate) : new Date());
      const initStart = defaultTimeStart ?? '09:00';
      setOraInizio(initStart);
      setOraFine(addOneHour(initStart));
      setNote('');
    }
    setLeadResults([]);
    setShowLeadDrop(false);
  }, [open, event, defaultAgentId, defaultDate, defaultTimeStart, agents]);

  const searchLeads = async (q: string) => {
    if (!q.trim()) { setLeadResults([]); setShowLeadDrop(false); return; }
    const { data: rows } = await supabase
      .from('leads')
      .select('id, nome, cognome, telefono')
      .or(`nome.ilike.%${q}%,cognome.ilike.%${q}%`)
      .limit(8);
    setLeadResults(rows || []);
    setShowLeadDrop(true);
  };

  const handleSave = async () => {
    if (!tipologia || !selectedDate) {
      showError('Tipologia e data sono obbligatorie');
      return;
    }
    if (!agenteId) {
      showError('Seleziona un agente');
      return;
    }
    setIsSaving(true);
    const payload = {
      agente_id: agenteId,
      tipologia,
      lead_id: leadId || null,
      immobile_id: immobileId !== 'none' ? immobileId : null,
      data: format(selectedDate!, 'yyyy-MM-dd'),
      ora_inizio: oraInizio || null,
      ora_fine: oraFine || null,
      note: note.trim() || null,
    };
    const { error } = isEdit
      ? await supabase.from('appuntamenti').update(payload).eq('id', event!.id)
      : await supabase.from('appuntamenti').insert([payload]);
    setIsSaving(false);
    if (error) {
      showError('Errore: ' + error.message);
    } else {
      showSuccess(isEdit ? 'Appuntamento aggiornato' : 'Appuntamento creato');
      onSaved();
      onClose();
    }
  };

  const handleDelete = async () => {
    if (!event) return;
    setIsDeleting(true);
    const { error } = await supabase.from('appuntamenti').delete().eq('id', event.id);
    setIsDeleting(false);
    if (error) {
      showError('Errore eliminazione: ' + error.message);
    } else {
      showSuccess('Appuntamento eliminato');
      onSaved();
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden">
        <DialogHeader className="px-8 pt-8 pb-4 border-b border-gray-100">
          <DialogTitle className="text-xl font-bold text-gray-900">
            {isEdit ? 'Modifica Appuntamento' : 'Nuovo Appuntamento'}
          </DialogTitle>
        </DialogHeader>

        <div className="px-8 py-6 space-y-5 overflow-y-auto max-h-[60vh]">

          {/* Tipologia */}
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Tipologia *</Label>
            <Select value={tipologia} onValueChange={setTipologia}>
              <SelectTrigger className="h-12 rounded-xl border-gray-200 bg-slate-50/50">
                <SelectValue placeholder="Seleziona tipologia..." />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {TIPOLOGIE.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Agente */}
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Agente</Label>
            <Select value={agenteId} onValueChange={setAgenteId}>
              <SelectTrigger className="h-12 rounded-xl border-gray-200 bg-slate-50/50">
                <SelectValue placeholder="Seleziona agente..." />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {agents.map(a => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.nome_completo ?? a.id.substring(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Lead */}
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Lead collegato</Label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <Input
                value={leadSearch}
                onChange={(e) => {
                  setLeadSearch(e.target.value);
                  searchLeads(e.target.value);
                  if (!e.target.value) setLeadId('');
                }}
                placeholder="Cerca lead per nome..."
                className="h-12 pl-8 rounded-xl border-gray-200 bg-slate-50/50"
              />
              {showLeadDrop && leadResults.length > 0 && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowLeadDrop(false)} />
                  <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-y-auto max-h-48">
                    {leadResults.map(lead => (
                      <button
                        key={lead.id}
                        type="button"
                        onClick={() => {
                          setLeadId(lead.id);
                          setLeadSearch(`${lead.nome} ${lead.cognome}`);
                          setLeadResults([]);
                          setShowLeadDrop(false);
                        }}
                        className="w-full px-4 py-3 text-sm text-left hover:bg-slate-50 transition-colors"
                      >
                        <p className="font-semibold text-gray-800">{lead.nome} {lead.cognome}</p>
                        {lead.telefono && <p className="text-xs text-gray-400">{lead.telefono}</p>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Immobile */}
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Immobile</Label>
            <Select
              value={immobileId}
              onValueChange={setImmobileId}
            >
              <SelectTrigger className="h-12 rounded-xl border-gray-200 bg-slate-50/50">
                <SelectValue placeholder="Collega un immobile..." />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="none">Nessuno</SelectItem>
                {properties.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.titolo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Data */}
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Data *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal rounded-xl bg-gray-50/50 border-gray-100 hover:bg-gray-100 h-12",
                    !selectedDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4 text-[#94b0ab]" />
                  {selectedDate ? format(selectedDate, "PPP", { locale: it }) : "Seleziona una data"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 border-none rounded-2xl shadow-xl" align="start">
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

          {/* Ora Inizio / Ora Fine */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Ora Inizio</Label>
              <Input
                type="time"
                value={oraInizio}
                onChange={(e) => {
                  setOraInizio(e.target.value);
                  if (e.target.value) setOraFine(addOneHour(e.target.value));
                }}
                className="h-12 rounded-xl border-gray-200 bg-slate-50/50"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Ora Fine</Label>
              <Input
                type="time"
                value={oraFine}
                onChange={(e) => setOraFine(e.target.value)}
                className="h-12 rounded-xl border-gray-200 bg-slate-50/50"
              />
            </div>
          </div>

          {/* Note */}
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Note</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Aggiungi note o dettagli..."
              className="rounded-xl border-gray-200 bg-slate-50/50 min-h-[80px] resize-none"
            />
          </div>

        </div>

        <DialogFooter className="px-8 py-5 border-t border-gray-100 bg-gray-50/50 flex items-center gap-3">
          {isEdit && (
            <Button
              type="button"
              variant="ghost"
              onClick={handleDelete}
              disabled={isDeleting || isSaving}
              className="text-red-500 hover:text-red-600 hover:bg-red-50 rounded-xl h-11 mr-auto"
            >
              <Trash2 size={15} className="mr-1.5" />
              {isDeleting ? 'Eliminando...' : 'Elimina'}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="rounded-xl h-11 border-gray-200"
          >
            Annulla
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving || isDeleting}
            className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl px-8 h-11 font-bold"
          >
            {isSaving ? 'Salvataggio...' : isEdit ? 'Salva modifiche' : 'Crea Appuntamento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EventFormModal;
