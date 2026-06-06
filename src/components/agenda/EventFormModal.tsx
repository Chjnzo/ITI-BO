"use client";

import React, { useState, useEffect, useRef } from 'react';
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
import { Trash2, CalendarIcon, Phone, MessageCircle, Save, MapPin, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { showError, showSuccess } from '@/utils/toast';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Combobox, type ComboboxItem } from '@/components/ui/combobox';

// ── Shared Types ──────────────────────────────────────────────────────────────

export interface Appointment {
  id: string;
  agente_id: string;
  tipologia: string;
  lead_id: string | null;
  immobile_id: string | null;
  data: string;
  ora_inizio: string | null;
  ora_fine: string | null;
  note: string | null;
  indirizzo_appuntamento: string | null;
  leads?: { nome: string; cognome: string; telefono?: string | null } | null;
  immobili?: { titolo: string } | null;
}

export interface AgentProfile {
  id: string;
  nome_completo: string | null;
  colore_calendario?: string | null;
}

export interface TipologiaRow {
  id: string;
  nome: string;
  colore_bg: string;
  colore_border: string;
  ordine: number;
}

export type TipologieMap = Record<string, { bg: string; text: string; border: string }>;

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
  'Prima visita':              { bg: '#16a34a', text: '#ffffff', border: '#15803d' },  // Verde
  'Seconda Visita':            { bg: '#f97316', text: '#ffffff', border: '#ea580c' },  // Arancione
  'Terza Visita':              { bg: '#a855f7', text: '#ffffff', border: '#9333ea' },  // Viola
  'Valutazione Vendita':       { bg: '#2563eb', text: '#ffffff', border: '#1d4ed8' },  // Blu
  'Valutazione Affitto':       { bg: '#0284c7', text: '#ffffff', border: '#0369a1' },  // Azzurro
  'Incontro con proprietario': { bg: '#92400e', text: '#ffffff', border: '#78350f' },  // Marrone
  'Firma proposta':            { bg: '#d97706', text: '#ffffff', border: '#b45309' },  // Ambra
  'Rogito':                    { bg: '#ea580c', text: '#ffffff', border: '#c2410c' },  // Arancione
  'Preliminare':               { bg: '#dc2626', text: '#ffffff', border: '#b91c1c' },  // Rosso
  'Telefonata':                { bg: '#0891b2', text: '#ffffff', border: '#0e7490' },  // Ciano
  'Riunione':                  { bg: '#7c3aed', text: '#ffffff', border: '#6d28d9' },  // Viola
  'Consulente finanziario':    { bg: '#c026d3', text: '#ffffff', border: '#a21caf' },  // Magenta
  'Foto/video':                { bg: '#ca8a04', text: '#ffffff', border: '#a16207' },  // Giallo oro
  'Perito':                    { bg: '#be123c', text: '#ffffff', border: '#9f1239' },  // Cremisi
  'Altro':                     { bg: '#6b7280', text: '#ffffff', border: '#4b5563' },  // Grigio
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const addOneHour = (timeStr: string): string => {
  const [h, m] = timeStr.split(':').map(Number);
  const totalMin = h * 60 + m + 60;
  const newH = Math.floor(totalMin / 60) % 24;
  const newM = totalMin % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
};

const getWhatsAppUrl = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  const withCountry = digits.startsWith('39') && digits.length >= 11 ? digits : `39${digits}`;
  return `https://wa.me/${withCountry}`;
};

// ── Component ─────────────────────────────────────────────────────────────────

interface Property {
  id: string;
  titolo: string;
  copertina_url?: string | null;
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
  coloriMap?: TipologieMap;
  tipologieList?: string[];
}

