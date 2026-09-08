"use client";

import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Trash2, CalendarIcon, Phone, MessageCircle, Save, MapPin, X, User, Mail, Euro, Home, Tag, Info } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { showError, showSuccess } from '@/utils/toast';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Combobox, type ComboboxItem } from '@/components/ui/combobox';
import { useQueryClient } from '@tanstack/react-query';
import { FASI_PROPRIETARI } from '@/hooks/useProprietariPipeline';
import { generaChecklistPraticaPerFase } from '@/lib/proprietariChecklist';
import type { FaseProprietario } from '@/types';

// ── Shared Types ──────────────────────────────────────────────────────────────

export interface Appointment {
  id: string;
  agente_id: string;
  tipologia: string;
  lead_id: string | null;
  contatto_id?: string | null;
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
  'Rivalutazione',
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
  'Rivalutazione':             { bg: '#0d9488', text: '#ffffff', border: '#0f766e' },  // Teal
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

interface LeadDetail {
  id: string;
  nome: string;
  cognome: string;
  email?: string | null;
  telefono?: string | null;
  tipo_cliente?: string | null;
  stato?: string | null;
  stato_venditore?: string | null;
  budget?: number | null;
  via_immobile?: string | null;
  zona_venditore?: string | null;
  tipologia_ricerca?: string[] | null;
  note_interne?: string | null;
  assegnato_a?: string | null;
}

interface RelatedAppuntamento {
  id: string;
  data: string;
  ora_inizio: string | null;
  tipologia: string;
  agente_id: string;
  motivo: 'contatto' | 'immobile' | 'indirizzo';
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
  /** Generic contatto (acquirente/proprietario/collaboratore) link — takes over the lead combobox/search UI when set. */
  defaultContattoId?: string;
  defaultContattoName?: string;
  agents: AgentProfile[];
  properties: Property[];
  coloriMap?: TipologieMap;
  tipologieList?: string[];
}

const EventFormModal = ({
  open, onClose, onSaved, event,
  defaultAgentId, defaultDate, defaultTimeStart,
  defaultLeadId, defaultLeadName,
  defaultContattoId, defaultContattoName,
  agents, properties, coloriMap, tipologieList,
}: EventFormModalProps) => {
  const isEdit = !!event;
  const isContattoLinked = !!(event ? event.contatto_id : defaultContattoId);
  const queryClient = useQueryClient();

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
  const [leadSheet, setLeadSheet] = useState(false);
  const [leadDetail, setLeadDetail] = useState<LeadDetail | null>(null);
  const [isLoadingLeadDetail, setIsLoadingLeadDetail] = useState(false);
  const [relatedAppuntamenti, setRelatedAppuntamenti] = useState<RelatedAppuntamento[]>([]);
  // Dettagli del contatto collegato via contatto_id (post-pivot): risolti da
  // contatti + proprietari/acquirenti/collaboratori. Serve per mostrare
  // nome+telefono in edit mode quando il modal è aperto da calendario e
  // defaultContattoName non è disponibile.
  const [contattoDetail, setContattoDetail] = useState<{ nome: string; cognome: string | null; telefono: string | null; tipo: 'proprietari' | 'acquirenti' | 'collaboratori' } | null>(null);

  const autosavedIdRef = useRef<string | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const relatedCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    setContattoDetail(null);
  }, [open, event, defaultAgentId, defaultDate, defaultTimeStart, defaultLeadId, defaultLeadName, agents]);

  // Se l'appuntamento è collegato via contatto_id (nuovo flow), risolviamo
  // nome/telefono dalla giusta tabella figlia: proprietari, acquirenti,
  // collaboratori (ognuna 1:1 con contatti tramite id). Fallback silenzioso se
  // il contatto è stato cancellato.
  useEffect(() => {
    const contattoId = event?.contatto_id ?? defaultContattoId ?? null;
    if (!open || !contattoId) { setContattoDetail(null); return; }
    let aborted = false;
    (async () => {
      for (const tipo of ['proprietari', 'acquirenti', 'collaboratori'] as const) {
        const { data } = await supabase
          .from(tipo)
          .select('nome, cognome, telefono')
          .eq('id', contattoId)
          .maybeSingle();
        if (aborted) return;
        if (data) {
          setContattoDetail({ ...(data as { nome: string; cognome: string | null; telefono: string | null }), tipo });
          return;
        }
      }
      setContattoDetail(null);
    })();
    return () => { aborted = true; };
  }, [open, event?.contatto_id, defaultContattoId]);

  // Autosave anche in edit mode (debounced 800ms): patch silenzioso su
  // appuntamenti quando l'utente modifica i campi di un evento esistente.
  // Il tasto "Salva modifiche" resta come feedback esplicito ma non è più
  // richiesto per persistere.
  const lastSavedEditRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isEdit || !open || !event?.id || !selectedDate || !agenteId) return;
    const payload = {
      agente_id: agenteId,
      tipologia: tipologia || 'Altro',
      lead_id: isContattoLinked ? null : (leadId || null),
      contatto_id: event.contatto_id ?? null,
      immobile_id: immobileId !== 'none' ? immobileId : null,
      data: format(selectedDate, 'yyyy-MM-dd'),
      ora_inizio: oraInizio || null,
      ora_fine: oraFine || null,
      note: note.trim() || null,
      indirizzo_appuntamento: indirizzo.trim() || null,
    };
    const serialized = JSON.stringify(payload);
    if (lastSavedEditRef.current === null) {
      lastSavedEditRef.current = serialized;
      return;
    }
    if (serialized === lastSavedEditRef.current) return;
    const timer = setTimeout(async () => {
      const { error } = await supabase.from('appuntamenti').update(payload).eq('id', event.id);
      if (!error) lastSavedEditRef.current = serialized;
    }, 800);
    return () => clearTimeout(timer);
  }, [isEdit, open, event, selectedDate, agenteId, tipologia, isContattoLinked, leadId, immobileId, oraInizio, oraFine, note, indirizzo]);

  // Auto-save for new appointments (debounced 2.5s)
  useEffect(() => {
    if (isEdit || !open || !selectedDate || !agenteId) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

    autoSaveTimerRef.current = setTimeout(async () => {
      setAutoSaveStatus('saving');
      const payload = {
        agente_id: agenteId,
        tipologia: tipologia || 'Altro',
        lead_id: isContattoLinked ? null : (leadId || null),
        contatto_id: defaultContattoId || null,
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

  // Solo avviso informativo (non blocca il salvataggio): appena si collega un
  // contatto/lead, un immobile o si scrive un indirizzo, cerca altri
  // appuntamenti già fissati per la stessa entità e li mostra in un banner.
  // Priorità immobile_id/contatto_id/lead_id (match esatto) sull'indirizzo
  // libero (ILIKE, usato solo quando non c'è un immobile collegato — copre il
  // caso "ho scritto la via/il paese ma non ho selezionato l'immobile dalla
  // lista").
  useEffect(() => {
    if (relatedCheckTimerRef.current) clearTimeout(relatedCheckTimerRef.current);

    if (!open) {
      setRelatedAppuntamenti([]);
      return;
    }

    const contattoId = isContattoLinked ? (event?.contatto_id ?? defaultContattoId ?? null) : null;
    const currentLeadId = !isContattoLinked ? (leadId || null) : null;
    const currentImmobileId = immobileId !== 'none' ? immobileId : null;
    const currentIndirizzo = indirizzo.trim();

    if (!contattoId && !currentLeadId && !currentImmobileId && currentIndirizzo.length < 4) {
      setRelatedAppuntamenti([]);
      return;
    }

    relatedCheckTimerRef.current = setTimeout(async () => {
      const excludeIds = [event?.id, autosavedIdRef.current].filter((v): v is string => !!v);
      const matches = new Map<string, RelatedAppuntamento>();

      const pushRows = (rows: Omit<RelatedAppuntamento, 'motivo'>[] | null, motivo: RelatedAppuntamento['motivo']) => {
        for (const r of rows ?? []) {
          if (excludeIds.includes(r.id) || matches.has(r.id)) continue;
          matches.set(r.id, { ...r, motivo });
        }
      };

      const cols = 'id, data, ora_inizio, tipologia, agente_id';

      if (contattoId) {
        const { data } = await supabase.from('appuntamenti').select(cols)
          .eq('contatto_id', contattoId).order('data', { ascending: true }).limit(5);
        pushRows(data, 'contatto');
      } else if (currentLeadId) {
        const { data } = await supabase.from('appuntamenti').select(cols)
          .eq('lead_id', currentLeadId).order('data', { ascending: true }).limit(5);
        pushRows(data, 'contatto');
      }

      if (currentImmobileId) {
        const { data } = await supabase.from('appuntamenti').select(cols)
          .eq('immobile_id', currentImmobileId).order('data', { ascending: true }).limit(5);
        pushRows(data, 'immobile');
      } else if (currentIndirizzo.length >= 4) {
        const { data } = await supabase.from('appuntamenti').select(cols)
          .ilike('indirizzo_appuntamento', `%${currentIndirizzo}%`).order('data', { ascending: true }).limit(5);
        pushRows(data, 'indirizzo');
      }

      setRelatedAppuntamenti(Array.from(matches.values()).sort((a, b) => a.data.localeCompare(b.data)));
    }, 400);

    return () => { if (relatedCheckTimerRef.current) clearTimeout(relatedCheckTimerRef.current); };
  }, [open, isContattoLinked, defaultContattoId, event?.contatto_id, event?.id, leadId, immobileId, indirizzo]);

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

  const openLeadSheet = async () => {
    if (!leadId) return;
    setLeadSheet(true);
    setIsLoadingLeadDetail(true);
    const { data } = await supabase
      .from('leads')
      .select('id, nome, cognome, email, telefono, tipo_cliente, stato, stato_venditore, budget, via_immobile, zona_venditore, tipologia_ricerca, note_interne, assegnato_a')
      .eq('id', leadId)
      .single();
    setLeadDetail(data ?? null);
    setIsLoadingLeadDetail(false);
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

  // Fissare un appuntamento di tipologia "Rivalutazione" su un proprietario fa
  // avanzare la sua pratica alla fase omonima — ma solo in avanti: se la
  // pratica è già oltre (es. "Presa in carico"), non torna indietro.
  const avanzaFaseSeRivalutazione = async (contattoId: string) => {
    const { data: pratica } = await supabase
      .from('proprietari_pratiche')
      .select('id, fase')
      .eq('proprietario_id', contattoId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!pratica) return;

    const targetIdx = FASI_PROPRIETARI.indexOf('Rivalutazione');
    const currentIdx = FASI_PROPRIETARI.indexOf(pratica.fase as FaseProprietario);
    if (currentIdx === -1 || currentIdx >= targetIdx) return;

    const { error } = await supabase
      .from('proprietari_pratiche')
      .update({ fase: 'Rivalutazione', updated_at: new Date().toISOString() })
      .eq('id', pratica.id);
    if (error) return;

    await generaChecklistPraticaPerFase(pratica.id, 'Rivalutazione');
    queryClient.invalidateQueries({ queryKey: ['proprietari-pipeline'] });
    queryClient.invalidateQueries({ queryKey: ['proprietari-pratica-documenti', pratica.id] });
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
      lead_id: isContattoLinked ? null : (leadId || null),
      contatto_id: isContattoLinked ? (event?.contatto_id ?? defaultContattoId ?? null) : null,
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

    if (!error && payload.tipologia === 'Rivalutazione' && payload.contatto_id) {
      await avanzaFaseSeRivalutazione(payload.contatto_id);
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

  const formatPrice = (v: number | null) =>
    v != null ? new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v) : null;

  const nomeAgente = (id: string) => agents.find(a => a.id === id)?.nome_completo ?? 'Agente';

  const MOTIVO_LABEL: Record<RelatedAppuntamento['motivo'], string> = {
    contatto: 'per questo contatto',
    immobile: 'per questo immobile',
    indirizzo: 'a questo indirizzo',
  };

  return (
    <>
    <Sheet open={leadSheet} onOpenChange={setLeadSheet}>
      <SheetContent side="right" className="w-[360px] sm:w-[420px] flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-gray-100">
          <SheetTitle className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <User size={18} className="text-[#94b0ab]" />
            Scheda Lead
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isLoadingLeadDetail ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Caricamento...</div>
          ) : leadDetail ? (
            <div className="space-y-5">
              {/* Nome */}
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Nome</p>
                <p className="text-base font-semibold text-gray-900">{leadDetail.nome} {leadDetail.cognome}</p>
              </div>
              {/* Tipo cliente + stato */}
              <div className="flex gap-3 flex-wrap">
                {leadDetail.tipo_cliente && (
                  <span className={cn(
                    'inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-xl border',
                    leadDetail.tipo_cliente === 'Proprietario' ? 'bg-red-50 text-red-700 border-red-200' :
                    leadDetail.tipo_cliente === 'Acquirente' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                    'bg-purple-50 text-purple-700 border-purple-200'
                  )}>
                    <Tag size={11} />
                    {leadDetail.tipo_cliente}
                  </span>
                )}
                {leadDetail.stato && (
                  <span className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-xl border bg-gray-50 text-gray-700 border-gray-200">
                    {leadDetail.stato}
                  </span>
                )}
              </div>
              {/* Contatti */}
              {leadDetail.telefono && (
                <div className="flex items-center gap-3 bg-green-50 border border-green-100 rounded-2xl px-4 py-3">
                  <Phone size={14} className="text-green-600 shrink-0" />
                  <span className="font-bold text-green-800 text-sm flex-1">{leadDetail.telefono}</span>
                  <a
                    href={getWhatsAppUrl(leadDetail.telefono)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 bg-green-500 hover:bg-green-600 text-white rounded-xl px-3 py-1.5 text-xs font-bold transition-colors"
                  >
                    <MessageCircle size={12} />
                    WA
                  </a>
                </div>
              )}
              {leadDetail.email && (
                <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3">
                  <Mail size={14} className="text-blue-600 shrink-0" />
                  <span className="text-blue-800 text-sm font-medium flex-1 break-all">{leadDetail.email}</span>
                </div>
              )}
              {/* Indirizzo immobile / zona */}
              {leadDetail.via_immobile && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Indirizzo immobile</p>
                  <div className="flex items-start gap-2 text-gray-700">
                    <Home size={14} className="text-[#94b0ab] shrink-0 mt-0.5" />
                    <span className="text-sm">{leadDetail.via_immobile}{leadDetail.zona_venditore ? `, ${leadDetail.zona_venditore}` : ''}</span>
                  </div>
                </div>
              )}
              {!leadDetail.via_immobile && leadDetail.zona_venditore && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Zona</p>
                  <div className="flex items-center gap-2 text-gray-700">
                    <MapPin size={14} className="text-[#94b0ab] shrink-0" />
                    <span className="text-sm">{leadDetail.zona_venditore}</span>
                  </div>
                </div>
              )}
              {/* Budget */}
              {leadDetail.budget != null && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Budget</p>
                  <div className="flex items-center gap-2 text-gray-700">
                    <Euro size={14} className="text-[#94b0ab] shrink-0" />
                    <span className="text-sm font-semibold">{formatPrice(leadDetail.budget)}</span>
                  </div>
                </div>
              )}
              {/* Tipologia ricerca */}
              {leadDetail.tipologia_ricerca?.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Cerca</p>
                  <div className="flex flex-wrap gap-1.5">
                    {leadDetail.tipologia_ricerca.map((t: string) => (
                      <span key={t} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-lg">{t}</span>
                    ))}
                  </div>
                </div>
              )}
              {/* Note interne */}
              {leadDetail.note_interne && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Note interne</p>
                  <p className="text-sm text-gray-600 bg-gray-50 rounded-xl px-3 py-2 whitespace-pre-line">{leadDetail.note_interne}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Nessun dato trovato.</div>
          )}
        </div>
      </SheetContent>
    </Sheet>
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

          {/* Lead / contatto collegato */}
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Contatto collegato</Label>
            {isContattoLinked ? (
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                  <User size={14} className="text-[#94b0ab] shrink-0" />
                  <span className="truncate">
                    {contattoDetail
                      ? `${contattoDetail.nome} ${contattoDetail.cognome ?? ''}`.trim()
                      : (defaultContattoName || 'Contatto selezionato')}
                  </span>
                  {contattoDetail?.tipo && (
                    <span className={`ml-auto text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-md border ${
                      contattoDetail.tipo === 'proprietari' ? 'bg-red-50 text-red-700 border-red-200'
                      : contattoDetail.tipo === 'acquirenti' ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {contattoDetail.tipo === 'proprietari' ? 'Prop' : contattoDetail.tipo === 'acquirenti' ? 'Acq' : 'Coll'}
                    </span>
                  )}
                </div>
                {contattoDetail?.telefono && (
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <Phone size={12} className="text-gray-400 shrink-0" />
                    <span className="font-mono">{contattoDetail.telefono}</span>
                    <a
                      href={getWhatsAppUrl(contattoDetail.telefono)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="ml-auto flex items-center gap-1 bg-green-500 hover:bg-green-600 text-white rounded-lg px-2 py-1 text-[10px] font-bold shrink-0"
                    >
                      <MessageCircle size={11} />
                      WhatsApp
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <Combobox
                items={leadItems}
                value={leadId}
                onSelect={handleLeadSelect}
                onSearch={searchLeads}
                placeholder="Cerca lead per nome o telefono..."
                searchPlaceholder="Nome, cognome o telefono..."
                emptyMessage="Nessun lead trovato."
              />
            )}
            {/* Phone + WhatsApp + Scheda lead */}
            {!isContattoLinked && leadPhone && (
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
                <button
                  type="button"
                  onClick={openLeadSheet}
                  className="flex items-center gap-1.5 bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl px-3 py-1.5 text-xs font-bold transition-colors shrink-0"
                >
                  <User size={13} />
                  Scheda
                </button>
              </div>
            )}
            {/* Scheda lead anche senza telefono */}
            {!isContattoLinked && leadId && !leadPhone && (
              <button
                type="button"
                onClick={openLeadSheet}
                className="flex items-center gap-1.5 text-[#94b0ab] hover:text-[#7a948f] text-xs font-semibold mt-1 transition-colors"
              >
                <User size={13} />
                Vedi scheda lead
              </button>
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

          {/* Avviso informativo: altri appuntamenti già fissati per lo stesso contatto/immobile/indirizzo */}
          {relatedAppuntamenti.length > 0 && (
            <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 space-y-2">
              <div className="flex items-center gap-2 text-sky-700 font-semibold text-xs uppercase tracking-widest">
                <Info size={14} />
                Altri appuntamenti trovati ({relatedAppuntamenti.length})
              </div>
              <div className="space-y-1.5">
                {relatedAppuntamenti.map((r) => (
                  <p key={r.id} className="text-sm text-sky-900">
                    <span className="font-semibold">
                      {format(parseISO(r.data), "d MMM yyyy", { locale: it })}
                      {r.ora_inizio ? ` alle ${r.ora_inizio.slice(0, 5)}` : ''}
                    </span>
                    {' — '}{r.tipologia} con {nomeAgente(r.agente_id)}{' '}
                    <span className="text-sky-600">({MOTIVO_LABEL[r.motivo]})</span>
                  </p>
                ))}
              </div>
            </div>
          )}

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
    </>
  );
};

export default EventFormModal;