const EventFormModal = ({
  open, onClose, onSaved, event,
  defaultAgentId, defaultDate, defaultTimeStart,
  defaultLeadId, defaultLeadName,
  agents, properties, coloriMap, tipologieList,
}: EventFormModalProps) => {
  const isEdit = !!event;

  const [agenteId, setAgenteId] = useState('');
  const [tipologia, setTipologia] = useState('');
  const [leadId, setLeadId] = useState('');
  const [leadItems, setLeadItems] = useState<ComboboxItem[]>([]);
  const [leadPhone, setLeadPhone] = useState<string | null>(null);
  const [immobileId, setImmobileId] = useState('none');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [oraInizio, setOraInizio] = useState('');
  const [oraFine, setOraFine] = useState('');
  const [note, setNote] = useState('');
  const [indirizzo, setIndirizzo] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const autosavedIdRef = useRef<string | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    autosavedIdRef.current = null;
    setAutoSaveStatus('idle');
    if (event) {
      setAgenteId(event.agente_id);
      setTipologia(event.tipologia);
      setLeadId(event.lead_id ?? '');
      setLeadItems(event.leads && event.lead_id
        ? [{ id: event.lead_id, label: `${event.leads.nome} ${event.leads.cognome}`, sublabel: event.leads.telefono ?? undefined }]
        : []);
      setLeadPhone(event.leads?.telefono ?? null);
      setImmobileId(event.immobile_id ?? 'none');
      setSelectedDate(parseISO(event.data));
      setOraInizio(event.ora_inizio?.slice(0, 5) ?? '');
      setOraFine(event.ora_fine?.slice(0, 5) ?? '');
      setNote(event.note ?? '');
      setIndirizzo(event.indirizzo_appuntamento ?? '');
    } else {
      setAgenteId(defaultAgentId ?? agents[0]?.id ?? '');
      setTipologia('');
      setLeadId(defaultLeadId ?? '');
      setLeadItems(defaultLeadId && defaultLeadName
        ? [{ id: defaultLeadId, label: defaultLeadName }]
        : []);
      setLeadPhone(null);
      setImmobileId('none');
      setSelectedDate(defaultDate ? parseISO(defaultDate) : new Date());
      const initStart = defaultTimeStart ?? '09:00';
      setOraInizio(initStart);
      setOraFine(addOneHour(initStart));
      setNote('');
      setIndirizzo('');
    }
  }, [open, event, defaultAgentId, defaultDate, defaultTimeStart, defaultLeadId, defaultLeadName, agents]);

  // Auto-save for new appointments (debounced 2.5s)
  useEffect(() => {
    if (isEdit || !open || !selectedDate || !agenteId) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

    autoSaveTimerRef.current = setTimeout(async () => {
      setAutoSaveStatus('saving');
      const payload = {
        agente_id: agenteId,
        tipologia: tipologia || 'Altro',
        lead_id: leadId || null,
        immobile_id: immobileId !== 'none' ? immobileId : null,
        data: format(selectedDate, 'yyyy-MM-dd'),
        ora_inizio: oraInizio || null,
        ora_fine: oraFine || null,
        note: note.trim() || null,
        indirizzo_appuntamento: indirizzo.trim() || null,
      };
      if (autosavedIdRef.current) {
        const { error } = await supabase.from('appuntamenti').update(payload).eq('id', autosavedIdRef.current);
        if (!error) { setAutoSaveStatus('saved'); setTimeout(() => setAutoSaveStatus('idle'), 2000); }
        else setAutoSaveStatus('idle');
      } else {
        const { data, error } = await supabase.from('appuntamenti').insert([payload]).select('id').single();
        if (!error && data?.id) {
          autosavedIdRef.current = data.id;
          setAutoSaveStatus('saved');
          setTimeout(() => setAutoSaveStatus('idle'), 2000);
        } else {
          setAutoSaveStatus('idle');
        }
      }
    }, 2500);

    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, open, selectedDate, agenteId, tipologia, leadId, immobileId, oraInizio, oraFine, note, indirizzo]);

  const handleClose = () => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    if (!isEdit && autosavedIdRef.current) {
      const idToDelete = autosavedIdRef.current;
      autosavedIdRef.current = null;
      supabase.from('appuntamenti').delete().eq('id', idToDelete).then(() => onSaved());
    }
    onClose();
  };

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

  const handleLeadSelect = async (id: string) => {
    setLeadId(id);
    if (!id) { setLeadPhone(null); return; }
    const item = leadItems.find(i => i.id === id);
    setLeadPhone(item?.sublabel ?? null);

    // Auto-suggest address only if field is currently empty
    if (indirizzo.trim()) return;
    const [{ data: leadData }, { data: valData }] = await Promise.all([
      supabase.from('leads').select('immobile_id, immobili(indirizzo, citta)').eq('id', id).single(),
      supabase.from('valutazioni').select('indirizzo, citta').eq('lead_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    const immobileAddr = (leadData as { immobili?: { indirizzo?: string; citta?: string } | null } | null)?.immobili;
    const valAddr = valData as { indirizzo?: string; citta?: string } | null;
    const suggested =
      valAddr?.indirizzo ? `${valAddr.indirizzo}${valAddr.citta ? ', ' + valAddr.citta : ''}` :
      immobileAddr?.indirizzo ? `${immobileAddr.indirizzo}${immobileAddr.citta ? ', ' + immobileAddr.citta : ''}` :
      '';
    if (suggested) setIndirizzo(suggested);
  };

  const handleSave = async () => {
    if (!selectedDate) {
      showError('Seleziona una data');
      return;
    }
    if (!agenteId) {
      showError('Seleziona un agente');
      return;
    }
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    setIsSaving(true);
    const payload = {
      agente_id: agenteId,
      tipologia: tipologia || 'Altro',
      lead_id: leadId || null,
      immobile_id: immobileId !== 'none' ? immobileId : null,
      data: format(selectedDate!, 'yyyy-MM-dd'),
      ora_inizio: oraInizio || null,
      ora_fine: oraFine || null,
      note: note.trim() || null,
      indirizzo_appuntamento: indirizzo.trim() || null,
    };

    let error;
    if (isEdit) {
      ({ error } = await supabase.from('appuntamenti').update(payload).eq('id', event!.id));
    } else if (autosavedIdRef.current) {
      ({ error } = await supabase.from('appuntamenti').update(payload).eq('id', autosavedIdRef.current));
      autosavedIdRef.current = null;
    } else {
      ({ error } = await supabase.from('appuntamenti').insert([payload]));
    }

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
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-3xl w-full h-[85vh] flex flex-col border-none shadow-2xl p-0 overflow-hidden">
        <DialogHeader className="px-8 pt-8 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-bold text-gray-900">
              {isEdit ? 'Modifica Appuntamento' : 'Nuovo Appuntamento'}
            </DialogTitle>
            {!isEdit && autoSaveStatus !== 'idle' && (
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <Save size={11} className={autoSaveStatus === 'saving' ? 'animate-pulse text-amber-400' : 'text-green-500'} />
                {autoSaveStatus === 'saving' ? 'Salvataggio...' : 'Bozza salvata'}
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">

          {/* Tipologia */}
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Tipologia</Label>
            <Select value={tipologia} onValueChange={setTipologia}>
              <SelectTrigger className="h-12 rounded-xl border-gray-200 bg-slate-50/50">
                <SelectValue placeholder="Seleziona tipologia..." />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {(tipologieList ?? [...TIPOLOGIE]).map(t => {
                  const cm = coloriMap ?? TIPOLOGIA_COLORS;
                  const c = cm[t] ?? TIPOLOGIA_COLORS['Altro'];
                  return (
                    <SelectItem key={t} value={t}>
                      <span className="flex items-center gap-2">
                        <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: c.bg }} />
                        {t}
                      </span>
                    </SelectItem>
                  );
                })}
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
            <Combobox
              items={leadItems}
              value={leadId}
              onSelect={handleLeadSelect}
              onSearch={searchLeads}
              placeholder="Cerca lead per nome o telefono..."
              searchPlaceholder="Nome, cognome o telefono..."
              emptyMessage="Nessun lead trovato."
            />
            {/* Phone + WhatsApp */}
            {leadPhone && (
              <div className="flex items-center gap-3 bg-green-50 border border-green-100 rounded-2xl px-4 py-3 mt-2">
                <Phone size={15} className="text-green-600 shrink-0" />
                <span className="font-bold text-green-800 text-sm flex-1 tracking-wide">{leadPhone}</span>
                <a
                  href={getWhatsAppUrl(leadPhone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1.5 bg-green-500 hover:bg-green-600 text-white rounded-xl px-3 py-1.5 text-xs font-bold transition-colors shrink-0"
                >
                  <MessageCircle size={13} />
                  WhatsApp
                </a>
              </div>
            )}
          </div>

          {/* Indirizzo appuntamento */}
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">
              Indirizzo incontro <span className="normal-case font-normal text-gray-400">(opzionale)</span>
            </Label>
            <div className="relative">
              <MapPin size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94b0ab] pointer-events-none" />
              <Input
                value={indirizzo}
                onChange={(e) => setIndirizzo(e.target.value)}
                placeholder="Es. Via Roma 10, Bergamo"
                className="h-12 rounded-xl border-gray-200 bg-slate-50/50 pl-9 pr-9"
              />
              {indirizzo && (
                <button
                  type="button"
                  onClick={() => setIndirizzo('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Immobile (opzionale) */}
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">
              Immobile <span className="normal-case font-normal text-gray-400">(opzionale)</span>
            </Label>
            <Combobox
              items={[
                { id: 'none', label: 'Nessuno' },
                ...properties.map(p => ({ id: p.id, label: p.titolo, image: p.copertina_url ?? undefined })),
              ]}
              value={immobileId}
              onSelect={setImmobileId}
              placeholder="Collega un immobile..."
              searchPlaceholder="Cerca immobile..."
              emptyMessage="Nessun immobile trovato."
            />
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
            onClick={handleClose}
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
