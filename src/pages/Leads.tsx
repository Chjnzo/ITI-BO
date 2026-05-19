"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';
import { showError, showSuccess } from '@/utils/toast';
import { z } from 'zod';
import { format, parseISO } from 'date-fns';
import { logAudit } from '@/lib/auditLogger';
import { it } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Phone, Home as HomeIcon,
  User, Search, Save,
  Calendar, CalendarPlus, Plus, ExternalLink,
  TrendingUp, Heart, UserCheck, Briefcase, MapPin, ChevronDown, Trash2,
  CheckSquare, Clock, Calculator, Copy, SlidersHorizontal, X as XIcon,
  MessageSquare, FileText,
} from 'lucide-react';
import TaskModal, { TIPOLOGIA_CONFIG } from '@/components/TaskModal';
import EventFormModal, { TIPOLOGIA_COLORS } from '@/components/agenda/EventFormModal';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';

const COLUMNS = [
  { id: 'Nuovo', label: 'Nuovi Lead', color: 'bg-blue-50/50 border-blue-100 text-blue-700' },
  { id: 'In Trattativa', label: 'In Trattativa', color: 'bg-amber-50/50 border-amber-100 text-amber-700' },
  { id: 'Visita Fissata', label: 'Visita Fissata', color: 'bg-purple-50/50 border-purple-100 text-purple-700' },
  { id: 'Chiuso', label: 'Chiusi', color: 'bg-emerald-50/50 border-emerald-100 text-emerald-700' }
];

const AGENTS = ["Matteo", "Gabriele"];

const SELLER_STATES: Record<string, string> = {
  'Nuovo':             'bg-blue-50 border border-blue-100 text-blue-700',
  'Valutazione fatta': 'bg-amber-50 border border-amber-100 text-amber-700',
  'Chiuso':            'bg-emerald-50 border border-emerald-100 text-emerald-700',
};


// Pure helper — defined at module level so it's never re-created
const getClientTypeBadge = (type: string) => {
  switch (type) {
    case 'Proprietario': return "bg-red-100 text-red-700 border-red-200";
    case 'Acquirente':   return "bg-blue-100 text-blue-700 border-blue-200";
    case 'Ibrido':       return "bg-purple-100 text-purple-700 border-purple-200";
    default:             return "bg-gray-100 text-gray-600 border-gray-200";
  }
};

const formatPrice = (price: number) => {
  if (!price) return 'N/D';
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(price);
};

const safeFormat = (date: any, fmt: string, options?: object): string => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return format(d, fmt, options);
};

const Leads = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const pendingOpenLeadIdRef = useRef<string | null>(location.state?.openLeadId ?? null);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [tipoClienteFilter, setTipoClienteFilter] = useState<'Tutti' | 'Acquirenti' | 'Proprietari'>('Tutti');

  // Property Picker State
  const [isPropertyPickerOpen, setIsPropertyPickerOpen] = useState(false);
  const [allProperties, setAllProperties] = useState<any[]>([]);
  const [propertySearch, setPropertySearch] = useState('');
  const [isLoadingProperties, setIsLoadingProperties] = useState(false);

  // Autosave
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<any | null>(null);
  const hasInteractedRef = useRef(false);

  const [totalLeadsCount, setTotalLeadsCount] = useState(0);
  const [leadsPage, setLeadsPage] = useState(1);
  const LEADS_PAGE_SIZE = 50;

  const [unlinkConfirmId, setUnlinkConfirmId] = useState<string | null>(null);
  const [leadToDelete, setLeadToDelete] = useState<{ id: string; nome: string; cognome: string } | null>(null);
  const [leadValutazione, setLeadValutazione] = useState<{ slug: string; stima_min: number | null; stima_max: number | null } | null>(null);

  // Tasks State
  const [leadTasks, setLeadTasks] = useState<any[]>([]);
  const [isLeadTaskModalOpen, setIsLeadTaskModalOpen] = useState(false);

  // Events State (appuntamenti linked to current lead)
  const [leadEvents, setLeadEvents] = useState<any[]>([]);

  // Event Form Modal (for quick "Nuovo evento" from list)
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [eventModalDefaultLeadId, setEventModalDefaultLeadId] = useState<string | undefined>(undefined);
  const [eventModalDefaultLeadName, setEventModalDefaultLeadName] = useState<string | undefined>(undefined);
  const [agentsForEventModal, setAgentsForEventModal] = useState<any[]>([]);
  const [propertiesForEventModal, setPropertiesForEventModal] = useState<any[]>([]);
  const [editingLeadEvent, setEditingLeadEvent] = useState<any | null>(null);

  // Quick task from list row
  const [quickTaskLeadId, setQuickTaskLeadId] = useState<string | undefined>(undefined);
  const [quickTaskLeadName, setQuickTaskLeadName] = useState<string | undefined>(undefined);
  const [isQuickTaskModalOpen, setIsQuickTaskModalOpen] = useState(false);

  // Autocomplete suggestions for zone_ricercate (distinct values from all leads)
  const [zoneSuggestions, setZoneSuggestions] = useState<string[]>([]);
  const [zoneInput, setZoneInput] = useState('');

  // Advanced filters
  const [showFilters, setShowFilters] = useState(false);
  const [filterBudgetMax, setFilterBudgetMax] = useState<number | null>(null);
  const [filterZona, setFilterZona] = useState('');
  const [filterTipologia, setFilterTipologia] = useState('');
  const [filterAgente, setFilterAgente] = useState('');
  const [filterStato, setFilterStato] = useState('');
  const [filterDalSito, setFilterDalSito] = useState(false);

  // Notes tab
  const [leadNotes, setLeadNotes] = useState<any[]>([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);

  const hasActiveFilters = filterBudgetMax !== null || filterZona.trim() !== '' || filterTipologia !== '' || filterAgente !== '' || filterStato !== '' || filterDalSito;

  // Slim query — only fields needed to render the board/list cards
  const fetchLeads = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);

    const applyTipoFilter = (q: ReturnType<typeof supabase.from>) => {
      if (tipoClienteFilter === 'Acquirenti')
        return q.or('tipo_cliente.eq.Acquirente,tipo_cliente.eq.Ibrido');
      if (tipoClienteFilter === 'Proprietari')
        return q.or('tipo_cliente.eq.Proprietario,tipo_cliente.eq.Ibrido');
      return q;
    };

    if (searchQuery.trim() || hasActiveFilters) {
      // Search mode: load all leads with full search fields, no pagination
      let query = supabase
        .from('leads')
        .select(`
          id, nome, cognome, stato, tipo_cliente, stato_venditore, created_at,
          assegnato_a, telefono, email, budget, tipologia_ricerca, zone_ricercate,
          zona_venditore, note_interne, via_immobile,
          lead_immobili(immobili(titolo))
        `)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      // When a text search is active, filter server-side so the result set stays
      // small regardless of total lead count (avoids cutting off contacts when
      // "Tutti" is selected and total leads exceed any fixed client-side limit).
      if (searchQuery.trim()) {
        const sq = searchQuery.trim();
        const phonePattern = sq.replace(/[\s\-]/g, '');
        // Build OR clauses; include both raw and digit-stripped phone patterns
        // so "333 874 8484" matches whether stored with or without spaces.
        const clauses = [
          `nome.ilike.%${sq}%`,
          `cognome.ilike.%${sq}%`,
          `email.ilike.%${sq}%`,
          `telefono.ilike.%${sq}%`,
        ];
        if (phonePattern !== sq) clauses.push(`telefono.ilike.%${phonePattern}%`);
        clauses.push(
          `note_interne.ilike.%${sq}%`,
          `via_immobile.ilike.%${sq}%`,
          `zona_venditore.ilike.%${sq}%`,
        );
        query = (query as any).or(clauses.join(','));
      } else {
        query = (query as any).limit(500);
      }

      query = applyTipoFilter(query as any) as any;
      if (filterDalSito) query = (query as any).eq('fonte', 'sito');

      const { data, error } = await query;
      if (signal?.aborted) return;
      if (error) {
        showError("Errore nella ricerca");
      } else {
        const sanitized = (data || []).map((l: any) => ({
          ...l,
          stato: l.stato === 'nuovo' ? 'Nuovo' : (l.stato || 'Nuovo'),
        }));
        setLeads(sanitized);
        setTotalLeadsCount(sanitized.length);
      }
    } else {
      // Normal paginated mode
      const from = (leadsPage - 1) * LEADS_PAGE_SIZE;
      const to = from + LEADS_PAGE_SIZE - 1;

      let query = supabase
        .from('leads')
        .select(`
          id, nome, cognome, stato, tipo_cliente, stato_venditore, created_at,
          assegnato_a, telefono, email, fonte,
          lead_immobili(immobili(titolo))
        `, { count: 'exact' })
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });
      query = applyTipoFilter(query as any) as any;
      if (filterDalSito) query = (query as any).eq('fonte', 'sito');
      query = (query as any).range(from, to);

      const { data, count, error } = await query;
      if (signal?.aborted) return;
      if (error) {
        showError("Errore nel caricamento CRM");
      } else {
        const sanitized = (data || []).map((l: any) => ({
          ...l,
          stato: l.stato === 'nuovo' ? 'Nuovo' : (l.stato || 'Nuovo'),
        }));
        setLeads(sanitized);
        setTotalLeadsCount(count ?? 0);
      }
    }

    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadsPage, searchQuery, tipoClienteFilter, hasActiveFilters, filterDalSito]);

  // Full query — fired only when a lead dialog is opened
  const fetchLeadDetail = useCallback(async (leadId: string) => {
    setIsLoadingDetail(true);
    const { data, error } = await supabase
      .from('leads')
      .select(`
        *,
        _version,
        immobile_primo_contatto:immobili!immobile_id(id, titolo, prezzo, copertina_url),
        lead_immobili(
          id, stato_interesse, note, created_at,
          immobili(id, titolo, prezzo, copertina_url)
        )
      `)
      .eq('id', leadId)
      .single();

    if (!error && data) {
      const full = { ...data, stato: data.stato === 'nuovo' ? 'Nuovo' : (data.stato || 'Nuovo') };
      setSelectedLead((prev: any) => prev?.id === leadId ? full : prev);
    }

    // Fetch associated valutazione
    const { data: val } = await supabase
      .from('valutazioni')
      .select('slug, stima_min, stima_max')
      .eq('lead_id', leadId)
      .eq('stato', 'Completata')
      .not('slug', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setLeadValutazione(val ? { slug: val.slug, stima_min: val.stima_min, stima_max: val.stima_max } : null);

    setIsLoadingDetail(false);
  }, []);

  // Opens the dialog immediately with card data, then hydrates with full detail
  const openLeadDetail = useCallback((lead: any) => {
    setLeadValutazione(null);
    setSelectedLead(lead);
    fetchLeadDetail(lead.id);
  }, [fetchLeadDetail]);

  // Opens the unified dialog in create mode (no id → INSERT path)
  const openCreateModal = useCallback(() => {
    setSelectedLead({ nome: '', cognome: '', email: '', telefono: '', tipo_cliente: 'Acquirente', stato: 'Nuovo', created_at: new Date().toISOString() });
    setZoneInput('');
  }, []);

  // ── Seller state helpers ────────────────────────────────────────────────────

  /** Optimistically update stato_venditore in the list and persist to Supabase. */
  const updateSellerState = useCallback(async (leadId: string, newState: string) => {
    // Optimistic update
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, stato_venditore: newState } : l));
    const { error } = await supabase
      .from('leads')
      .update({ stato_venditore: newState })
      .eq('id', leadId);
    if (error) {
      showError('Errore aggiornamento stato: ' + error.message);
      // Rollback — re-fetch to restore truth
      fetchLeads();
    }
  }, [fetchLeads]);

  const handleDeleteLead = async () => {
    if (!leadToDelete) return;
    const targetId = leadToDelete.id;
    setLeadToDelete(null);
    const { error } = await supabase
      .from('leads')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', targetId);
    if (error) {
      showError("Errore nell'eliminazione.");
    } else {
      showSuccess('Lead eliminato.');
      fetchLeads();
    }
  };

  /**
   * Automation hook — call when an AI evaluation report is completed for a lead.
   * Updates stato_venditore → "Valutazione fatta" and appends a history note.
   */
  const handleAiEvaluationComplete = useCallback(async (leadId: string) => {
    await updateSellerState(leadId, 'Valutazione fatta');
    await supabase.from('lead_notes').insert({
      lead_id: leadId,
      testo: 'Stato aggiornato: Valutazione AI completata',
      autore: 'Sistema',
    });
  }, [updateSellerState]);

  /**
   * Automation hook — call when a property is listed/linked to a specific lead.
   * Updates stato_venditore → "Chiuso".
   */
  const handlePropertyLinked = useCallback(async (leadId: string) => {
    await updateSellerState(leadId, 'Chiuso');
  }, [updateSellerState]);

  useEffect(() => {
    const controller = new AbortController();
    fetchLeads(controller.signal);
    return () => controller.abort();
  }, [fetchLeads]);

  useEffect(() => { setLeadsPage(1); }, [searchQuery, tipoClienteFilter, filterBudgetMax, filterZona, filterTipologia, filterAgente, filterStato, filterDalSito]);

  // Load distinct zone names used across all leads for autocomplete
  useEffect(() => {
    supabase
      .from('leads')
      .select('zone_ricercate')
      .not('zone_ricercate', 'is', null)
      .then(({ data }) => {
        if (!data) return;
        const unique = Array.from(
          new Set(data.flatMap((r: any) => r.zone_ricercate ?? []))
        ).sort() as string[];
        setZoneSuggestions(unique);
      });
  }, []);

  // Join all zone strings into one text blob for token-based matching.
  // This handles the legacy case where zones were stored as a single
  // space-separated string (e.g. "Ranica Torre Boldone Gorle") instead
  // of individual array items.
  const zoneTextOf = (lead: any) =>
    (lead.zone_ricercate ?? []).join(' ').toLowerCase();

  // Returns true if ALL whitespace-separated tokens in `query` appear
  // somewhere inside `text` (order-independent, partial match per token).
  const allTokensMatch = (text: string, query: string) => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return tokens.length > 0 && tokens.every(t => text.includes(t));
  };

  const filteredLeads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    // Normalize phone: strip all spaces and dashes for comparison
    const qPhone = q.replace(/[\s\-]/g, '');

    return leads.filter(lead => {
      const zoneText = zoneTextOf(lead);

      // Text search (permissive phone + token-based zone matching)
      if (q) {
        const phoneNorm = (lead.telefono ?? '').replace(/[\s\-]/g, '');
        const matchesText =
          `${lead.nome} ${lead.cognome}`.toLowerCase().includes(q) ||
          lead.email?.toLowerCase().includes(q) ||
          (qPhone && phoneNorm.includes(qPhone)) ||
          (lead.budget != null && String(lead.budget).includes(q)) ||
          (lead.tipologia_ricerca ?? []).some((t: string) => t.toLowerCase().includes(q)) ||
          allTokensMatch(zoneText, q) ||
          lead.zona_venditore?.toLowerCase().includes(q) ||
          lead.note_interne?.toLowerCase().includes(q) ||
          lead.via_immobile?.toLowerCase().includes(q);
        if (!matchesText) return false;
      }
      // Budget filter
      if (filterBudgetMax !== null && (lead.budget == null || Number(lead.budget) > filterBudgetMax)) return false;
      // Zona filter — token-based: each word must appear in the zone text
      if (filterZona.trim()) {
        if (!allTokensMatch(zoneText, filterZona)) return false;
      }
      // Tipologia filter
      if (filterTipologia) {
        if (!(lead.tipologia_ricerca ?? []).includes(filterTipologia)) return false;
      }
      // Agente filter
      if (filterAgente && lead.assegnato_a !== filterAgente) return false;
      // Stato filter
      if (filterStato && lead.stato !== filterStato) return false;
      // Fonte filter (client-side guard; DB already filters in paginated mode)
      if (filterDalSito && (lead as any).fonte !== 'sito') return false;

      return true;
    });
  }, [leads, searchQuery, filterBudgetMax, filterZona, filterTipologia, filterAgente, filterStato, filterDalSito]);



  const LeadValidationSchema = z.object({
    nome: z.string().min(2, 'Nome: min 2 caratteri').max(100),
    cognome: z.string().max(100).optional().or(z.literal('')),
    email: z.string().email('Email non valida').optional().or(z.literal('')),
    telefono: z.string().optional(),
  });

  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead) return;

    const validation = LeadValidationSchema.safeParse({
      nome: selectedLead.nome?.trim() ?? '',
      cognome: selectedLead.cognome?.trim() ?? '',
      email: selectedLead.email ?? '',
      telefono: selectedLead.telefono ?? '',
    });

    if (!validation.success) {
      showError(validation.error.errors[0].message);
      return;
    }

    const isCreateMode = !selectedLead.id;
    const payload = {
      nome: selectedLead.nome.trim(),
      cognome: selectedLead.cognome.trim(),
      telefono: selectedLead.telefono || null,
      telefono_fisso: (selectedLead as any).telefono_fisso || null,
      email: selectedLead.email || null,
      assegnato_a: selectedLead.assegnato_a && selectedLead.assegnato_a !== "Nessuno" ? selectedLead.assegnato_a : null,
      tipo_cliente: selectedLead.tipo_cliente || 'Acquirente',
      budget: parseFloat(selectedLead.budget) || null,
      tipologia_ricerca: selectedLead.tipologia_ricerca?.length ? selectedLead.tipologia_ricerca : null,
      zone_ricercate: selectedLead.zone_ricercate?.length ? selectedLead.zone_ricercate : null,
      valutazione_stimata: parseFloat(selectedLead.valutazione_stimata) || null,
      scadenza_esclusiva: selectedLead.scadenza_esclusiva || null,
      motivazione_vendita: selectedLead.motivazione_vendita || null,
      note_interne: selectedLead.note_interne || null,
      zona_venditore: selectedLead.zona_venditore || null,
      stato_venditore: selectedLead.stato_venditore || 'Nuovo',
      via_immobile: selectedLead.via_immobile || null,
    };

    setIsSaving(true);

    if (isCreateMode) {
      const { error } = await supabase.from('leads').insert({ ...payload, stato: 'Nuovo' });
      if (error) {
        showError("Errore nella creazione: " + error.message);
      } else {
        showSuccess("Contatto creato correttamente");
        setZoneInput('');
        fetchLeads();
        setSelectedLead(null);
      }
    } else {
      const version = selectedLead._version ?? 1;
      const { data: updated, error } = await supabase
        .from('leads')
        .update({ ...payload, _version: version + 1 })
        .eq('id', selectedLead.id)
        .eq('_version', version)
        .select('_version');

      if (error) {
        showError("Errore nel salvataggio");
      } else if (!updated || updated.length === 0) {
        showError('Conflitto: il lead è stato modificato da un altro utente. Ricaricamento...');
        fetchLeadDetail(selectedLead.id);
      } else {
        showSuccess("Scheda cliente aggiornata");
        logAudit(selectedLead.id, payload, 'Agente');
        setLeads(prev => prev.map(l => l.id === selectedLead.id ? {
          ...l,
          nome: selectedLead.nome.trim(),
          cognome: selectedLead.cognome.trim(),
          tipo_cliente: selectedLead.tipo_cliente,
          assegnato_a: payload.assegnato_a,
        } : l));
        setZoneInput('');
        setSelectedLead(null);
      }
    }

    setIsSaving(false);
  };

  // Autosave — only fires in edit mode after the user has interacted
  const performAutoSave = useCallback(async (lead: any) => {
    if (!lead?.id || !lead.nome?.trim()) return;
    setAutoSaveStatus('saving');
    const version = lead._version ?? 1;
    const payload = {
      nome: lead.nome.trim(),
      cognome: lead.cognome.trim(),
      telefono: lead.telefono || null,
      telefono_fisso: lead.telefono_fisso || null,
      email: lead.email || null,
      assegnato_a: lead.assegnato_a && lead.assegnato_a !== "Nessuno" ? lead.assegnato_a : null,
      tipo_cliente: lead.tipo_cliente || 'Acquirente',
      budget: parseFloat(lead.budget) || null,
      tipologia_ricerca: lead.tipologia_ricerca?.length ? lead.tipologia_ricerca : null,
      zone_ricercate: lead.zone_ricercate?.length ? lead.zone_ricercate : null,
      valutazione_stimata: parseFloat(lead.valutazione_stimata) || null,
      scadenza_esclusiva: lead.scadenza_esclusiva || null,
      motivazione_vendita: lead.motivazione_vendita || null,
      note_interne: lead.note_interne || null,
      stato_venditore: lead.stato_venditore || 'Nuovo',
      via_immobile: lead.via_immobile || null,
      _version: version + 1,
    };
    const { data: updated, error } = await supabase
      .from('leads')
      .update(payload)
      .eq('id', lead.id)
      .eq('_version', version)
      .select('_version');

    if (error) {
      setAutoSaveStatus('error');
    } else if (!updated || updated.length === 0) {
      showError('Il lead è stato modificato da un altro utente. Ricaricamento...');
      setAutoSaveStatus('error');
      fetchLeadDetail(lead.id);
    } else {
      setSelectedLead((prev: any) => prev?.id === lead.id ? { ...prev, _version: updated[0]._version } : prev);
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, nome: lead.nome.trim(), cognome: lead.cognome.trim(), tipo_cliente: lead.tipo_cliente, assegnato_a: payload.assegnato_a } : l));
      setAutoSaveStatus('saved');
      if (autoSaveStatusTimerRef.current) clearTimeout(autoSaveStatusTimerRef.current);
      autoSaveStatusTimerRef.current = setTimeout(() => setAutoSaveStatus('idle'), 2000);
    }
  }, [fetchLeadDetail]);

  useEffect(() => {
    if (!selectedLead?.id || !hasInteractedRef.current) return;
    if (!selectedLead.nome?.trim()) return;
    pendingSaveRef.current = selectedLead;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      if (!pendingSaveRef.current) return;
      performAutoSave(pendingSaveRef.current);
    }, 1500);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [selectedLead, performAutoSave]);

  const handleUnlinkProperty = async (linkId: string) => {
    const { error } = await supabase.from('lead_immobili').delete().eq('id', linkId);
    if (error) {
      showError("Errore nella rimozione");
    } else {
      setSelectedLead((prev: any) => ({
        ...prev,
        lead_immobili: prev.lead_immobili.filter((li: any) => li.id !== linkId),
      }));
      setUnlinkConfirmId(null);
    }
  };

  const fetchAllProperties = useCallback(async () => {
    setIsLoadingProperties(true);
    const { data, error } = await supabase
      .from('immobili')
      .select('id, titolo, prezzo, copertina_url, stato')
      .neq('stato', 'Venduto')
      .order('created_at', { ascending: false });
    if (!error) setAllProperties(data || []);
    setIsLoadingProperties(false);
  }, []);

  const openPropertyPicker = async () => {
    setIsPropertyPickerOpen(true);
    if (allProperties.length === 0) await fetchAllProperties();
  };

  const handleAssociateProperty = async (immobile: any) => {
    if (!selectedLead) return;
    const { error } = await supabase
      .from('lead_immobili')
      .insert({ lead_id: selectedLead.id, immobile_id: immobile.id, stato_interesse: 'Interessato' });

    if (error) {
      showError("Errore nell'associazione: " + error.message);
      return;
    }

    showSuccess(`"${immobile.titolo}" aggiunto alla wishlist`);
    setIsPropertyPickerOpen(false);
    setPropertySearch('');

    // Re-fetch full detail so the Immobili tab refreshes without closing the dialog
    fetchLeadDetail(selectedLead.id);
  };

  // Reset interaction tracking on new lead
  useEffect(() => {
    if (!selectedLead?.id) {
      hasInteractedRef.current = false;
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      setAutoSaveStatus('idle');
      return;
    }
  }, [selectedLead?.id]);

  // Mark as "interacted" after detail finishes loading (so autosave ignores initial hydration)
  useEffect(() => {
    if (!selectedLead?.id || isLoadingDetail) return;
    const t = setTimeout(() => { hasInteractedRef.current = true; }, 300);
    return () => clearTimeout(t);
  }, [selectedLead?.id, isLoadingDetail]);

  // Fetch tasks whenever a different lead is opened
  useEffect(() => {
    if (!selectedLead?.id) { setLeadTasks([]); return; }
    (async () => {
      const { data } = await supabase
        .from('tasks')
        .select('id, titolo, tipologia, nota, data, ora, stato, agente_id')
        .eq('lead_id', selectedLead.id)
        .order('data', { ascending: true });
      setLeadTasks(data || []);
    })();
  }, [selectedLead?.id]);

  // Fetch events (appuntamenti) whenever a different lead is opened
  useEffect(() => {
    if (!selectedLead?.id) { setLeadEvents([]); return; }
    (async () => {
      const { data } = await supabase
        .from('appuntamenti')
        .select('id, tipologia, data, ora_inizio, ora_fine, note, agente_id')
        .eq('lead_id', selectedLead.id)
        .order('data', { ascending: true })
        .order('ora_inizio', { ascending: true });
      setLeadEvents(data || []);
    })();
  }, [selectedLead?.id]);

  // Fetch notes whenever a different lead is opened
  useEffect(() => {
    if (!selectedLead?.id) { setLeadNotes([]); setNewNoteText(''); return; }
    (async () => {
      const { data } = await supabase
        .from('lead_notes')
        .select('id, testo, autore, created_at')
        .eq('lead_id', selectedLead.id)
        .order('created_at', { ascending: true });
      setLeadNotes(data || []);
    })();
  }, [selectedLead?.id]);

  const handleSaveNote = async () => {
    if (!newNoteText.trim() || !selectedLead?.id) return;
    setIsSavingNote(true);
    const { data, error } = await supabase
      .from('lead_notes')
      .insert({ lead_id: selectedLead.id, testo: newNoteText.trim(), autore: 'Agente' })
      .select('id, testo, autore, created_at')
      .single();
    setIsSavingNote(false);
    if (error) {
      showError('Errore nel salvataggio della nota');
    } else {
      setLeadNotes(prev => [...prev, data]);
      setNewNoteText('');
    }
  };

  // Open lead from navigation state (e.g. coming from Tasks page)
  useEffect(() => {
    if (!loading && pendingOpenLeadIdRef.current && leads.length > 0) {
      const id = pendingOpenLeadIdRef.current;
      pendingOpenLeadIdRef.current = null;
      const lead = leads.find((l: any) => l.id === id);
      if (lead) {
        openLeadDetail(lead);
      } else {
        setSelectedLead({ id, nome: '', cognome: '' });
        fetchLeadDetail(id);
      }
    }
  }, [loading, leads, openLeadDetail, fetchLeadDetail]);

  // Open EventFormModal pre-filled with a lead
  const openEventForLead = useCallback(async (lead: any) => {
    if (agentsForEventModal.length === 0) {
      const [{ data: agents }, { data: props }] = await Promise.all([
        supabase.from('profili_agenti').select('id, nome_completo, colore_calendario'),
        supabase.from('immobili').select('id, titolo').neq('stato', 'Venduto').order('titolo'),
      ]);
      setAgentsForEventModal(agents || []);
      setPropertiesForEventModal(props || []);
    }
    setEventModalDefaultLeadId(lead.id);
    setEventModalDefaultLeadName(`${lead.nome} ${lead.cognome}`);
    setIsEventModalOpen(true);
  }, [agentsForEventModal.length]);

  const cycleLeadTaskStato = async (taskId: string, currentStato: string) => {
    const STATI = ['Da fare', 'In corso', 'Completata'];
    const nextStato = STATI[(STATI.indexOf(currentStato) + 1) % STATI.length];
    setLeadTasks(prev => prev.map(t => t.id === taskId ? { ...t, stato: nextStato } : t));
    const { error } = await supabase.from('tasks').update({ stato: nextStato }).eq('id', taskId);
    if (error) {
      showError('Errore aggiornamento stato');
      setLeadTasks(prev => prev.map(t => t.id === taskId ? { ...t, stato: currentStato } : t));
    }
  };

  const filteredPickerProperties = useMemo(() => {
    const q = propertySearch.toLowerCase();
    if (!q) return allProperties;
    return allProperties.filter(p =>
      p.titolo?.toLowerCase().includes(q)
    );
  }, [allProperties, propertySearch]);


  return (
    <AdminLayout fullHeight>
      <div className="flex flex-col flex-1 overflow-hidden min-h-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 shrink-0">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900">CRM Leads</h1>
          <p className="text-gray-500 mt-1 font-medium">
            {totalLeadsCount} contatti{tipoClienteFilter !== 'Tutti' && ` · ${tipoClienteFilter}`}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Client type toggle */}
          <Tabs value={tipoClienteFilter} onValueChange={(v) => setTipoClienteFilter(v as typeof tipoClienteFilter)}>
            <TabsList className="grid w-[280px] grid-cols-3 rounded-full p-1 bg-muted/50 border border-gray-100">
              <TabsTrigger value="Tutti" className="rounded-full px-3 text-xs font-semibold data-[state=active]:bg-[#94b0ab] data-[state=active]:text-white">Tutti</TabsTrigger>
              <TabsTrigger value="Acquirenti" className="rounded-full px-3 text-xs font-semibold data-[state=active]:bg-[#94b0ab] data-[state=active]:text-white">Acquirenti</TabsTrigger>
              <TabsTrigger value="Proprietari" className="rounded-full px-3 text-xs font-semibold data-[state=active]:bg-[#94b0ab] data-[state=active]:text-white">Proprietari</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={15} />
            <Input
              placeholder="Cerca per nome, telefono, email, zona..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-11 pl-9 w-[280px] rounded-xl border-gray-200 bg-white"
            />
          </div>

          {/* Filters toggle */}
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowFilters(f => !f)}
            className={cn(
              "h-11 rounded-xl border-gray-200 gap-2 font-semibold text-sm",
              (showFilters || hasActiveFilters) && "border-[#94b0ab] text-[#94b0ab] bg-[#94b0ab]/5"
            )}
          >
            <SlidersHorizontal size={15} />
            Filtri
            {hasActiveFilters && (
              <span className="ml-0.5 w-5 h-5 rounded-full bg-[#94b0ab] text-white text-[10px] font-black flex items-center justify-center">
                {[filterBudgetMax !== null, filterZona !== '', filterTipologia !== '', filterAgente !== '', filterStato !== ''].filter(Boolean).length}
              </span>
            )}
          </Button>

          <Button
            onClick={openCreateModal}
            className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-2xl px-7 h-11 shadow-lg shadow-[#94b0ab]/20 font-bold transition-all"
          >
            <Plus className="mr-2" size={16} /> Nuovo Contatto
          </Button>
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4 mb-4 shrink-0">
          <div className="flex flex-wrap gap-4 items-end">
            {/* Budget max */}
            <div className="space-y-1 min-w-[160px]">
              <Label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Budget max</Label>
              <Select value={filterBudgetMax !== null ? String(filterBudgetMax) : '_all'} onValueChange={(v) => setFilterBudgetMax(v === '_all' ? null : Number(v))}>
                <SelectTrigger className="h-9 rounded-xl border-gray-200 bg-slate-50/50 text-sm">
                  <SelectValue placeholder="Qualsiasi" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="_all">Qualsiasi</SelectItem>
                  <SelectItem value="100000">Fino a €100.000</SelectItem>
                  <SelectItem value="150000">Fino a €150.000</SelectItem>
                  <SelectItem value="200000">Fino a €200.000</SelectItem>
                  <SelectItem value="300000">Fino a €300.000</SelectItem>
                  <SelectItem value="500000">Fino a €500.000</SelectItem>
                  <SelectItem value="750000">Fino a €750.000</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Zona */}
            <div className="space-y-1 min-w-[160px]">
              <Label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Zona ricercata</Label>
              <div className="relative">
                <Input
                  value={filterZona}
                  onChange={(e) => setFilterZona(e.target.value)}
                  placeholder="Es: Centro, Bergamo..."
                  className="h-9 rounded-xl border-gray-200 bg-slate-50/50 text-sm"
                />
              </div>
            </div>

            {/* Tipologia */}
            <div className="space-y-1 min-w-[160px]">
              <Label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Tipologia</Label>
              <Select value={filterTipologia || '_all'} onValueChange={(v) => setFilterTipologia(v === '_all' ? '' : v)}>
                <SelectTrigger className="h-9 rounded-xl border-gray-200 bg-slate-50/50 text-sm">
                  <SelectValue placeholder="Qualsiasi" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="_all">Qualsiasi</SelectItem>
                  {['Monolocale','Bilocale','Trilocale','Quadrilocale','Pentalocale+','Villa','Villetta a schiera','Attico','Box','Posto auto','Locale commerciale','Capannone','Terreno'].map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Agente */}
            <div className="space-y-1 min-w-[140px]">
              <Label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Agente</Label>
              <Select value={filterAgente || '_all'} onValueChange={(v) => setFilterAgente(v === '_all' ? '' : v)}>
                <SelectTrigger className="h-9 rounded-xl border-gray-200 bg-slate-50/50 text-sm">
                  <SelectValue placeholder="Tutti" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="_all">Tutti</SelectItem>
                  {AGENTS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Stato */}
            <div className="space-y-1 min-w-[140px]">
              <Label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Stato</Label>
              <Select value={filterStato || '_all'} onValueChange={(v) => setFilterStato(v === '_all' ? '' : v)}>
                <SelectTrigger className="h-9 rounded-xl border-gray-200 bg-slate-50/50 text-sm">
                  <SelectValue placeholder="Tutti" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="_all">Tutti</SelectItem>
                  <SelectItem value="Nuovo">Nuovo</SelectItem>
                  <SelectItem value="In Trattativa">In Trattativa</SelectItem>
                  <SelectItem value="Visita Fissata">Visita Fissata</SelectItem>
                  <SelectItem value="Chiuso">Chiuso</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Dal sito */}
            <div className="space-y-1">
              <Label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Origine</Label>
              <button
                type="button"
                onClick={() => setFilterDalSito(v => !v)}
                className={cn(
                  'h-9 flex items-center gap-2 px-4 rounded-xl border text-sm font-semibold transition-all',
                  filterDalSito
                    ? 'bg-[#94b0ab] border-[#94b0ab] text-white shadow-sm'
                    : 'bg-slate-50/50 border-gray-200 text-gray-500 hover:border-[#94b0ab] hover:text-[#94b0ab]',
                )}
              >
                🌐 Dal sito
              </button>
            </div>

            {/* Reset */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => { setFilterBudgetMax(null); setFilterZona(''); setFilterTipologia(''); setFilterAgente(''); setFilterStato(''); setFilterDalSito(false); }}
                className="h-9 flex items-center gap-1.5 px-3 rounded-xl text-xs font-bold text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors border border-red-100"
              >
                <XIcon size={13} /> Reset filtri
              </button>
            )}
          </div>
        </div>
      )}

      {/* Lead list */}
      <div className="flex-1 overflow-hidden min-h-0">
        <div className="h-full bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-y-auto">
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left table-fixed">
              <colgroup>
                <col style={{ width: '35%' }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: '25%' }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: '10%' }} />
              </colgroup>
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100">
                  <th className="px-8 py-5 text-xs font-bold uppercase tracking-widest text-gray-400">Contatto</th>
                  <th className="px-8 py-5 text-xs font-bold uppercase tracking-widest text-gray-400">Tipo</th>
                  <th className="px-8 py-5 text-xs font-bold uppercase tracking-widest text-gray-400">
                    {tipoClienteFilter === 'Proprietari' ? 'Stato Venditore' : 'Immobile'}
                  </th>
                  <th className="px-8 py-5 text-xs font-bold uppercase tracking-widest text-gray-400">Creato il</th>
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
                      <td className="px-8 py-5"><div className="h-5 bg-gray-100 rounded-full animate-pulse w-20" /></td>
                      <td className="px-8 py-5"><div className="h-3 bg-gray-50 rounded-lg animate-pulse w-32" /></td>
                      <td className="px-8 py-5"><div className="h-3 bg-gray-50 rounded-lg animate-pulse w-20" /></td>
                      <td className="px-8 py-5"><div className="h-8 bg-gray-50 rounded-xl animate-pulse w-16 ml-auto" /></td>
                    </tr>
                  ))
                ) : filteredLeads.length === 0 ? (
                  <tr><td colSpan={5} className="px-8 py-16 text-center text-gray-300 italic">Nessun lead trovato</td></tr>
                ) : filteredLeads.map((lead) => (
                  <tr
                    key={lead.id}
                    className="hover:bg-gray-50/30 transition-colors group cursor-pointer"
                    onClick={() => openLeadDetail(lead)}
                  >
                    <td className="px-8 py-5 min-w-0">
                      <div className="font-bold text-gray-900 truncate">{lead.nome} {lead.cognome}</div>
                      <div className="text-xs text-gray-400 font-medium flex items-center gap-1.5 mt-0.5 min-w-0">
                        <Phone size={10} className="text-gray-300 shrink-0" />
                        <span className="truncate">{lead.telefono || 'N/D'}</span>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <Badge className={cn(
                        "text-[9px] font-black uppercase tracking-widest border",
                        getClientTypeBadge(lead.tipo_cliente)
                      )}>
                        {lead.tipo_cliente || 'Acquirente'}
                      </Badge>
                    </td>
                    <td className="px-8 py-5 min-w-0">
                      {tipoClienteFilter === 'Proprietari' ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Badge className={cn(
                              "text-[9px] font-black uppercase tracking-widest cursor-pointer hover:opacity-75 transition-opacity gap-1",
                              SELLER_STATES[lead.stato_venditore ?? 'Nuovo'] ?? SELLER_STATES['Nuovo']
                            )}>
                              {lead.stato_venditore || 'Nuovo'}
                              <ChevronDown size={9} className="shrink-0" />
                            </Badge>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="rounded-xl min-w-[160px]">
                            {(['Nuovo', 'Valutazione fatta', 'Chiuso'] as const).map(state => (
                              <DropdownMenuItem
                                key={state}
                                onClick={(e) => { e.stopPropagation(); updateSellerState(lead.id, state); }}
                                className={cn(
                                  "rounded-lg text-xs font-semibold cursor-pointer",
                                  lead.stato_venditore === state && "bg-gray-100",
                                )}
                              >
                                <span className={cn(
                                  "w-2 h-2 rounded-full shrink-0 mr-2",
                                  state === 'Nuovo' ? 'bg-blue-400' :
                                  state === 'Valutazione fatta' ? 'bg-amber-400' : 'bg-emerald-400'
                                )} />
                                {state}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        lead.lead_immobili?.[0]?.immobili?.titolo
                          ? <span className="text-xs text-gray-500 truncate block">{lead.lead_immobili[0].immobili.titolo}</span>
                          : <span className="text-xs text-gray-200">—</span>
                      )}
                    </td>
                    <td className="px-8 py-5">
                      <span className="text-xs text-gray-400">
                        {safeFormat(lead.created_at, 'd MMM yyyy', { locale: it })}
                      </span>
                    </td>
                    <td className="px-8 py-5">
                      <div
                        className="flex items-center gap-2 justify-end"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Nuovo evento"
                          onClick={() => openEventForLead(lead)}
                          className="h-8 w-8 p-0 rounded-xl text-gray-400 hover:text-[#94b0ab] hover:bg-[#94b0ab]/5"
                        >
                          <CalendarPlus size={15} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Nuova task"
                          onClick={() => {
                            setQuickTaskLeadId(lead.id);
                            setQuickTaskLeadName(`${lead.nome} ${lead.cognome}`);
                            setIsQuickTaskModalOpen(true);
                          }}
                          className="h-8 w-8 p-0 rounded-xl text-gray-400 hover:text-[#94b0ab] hover:bg-[#94b0ab]/5"
                        >
                          <CheckSquare size={15} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Elimina lead"
                          onClick={() => setLeadToDelete({ id: lead.id, nome: lead.nome, cognome: lead.cognome })}
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

      {/* Pagination */}
      {totalLeadsCount > LEADS_PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 shrink-0">
          <p className="text-xs text-gray-400 font-medium">
            {(leadsPage - 1) * LEADS_PAGE_SIZE + 1}–{Math.min(leadsPage * LEADS_PAGE_SIZE, totalLeadsCount)} di {totalLeadsCount}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={leadsPage === 1}
              onClick={() => setLeadsPage(p => p - 1)}
              className="rounded-xl border-gray-200 h-9 px-4 text-xs font-bold"
            >
              ← Precedente
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={leadsPage * LEADS_PAGE_SIZE >= totalLeadsCount}
              onClick={() => setLeadsPage(p => p + 1)}
              className="rounded-xl border-gray-200 h-9 px-4 text-xs font-bold"
            >
              Successiva →
            </Button>
          </div>
        </div>
      )}
      </div>

      {/* Unified Lead Dialog (create + edit) */}
      <Dialog open={!!selectedLead} onOpenChange={(open) => { if (!open) { setSelectedLead(null); setZoneInput(''); } }}>
        <DialogContent className="w-full sm:max-w-4xl h-[85vh] p-0 overflow-hidden flex flex-col gap-0 border-none shadow-2xl rounded-[2rem]">
          {selectedLead && (
            <form onSubmit={handleSaveDetails} className="flex flex-col min-h-0 flex-1">

              {/* Header — adapts to create vs edit mode */}
              {(() => {
                const isCreate = !selectedLead.id;
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
                        <div className="flex items-center gap-2 flex-wrap">
                          <DialogTitle className="text-xl font-bold text-gray-900 leading-none">
                            {isCreate ? 'Nuovo Contatto' : `${selectedLead.nome} ${selectedLead.cognome}`}
                          </DialogTitle>
                          {!isCreate && (
                            <>
                              <Badge className={cn("px-3 py-1 rounded-full font-bold uppercase tracking-widest text-[10px] border", getClientTypeBadge(selectedLead.tipo_cliente))}>
                                {selectedLead.tipo_cliente || 'Acquirente'}
                              </Badge>
                              {(selectedLead.tipo_cliente === 'Proprietario' || selectedLead.tipo_cliente === 'Ibrido') && (
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <button type="button" className={cn(
                                      "px-3 py-1 rounded-full font-bold uppercase tracking-widest text-[10px] border cursor-pointer hover:opacity-80 transition-opacity",
                                      selectedLead.stato_venditore === 'Valutazione fatta' ? "bg-amber-100 text-amber-700 border-amber-200" :
                                      selectedLead.stato_venditore === 'Chiuso' ? "bg-green-100 text-green-700 border-green-200" :
                                      "bg-blue-100 text-blue-700 border-blue-200"
                                    )}>
                                      {selectedLead.stato_venditore || 'Nuovo'}
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-2 rounded-xl shadow-xl border-none" align="start">
                                    <div className="flex flex-col gap-1">
                                      {['Nuovo', 'Valutazione fatta', 'Chiuso'].map(stato => (
                                        <button
                                          key={stato}
                                          type="button"
                                          onClick={() => setSelectedLead({...selectedLead, stato_venditore: stato})}
                                          className={cn(
                                            "px-3 py-1.5 rounded-lg text-xs font-bold text-left transition-colors",
                                            selectedLead.stato_venditore === stato ? "bg-gray-100" : "hover:bg-gray-50"
                                          )}
                                        >
                                          {stato}
                                        </button>
                                      ))}
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              )}
                            </>
                          )}
                        </div>
                        <DialogDescription className="text-xs text-gray-400 font-medium mt-1 flex items-center gap-2">
                          {isCreate
                            ? 'Compila il profilo e salva per creare il contatto.'
                            : <>Lead acquisito il {safeFormat(selectedLead.created_at, 'PPP', { locale: it })}</>
                          }
                          {isLoadingDetail && <span className="inline-block w-3 h-3 rounded-full border-2 border-[#94b0ab]/40 border-t-[#94b0ab] animate-spin" />}
                        </DialogDescription>
                      </div>
                    </div>
                  </DialogHeader>
                );
              })()}

              {/* Tabs */}
              {(() => {
                const isCreate = !selectedLead.id;
                return (
                  <Tabs defaultValue="profilo" className="flex flex-col flex-1 min-h-0">
                    {/* Tab bar */}
                    <div className="px-7 border-b bg-white shrink-0">
                      <TabsList className="bg-transparent p-0 h-12 gap-8 w-full justify-start">
                        <TabsTrigger value="profilo" className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#94b0ab] data-[state=active]:bg-transparent px-0 h-full font-bold text-gray-400 data-[state=active]:text-[#94b0ab] gap-2">
                          <User size={15} /> Profilo
                        </TabsTrigger>
                        {selectedLead.tipo_cliente !== 'Proprietario' && (
                          <TabsTrigger value="immobili" disabled={isCreate} className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#94b0ab] data-[state=active]:bg-transparent px-0 h-full font-bold text-gray-400 data-[state=active]:text-[#94b0ab] gap-2 disabled:opacity-30 disabled:cursor-not-allowed">
                            <Heart size={15} /> Immobili
                          </TabsTrigger>
                        )}
                        <TabsTrigger value="eventi" disabled={isCreate} className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#94b0ab] data-[state=active]:bg-transparent px-0 h-full font-bold text-gray-400 data-[state=active]:text-[#94b0ab] gap-2 disabled:opacity-30 disabled:cursor-not-allowed">
                          <Calendar size={15} /> Eventi
                          {leadEvents.length > 0 && (
                            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[#94b0ab]/10 text-[#94b0ab] text-[10px] font-black">{leadEvents.length}</span>
                          )}
                        </TabsTrigger>
                        <TabsTrigger value="task" disabled={isCreate} className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#94b0ab] data-[state=active]:bg-transparent px-0 h-full font-bold text-gray-400 data-[state=active]:text-[#94b0ab] gap-2 disabled:opacity-30 disabled:cursor-not-allowed">
                          <CheckSquare size={15} /> Task
                          {leadTasks.length > 0 && (
                            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[#94b0ab]/10 text-[#94b0ab] text-[10px] font-black">{leadTasks.length}</span>
                          )}
                        </TabsTrigger>
                        <TabsTrigger value="note" disabled={isCreate} className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#94b0ab] data-[state=active]:bg-transparent px-0 h-full font-bold text-gray-400 data-[state=active]:text-[#94b0ab] gap-2 disabled:opacity-30 disabled:cursor-not-allowed">
                          <FileText size={15} /> Note
                          {leadNotes.length > 0 && (
                            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[#94b0ab]/10 text-[#94b0ab] text-[10px] font-black">{leadNotes.length}</span>
                          )}
                        </TabsTrigger>
                      </TabsList>
                    </div>

                {/* Scrollable content area */}
                <div className="flex-1 overflow-y-auto bg-slate-50">

                  {/* ── PROFILO TAB ── */}
                  <TabsContent value="profilo" className="mt-0 p-6 space-y-5 animate-in fade-in slide-in-from-bottom-2">

                    {/* Card: Anagrafica e Contatti */}
                    <div className="bg-white border rounded-xl shadow-sm p-5 space-y-5">
                      <div className="flex items-center gap-2">
                        <UserCheck size={15} className="text-[#94b0ab]" />
                        <h3 className="text-sm font-semibold text-muted-foreground tracking-wide uppercase">Anagrafica e Contatti</h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="space-y-2">
                          <Label className="text-xs font-bold text-gray-500">Nome <span className="text-red-400">*</span></Label>
                          <Input
                            required
                            value={selectedLead.nome || ''}
                            onChange={(e) => setSelectedLead({...selectedLead, nome: e.target.value})}
                            placeholder="Mario"
                            className="h-11 rounded-xl border-gray-200 bg-slate-50/50"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-bold text-gray-500">Cognome</Label>
                          <Input
                            value={selectedLead.cognome || ''}
                            onChange={(e) => setSelectedLead({...selectedLead, cognome: e.target.value})}
                            placeholder="Rossi"
                            className="h-11 rounded-xl border-gray-200 bg-slate-50/50"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-bold text-gray-500">Email</Label>
                          <Input
                            type="email"
                            value={selectedLead.email || ''}
                            onChange={(e) => setSelectedLead({...selectedLead, email: e.target.value})}
                            className="h-11 rounded-xl border-gray-200 bg-slate-50/50"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-bold text-gray-500">Cellulare</Label>
                          <Input
                            value={selectedLead.telefono || ''}
                            onChange={(e) => setSelectedLead({...selectedLead, telefono: e.target.value})}
                            className="h-11 rounded-xl border-gray-200 bg-slate-50/50"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-bold text-gray-500">Telefono Fisso</Label>
                          <Input
                            value={(selectedLead as any).telefono_fisso || ''}
                            onChange={(e) => setSelectedLead({...selectedLead, telefono_fisso: e.target.value} as any)}
                            className="h-11 rounded-xl border-gray-200 bg-slate-50/50"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-bold text-gray-500">Tipo Cliente</Label>
                          <Select
                            value={selectedLead.tipo_cliente || "Acquirente"}
                            onValueChange={(v) => setSelectedLead({...selectedLead, tipo_cliente: v})}
                          >
                            <SelectTrigger className="h-11 rounded-xl border-gray-200 bg-slate-50/50">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                              <SelectItem value="Acquirente">Acquirente</SelectItem>
                              <SelectItem value="Proprietario">Proprietario</SelectItem>
                              <SelectItem value="Ibrido">Ibrido (Entrambi)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    {/* Card: Esigenze di Acquisto (conditional) */}
                    <div className={cn(!(selectedLead.tipo_cliente === 'Acquirente' || selectedLead.tipo_cliente === 'Ibrido') && 'hidden')}>
                      <div className="bg-white border border-blue-100 rounded-xl shadow-sm p-5 space-y-5">
                        <div className="flex items-center gap-2">
                          <Briefcase size={15} className="text-blue-500" />
                          <h3 className="text-sm font-semibold text-blue-600 tracking-wide uppercase">Esigenze di Acquisto</h3>
                        </div>
                        <div className="flex flex-col gap-4">
                          {/* Budget Massimo — full width */}
                          <div className="space-y-2">
                            <Label className="text-xs font-bold text-gray-500">Budget Massimo (€)</Label>
                            <div className="flex flex-wrap gap-1.5">
                              {[250000, 100000, 150000, 200000, 300000, 500000, 750000, 1000000].map((preset) => {
                                const isActive = Number(selectedLead.budget) === preset;
                                return (
                                  <button
                                    key={preset}
                                    type="button"
                                    onClick={() => setSelectedLead({...selectedLead, budget: isActive ? '' : String(preset)})}
                                    className={cn(
                                      "inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all duration-150",
                                      isActive
                                        ? "bg-blue-500 text-white border-blue-500 shadow-sm shadow-blue-200/60"
                                        : "bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50"
                                    )}
                                  >
                                    {preset >= 1000000 ? '€1.000.000+' : `€${preset.toLocaleString('it-IT')}`}
                                  </button>
                                );
                              })}
                            </div>
                            {/* Formatted currency input */}
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none select-none">€</span>
                              <Input
                                type="text"
                                inputMode="numeric"
                                value={selectedLead.budget
                                  ? Number(String(selectedLead.budget).replace(/\./g, '')).toLocaleString('it-IT')
                                  : ''}
                                onChange={(e) => {
                                  const raw = e.target.value.replace(/\./g, '').replace(/[^0-9]/g, '');
                                  setSelectedLead({...selectedLead, budget: raw});
                                }}
                                placeholder="Importo personalizzato..."
                                className="h-10 pl-8 rounded-xl border-gray-200 bg-slate-50/50"
                              />
                            </div>
                          </div>

                          {/* Tipologie Ricercate — multi-select pills */}
                          <div className="space-y-2">
                            <Label className="text-xs font-bold text-gray-500">Tipologie Ricercate</Label>
                            <div className="flex flex-wrap gap-1.5">
                              {['Monolocale','Bilocale','Trilocale','Quadrilocale','Pentalocale+','Villa','Villetta a schiera','Attico','Box','Posto auto','Locale commerciale','Capannone','Terreno'].map(t => {
                                const active = (selectedLead.tipologia_ricerca ?? []).includes(t);
                                return (
                                  <button
                                    key={t}
                                    type="button"
                                    onClick={() => {
                                      const cur: string[] = selectedLead.tipologia_ricerca ?? [];
                                      setSelectedLead({
                                        ...selectedLead,
                                        tipologia_ricerca: active ? cur.filter((v: string) => v !== t) : [...cur, t],
                                      });
                                    }}
                                    className={cn(
                                      "inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all duration-150",
                                      active
                                        ? "bg-blue-500 text-white border-blue-500 shadow-sm shadow-blue-200/60"
                                        : "bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50"
                                    )}
                                  >
                                    {t}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Zone di Ricerca — tag input with autocomplete */}
                          <div className="space-y-2">
                            <Label className="text-xs font-bold text-gray-500 flex items-center gap-1.5">
                              <MapPin size={11} className="text-blue-400" /> Zone di Ricerca
                            </Label>
                            {/* Selected zone tags */}
                            {(selectedLead.zone_ricercate ?? []).length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {(selectedLead.zone_ricercate as string[]).map(z => (
                                  <span
                                    key={z}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-500 text-white border border-blue-500"
                                  >
                                    {z}
                                    <button
                                      type="button"
                                      onClick={() => setSelectedLead({
                                        ...selectedLead,
                                        zone_ricercate: (selectedLead.zone_ricercate as string[]).filter((v: string) => v !== z),
                                      })}
                                      className="ml-0.5 hover:opacity-70"
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )}
                            {/* Input + suggestions */}
                            <div className="relative">
                              <div className="flex gap-2">
                                <Input
                                  value={zoneInput}
                                  onChange={(e) => setZoneInput(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      const vals = zoneInput.split(',').map(v => v.trim()).filter(v => v.length > 0);
                                      if (vals.length === 0) return;
                                      const cur: string[] = selectedLead.zone_ricercate ?? [];
                                      const newZones = vals.filter(v => !cur.includes(v));
                                      if (newZones.length === 0) { setZoneInput(''); return; }
                                      setSelectedLead({ ...selectedLead, zone_ricercate: [...cur, ...newZones] });
                                      newZones.forEach(v => { if (!zoneSuggestions.includes(v)) setZoneSuggestions(prev => [...prev, v].sort()); });
                                      setZoneInput('');
                                    }
                                  }}
                                  placeholder="Es: Centro, Bolognina (separa con virgola + Invio)"
                                  className="h-10 rounded-xl border-gray-200 bg-slate-50/50 flex-1 text-sm"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const vals = zoneInput.split(',').map(v => v.trim()).filter(v => v.length > 0);
                                    if (vals.length === 0) return;
                                    const cur: string[] = selectedLead.zone_ricercate ?? [];
                                    const newZones = vals.filter(v => !cur.includes(v));
                                    if (newZones.length === 0) { setZoneInput(''); return; }
                                    setSelectedLead({ ...selectedLead, zone_ricercate: [...cur, ...newZones] });
                                    newZones.forEach(v => { if (!zoneSuggestions.includes(v)) setZoneSuggestions(prev => [...prev, v].sort()); });
                                    setZoneInput('');
                                  }}
                                  className="h-10 px-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-bold shrink-0 transition-colors"
                                >
                                  <Plus size={16} />
                                </button>
                              </div>
                              {/* Autocomplete suggestions */}
                              {zoneInput.trim() && zoneSuggestions.filter(s =>
                                s.toLowerCase().includes(zoneInput.toLowerCase()) &&
                                !(selectedLead.zone_ricercate ?? []).includes(s)
                              ).length > 0 && (
                                <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                                  {zoneSuggestions
                                    .filter(s =>
                                      s.toLowerCase().includes(zoneInput.toLowerCase()) &&
                                      !(selectedLead.zone_ricercate ?? []).includes(s)
                                    )
                                    .slice(0, 6)
                                    .map(s => (
                                      <button
                                        key={s}
                                        type="button"
                                        onMouseDown={(e) => {
                                          e.preventDefault();
                                          const cur: string[] = selectedLead.zone_ricercate ?? [];
                                          setSelectedLead({ ...selectedLead, zone_ricercate: [...cur, s] });
                                          setZoneInput('');
                                        }}
                                        className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                                      >
                                        {s}
                                      </button>
                                    ))
                                  }
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card: Dati di Vendita (conditional) */}
                    <div className={cn(!(selectedLead.tipo_cliente === 'Proprietario' || selectedLead.tipo_cliente === 'Ibrido') && 'hidden')}>
                      <div className="bg-white border border-red-100 rounded-xl shadow-sm p-5 space-y-5">
                        <div className="flex items-center gap-2">
                          <TrendingUp size={15} className="text-red-500" />
                          <h3 className="text-sm font-semibold text-red-600 tracking-wide uppercase">Dati di Vendita</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          <div className="space-y-2">
                            <Label className="text-xs font-bold text-gray-500">Via / Indirizzo</Label>
                            <Input
                              value={selectedLead.via_immobile || ''}
                              onChange={(e) => setSelectedLead({...selectedLead, via_immobile: e.target.value})}
                              placeholder="es. Via Roma 12"
                              className="h-11 rounded-xl border-gray-200 bg-slate-50/50"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-bold text-gray-500">Valutazione AI</Label>
                            {leadValutazione ? (
                              <div className="flex items-center justify-between h-11 rounded-xl border border-gray-200 bg-slate-50/50 px-3">
                                <span className="font-bold text-gray-800 text-sm">
                                  €{((leadValutazione.stima_min ?? 0) / 1000).toFixed(0)}k – €{((leadValutazione.stima_max ?? 0) / 1000).toFixed(0)}k
                                </span>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      navigator.clipboard.writeText(`${window.location.origin}/report/${leadValutazione.slug}`);
                                      showSuccess('Link copiato!');
                                    }}
                                    className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[#94b0ab] hover:text-teal-700 transition-colors"
                                    title="Copia link report"
                                  >
                                    <Copy size={12} />
                                    Copia link
                                  </button>
                                  <a
                                    href={`/report/${leadValutazione.slug}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-gray-600 transition-colors"
                                    title="Apri report"
                                  >
                                    <ExternalLink size={12} />
                                  </a>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between h-11 rounded-xl border border-dashed border-gray-200 bg-slate-50/20 px-3">
                                <span className="text-xs text-gray-400 italic">Nessuna valutazione completata</span>
                                {(selectedLead.tipo_cliente === 'Proprietario' || selectedLead.tipo_cliente === 'Ibrido') && (
                                  <button
                                    type="button"
                                    onClick={() => navigate('/valutazioni', { state: { openWizard: true, leadId: selectedLead.id } })}
                                    className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[#94b0ab] hover:text-teal-700 transition-colors"
                                  >
                                    <Calculator size={12} />
                                    Crea
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-bold text-gray-500">Scadenza Esclusiva</Label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  className={cn(
                                    "w-full justify-start text-left font-normal rounded-xl border-gray-200 bg-slate-50/50 hover:bg-gray-100 h-11 gap-2",
                                    !selectedLead.scadenza_esclusiva && "text-muted-foreground"
                                  )}
                                >
                                  <Calendar size={14} className="text-[#94b0ab] shrink-0" />
                                  {selectedLead.scadenza_esclusiva
                                    ? format(parseISO(selectedLead.scadenza_esclusiva), 'd MMM yyyy', { locale: it })
                                    : "Seleziona una data"}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0 border-none rounded-2xl shadow-xl" align="start">
                                <CalendarPicker
                                  mode="single"
                                  selected={selectedLead.scadenza_esclusiva ? parseISO(selectedLead.scadenza_esclusiva) : undefined}
                                  onSelect={(date) => setSelectedLead({...selectedLead, scadenza_esclusiva: date ? format(date, 'yyyy-MM-dd') : null})}
                                  initialFocus
                                  locale={it}
                                />
                              </PopoverContent>
                            </Popover>
                          </div>
                          <div className="space-y-2 col-span-full">
                            <Label className="text-xs font-bold text-gray-500">Motivazione Vendita</Label>
                            <Textarea
                              value={selectedLead.motivazione_vendita || ''}
                              onChange={(e) => setSelectedLead({...selectedLead, motivazione_vendita: e.target.value})}
                              placeholder="Descrivi la motivazione del cliente..."
                              className="rounded-xl border-gray-200 bg-slate-50/50 min-h-[80px] resize-none"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  {/* ── IMMOBILI TAB ── */}
                  <TabsContent value="immobili" className="mt-0 p-6 space-y-6">

                    {/* ── Primo Contatto ── */}
                    {selectedLead.immobile_primo_contatto ? (
                      <div className="space-y-2">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Primo Contatto</h3>
                        <div className="bg-white rounded-xl border border-[#94b0ab]/25 shadow-sm overflow-hidden flex items-stretch">
                          <div className="w-24 shrink-0 bg-slate-100 overflow-hidden">
                            {selectedLead.immobile_primo_contatto.copertina_url ? (
                              <img src={selectedLead.immobile_primo_contatto.copertina_url} alt={selectedLead.immobile_primo_contatto.titolo} className="w-full h-full object-cover min-h-[72px]" />
                            ) : (
                              <div className="w-full min-h-[72px] flex items-center justify-center text-slate-300"><HomeIcon size={22} /></div>
                            )}
                          </div>
                          <div className="flex-1 px-4 py-3 min-w-0 flex items-center justify-between gap-4">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <Badge className="bg-[#94b0ab] text-white text-[9px] font-black uppercase tracking-widest border-none">Primo Contatto</Badge>
                              </div>
                              <p className="font-bold text-gray-900 truncate text-sm">{selectedLead.immobile_primo_contatto.titolo}</p>
                            </div>
                            <span className="text-base font-extrabold text-[#94b0ab] shrink-0">{formatPrice(selectedLead.immobile_primo_contatto.prezzo)}</span>
                          </div>
                        </div>
                      </div>
                    ) : null}


                    {/* ── Immobili Collegati Manualmente ── */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Collegati</h3>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-xl font-bold gap-1.5 border-[#94b0ab] text-[#94b0ab] hover:bg-[#94b0ab]/5 cursor-pointer text-xs h-8"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); openPropertyPicker(); }}
                        >
                          <Plus size={13} /> Associa
                        </Button>
                      </div>

                      {!selectedLead.lead_immobili || selectedLead.lead_immobili.length === 0 ? (
                        <div className="py-6 text-center bg-white rounded-xl border border-dashed border-gray-200 shadow-sm">
                          <Heart className="mx-auto text-gray-200 mb-2" size={24} />
                          <p className="text-xs text-gray-400 italic">Nessun immobile collegato manualmente.</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {selectedLead.lead_immobili.map((item: any) => (
                            <div key={item.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex items-stretch group hover:border-[#94b0ab]/40 transition-all">
                              <div className="w-20 shrink-0 bg-slate-100 overflow-hidden">
                                {item.immobili.copertina_url ? (
                                  <img src={item.immobili.copertina_url} alt={item.immobili.titolo} className="w-full h-full object-cover min-h-[68px]" />
                                ) : (
                                  <div className="w-full min-h-[68px] flex items-center justify-center text-slate-300"><HomeIcon size={20} /></div>
                                )}
                              </div>
                              <div className="flex-1 px-4 py-3 min-w-0">
                                <p className="font-bold text-gray-900 truncate text-sm leading-tight">{item.immobili.titolo}</p>
                                <div className="flex items-center gap-2 mt-1.5">
                                  <span className="text-sm font-bold text-[#94b0ab]">{formatPrice(item.immobili.prezzo)}</span>
                                  <Badge variant="outline" className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 border-gray-200 text-gray-500">{item.stato_interesse}</Badge>
                                </div>
                              </div>
                              <div className="flex items-center pr-3 shrink-0">
                                {unlinkConfirmId === item.id ? (
                                  <div className="flex items-center gap-1 text-xs">
                                    <span className="text-gray-500 font-medium whitespace-nowrap">Rimuovi?</span>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleUnlinkProperty(item.id); }}
                                      className="px-2 py-1 rounded-lg font-bold text-red-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                                    >Sì</button>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setUnlinkConfirmId(null); }}
                                      className="px-2 py-1 rounded-lg font-bold text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
                                    >No</button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button type="button" variant="ghost" size="icon" className="text-gray-300 hover:text-red-400 rounded-lg transition-colors" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setUnlinkConfirmId(item.id); }} title="Rimuovi collegamento">
                                      <Trash2 size={14} />
                                    </Button>
                                    <Button type="button" variant="ghost" size="icon" className="text-gray-300 hover:text-[#94b0ab] rounded-lg" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }} title="Apri immobile">
                                      <ExternalLink size={15} />
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                  </TabsContent>

                  {/* ── EVENTI TAB ── */}
                  <TabsContent value="eventi" className="mt-0 p-6 space-y-4 animate-in fade-in slide-in-from-bottom-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">
                        Appuntamenti ({leadEvents.length})
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => { setEditingLeadEvent(null); openEventForLead(selectedLead); }}
                        className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl h-8 px-3 text-xs font-bold gap-1.5"
                      >
                        <Plus size={13} /> Nuovo Evento
                      </Button>
                    </div>

                    {leadEvents.length === 0 ? (
                      <div className="py-10 text-center bg-white rounded-xl border border-dashed border-gray-200 shadow-sm">
                        <Calendar className="mx-auto text-gray-200 mb-2" size={26} />
                        <p className="text-xs text-gray-400 italic">Nessun appuntamento per questo lead.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {leadEvents.map((evt: any) => {
                          const colors = TIPOLOGIA_COLORS[evt.tipologia] ?? TIPOLOGIA_COLORS['Altro'];
                          const isPast = evt.data < new Date().toISOString().slice(0, 10);
                          return (
                            <button
                              key={evt.id}
                              type="button"
                              onClick={() => { setEditingLeadEvent(evt); setIsEventModalOpen(true); }}
                              className="w-full text-left bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-start gap-3 hover:border-[#94b0ab]/30 transition-all"
                            >
                              <div
                                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                                style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}` }}
                              >
                                <Calendar size={14} style={{ color: colors.text }} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                  <span className="text-xs font-bold text-gray-800">{evt.tipologia}</span>
                                  {isPast && (
                                    <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 border border-gray-200">Passato</span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-500">
                                  {format(parseISO(evt.data), 'EEEE d MMMM yyyy', { locale: it })}
                                  {evt.ora_inizio ? ` — ${evt.ora_inizio.slice(0, 5)}` : ''}
                                  {evt.ora_fine ? ` → ${evt.ora_fine.slice(0, 5)}` : ''}
                                </p>
                                {evt.note && <p className="text-xs text-gray-400 mt-1 truncate">{evt.note}</p>}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </TabsContent>

                  {/* ── TASK TAB ── */}
                  <TabsContent value="task" className="mt-0 p-6 space-y-5 animate-in fade-in slide-in-from-bottom-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">
                        Task ({leadTasks.length})
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        onClick={(e) => { e.preventDefault(); setIsLeadTaskModalOpen(true); }}
                        className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl h-8 px-3 text-xs font-bold gap-1.5"
                      >
                        <Plus size={13} /> Nuova Task
                      </Button>
                    </div>

                    {leadTasks.length === 0 ? (
                      <div className="py-10 text-center bg-white rounded-xl border border-dashed border-gray-200 shadow-sm">
                        <CheckSquare className="mx-auto text-gray-200 mb-2" size={26} />
                        <p className="text-xs text-gray-400 italic">Nessuna task per questo lead.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {leadTasks.map((task: any) => {
                          const cfg = TIPOLOGIA_CONFIG[task.tipologia as string] ?? TIPOLOGIA_CONFIG['Chiamata'];
                          const Icon = cfg.icon;
                          const STATO_BADGE: Record<string, string> = {
                            'Da fare':    'bg-amber-100 text-amber-700 border-amber-200',
                            'In corso':   'bg-blue-100 text-blue-700 border-blue-200',
                            'Completata': 'bg-emerald-100 text-emerald-700 border-emerald-200',
                          };
                          return (
                            <div key={task.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-start gap-3 hover:border-[#94b0ab]/30 transition-all">
                              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5', cfg.bg)}>
                                <Icon size={15} className={cfg.color} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className="text-xs font-bold text-gray-500">{task.tipologia}</span>
                                  <span className="text-xs text-gray-400">{task.data}{task.ora ? ` — ${task.ora.slice(0, 5)}` : ''}</span>
                                </div>
                                {task.nota && (
                                  <p className="text-sm text-gray-700 leading-relaxed">{task.nota}</p>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={(e) => { e.preventDefault(); cycleLeadTaskStato(task.id, task.stato); }}
                                className={cn(
                                  'text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border shrink-0 hover:opacity-80 transition-opacity',
                                  STATO_BADGE[task.stato] ?? 'bg-gray-100 text-gray-500'
                                )}
                              >
                                {task.stato}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </TabsContent>

                  {/* ── NOTE TAB ── */}
                  <TabsContent value="note" className="mt-0 p-6 space-y-5 animate-in fade-in slide-in-from-bottom-2">

                    {/* Messaggio dal sito (note_interne o prima nota da Sistema) */}
                    {(() => {
                      const siteMsg = selectedLead.note_interne?.trim()
                        ? selectedLead.note_interne
                        : leadNotes.find((n: any) => n.autore !== 'Agente')?.testo;
                      if (!siteMsg) return null;
                      const siteDate = leadNotes.find((n: any) => n.autore !== 'Agente')?.created_at;
                      return (
                        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 space-y-2">
                          <div className="flex items-center gap-2">
                            <MessageSquare size={14} className="text-blue-500 shrink-0" />
                            <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Messaggio dal sito</span>
                            {siteDate && (
                              <span className="ml-auto text-[10px] text-blue-400 font-medium">
                                {safeFormat(siteDate, 'd MMM yyyy HH:mm', { locale: it })}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-blue-800 leading-relaxed whitespace-pre-wrap">{siteMsg}</p>
                        </div>
                      );
                    })()}

                    {/* List of notes */}
                    <div className="space-y-2">
                      {leadNotes.filter((n: any) => n.autore === 'Agente').length === 0 && !selectedLead.note_interne && leadNotes.filter((n: any) => n.autore !== 'Agente').length === 0 ? (
                        <div className="py-8 text-center bg-white rounded-xl border border-dashed border-gray-200 shadow-sm">
                          <FileText className="mx-auto text-gray-200 mb-2" size={26} />
                          <p className="text-xs text-gray-400 italic">Nessuna nota per questo lead.</p>
                        </div>
                      ) : (
                        leadNotes.map((note: any) => (
                          <div key={note.id} className={cn(
                            "rounded-xl border p-4",
                            note.autore === 'Agente'
                              ? "bg-white border-gray-100 shadow-sm"
                              : "hidden" // Sistema notes shown above as site message
                          )}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-bold text-[#94b0ab]">{note.autore}</span>
                              <span className="text-[10px] text-gray-400 font-medium">
                                {safeFormat(note.created_at, 'd MMM yyyy HH:mm', { locale: it })}
                              </span>
                            </div>
                            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{note.testo}</p>
                          </div>
                        ))
                      )}
                    </div>

                    {/* New note input */}
                    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4 space-y-3">
                      <Label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Aggiungi nota</Label>
                      <Textarea
                        value={newNoteText}
                        onChange={(e) => setNewNoteText(e.target.value)}
                        placeholder="Scrivi una nota su questo lead..."
                        className="rounded-xl border-gray-200 bg-slate-50/50 min-h-[80px] resize-none text-sm"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                            e.preventDefault();
                            handleSaveNote();
                          }
                        }}
                      />
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-300">Ctrl+Invio per salvare</span>
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleSaveNote}
                          disabled={isSavingNote || !newNoteText.trim()}
                          className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl h-8 px-4 text-xs font-bold gap-1.5"
                        >
                          <Save size={12} />
                          {isSavingNote ? 'Salvataggio...' : 'Salva nota'}
                        </Button>
                      </div>
                    </div>

                  </TabsContent>

                </div>
                  </Tabs>
                );
              })()}

              {/* Fixed Footer */}
              {(() => {
                const isCreate = !selectedLead.id;
                return (
                  <div className="px-7 py-4 bg-white border-t shrink-0 flex items-center justify-between gap-4">
                    {/* Autosave status (edit mode only) */}
                    {!isCreate ? (
                      <div className="flex items-center gap-1.5 min-w-0">
                        {autoSaveStatus === 'saving' && (
                          <span className="text-xs text-gray-400 animate-pulse">Salvataggio...</span>
                        )}
                        {autoSaveStatus === 'saved' && (
                          <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                            <span className="text-[11px]">✓</span> Salvato
                          </span>
                        )}
                        {autoSaveStatus === 'error' && (
                          <span className="text-xs text-red-500 font-semibold">Errore salvataggio</span>
                        )}
                        {autoSaveStatus === 'idle' && (
                          <span className="text-xs text-gray-300">Salvataggio automatico attivo</span>
                        )}
                      </div>
                    ) : <div />}
                    {/* Save button */}
                    <Button
                      type="submit"
                      disabled={isSaving}
                      className={cn(
                        "shrink-0 font-bold transition-all active:scale-[0.97]",
                        isCreate
                          ? "bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-2xl px-8 h-11 shadow-md shadow-[#94b0ab]/20 text-sm"
                          : "bg-white hover:bg-slate-50 text-gray-600 border border-gray-200 rounded-xl px-4 h-9 text-xs shadow-none"
                      )}
                    >
                      {isSaving
                        ? (isCreate ? 'Creazione...' : 'Salva')
                        : isCreate
                          ? <><Plus size={16} className="mr-2" /> Crea Contatto</>
                          : <><Save size={13} className="mr-1.5" /> Salva</>
                      }
                    </Button>
                  </div>
                );
              })()}

            </form>
          )}
        </DialogContent>
      </Dialog>
      {/* Task Modal */}
      <TaskModal
        open={isLeadTaskModalOpen}
        onClose={() => setIsLeadTaskModalOpen(false)}
        defaultLeadId={selectedLead?.id}
        defaultLeadName={selectedLead ? `${selectedLead.nome} ${selectedLead.cognome}` : undefined}
        onSaved={async () => {
          setIsLeadTaskModalOpen(false);
          if (!selectedLead?.id) return;
          const { data } = await supabase
            .from('tasks')
            .select('id, tipologia, nota, data, ora, stato, agente_id')
            .eq('lead_id', selectedLead.id)
            .order('data', { ascending: true });
          if (data) setLeadTasks(data);
        }}
      />

      {/* Property Picker Dialog */}
      <Dialog open={isPropertyPickerOpen} onOpenChange={(open) => { setIsPropertyPickerOpen(open); if (!open) setPropertySearch(''); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] p-0 overflow-hidden flex flex-col gap-0 border-none shadow-2xl rounded-[2rem]">
          <DialogHeader className="px-7 pt-6 pb-4 border-b bg-white shrink-0">
            <DialogTitle className="text-lg font-bold text-gray-900">Associa un Immobile</DialogTitle>
            <DialogDescription className="text-sm text-gray-400">
              Seleziona una proprietà da aggiungere alla wishlist del cliente.
            </DialogDescription>
            <div className="relative mt-3">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <Input
                placeholder="Cerca per titolo, zona o città..."
                value={propertySearch}
                onChange={(e) => setPropertySearch(e.target.value)}
                className="h-11 pl-10 rounded-xl border-gray-200 bg-slate-50"
                autoFocus
              />
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto bg-slate-50 p-4 space-y-3">
            {isLoadingProperties ? (
              <div className="py-16 text-center text-gray-400 text-sm animate-pulse">Caricamento immobili...</div>
            ) : filteredPickerProperties.length === 0 ? (
              <div className="py-16 text-center text-gray-400 text-sm">Nessun immobile trovato.</div>
            ) : filteredPickerProperties.map((prop) => (
              <div key={prop.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex items-stretch group hover:border-[#94b0ab]/40 transition-all">
                {/* Thumbnail */}
                <div className="w-20 shrink-0 bg-slate-100 relative overflow-hidden">
                  {prop.copertina_url ? (
                    <img src={prop.copertina_url} alt={prop.titolo} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300 min-h-[72px]">
                      <HomeIcon size={22} />
                    </div>
                  )}
                </div>
                {/* Info */}
                <div className="flex-1 px-4 py-3 min-w-0">
                  <p className="font-bold text-gray-900 truncate text-sm leading-tight">{prop.titolo}</p>
                  {prop.zone?.nome && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      {prop.zone.nome}
                    </p>
                  )}
                  <p className="text-sm font-bold text-[#94b0ab] mt-1.5">{formatPrice(prop.prezzo)}</p>
                </div>
                {/* CTA */}
                <div className="flex items-center pr-4 shrink-0">
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-xl bg-[#94b0ab] hover:bg-[#7a948f] text-white font-bold px-4 h-9 cursor-pointer transition-all"
                    onClick={() => handleAssociateProperty(prop)}
                  >
                    Seleziona
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Quick Task Modal (from list row) */}
      <TaskModal
        open={isQuickTaskModalOpen}
        onClose={() => setIsQuickTaskModalOpen(false)}
        defaultLeadId={quickTaskLeadId}
        defaultLeadName={quickTaskLeadName}
        onSaved={() => { setIsQuickTaskModalOpen(false); fetchLeads(); }}
      />

      {/* Event Form Modal */}
      <EventFormModal
        open={isEventModalOpen}
        onClose={() => { setIsEventModalOpen(false); setEditingLeadEvent(null); }}
        onSaved={async () => {
          setIsEventModalOpen(false);
          setEditingLeadEvent(null);
          if (selectedLead?.id) {
            const { data } = await supabase
              .from('appuntamenti')
              .select('id, tipologia, data, ora_inizio, ora_fine, note, agente_id')
              .eq('lead_id', selectedLead.id)
              .order('data', { ascending: true })
              .order('ora_inizio', { ascending: true });
            setLeadEvents(data || []);
          }
        }}
        event={editingLeadEvent ?? undefined}
        defaultLeadId={editingLeadEvent ? undefined : eventModalDefaultLeadId}
        defaultLeadName={editingLeadEvent ? undefined : eventModalDefaultLeadName}
        agents={agentsForEventModal}
        properties={propertiesForEventModal}
      />

      <AlertDialog open={!!leadToDelete} onOpenChange={(open) => !open && setLeadToDelete(null)}>
        <AlertDialogContent className="rounded-[2rem] border-none shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold">Confermi l'eliminazione?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 font-medium">
              Stai per eliminare <span className="font-bold text-gray-800">{leadToDelete?.nome} {leadToDelete?.cognome}</span>. L'operazione è irreversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-xl border-gray-200 font-bold">Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteLead} className="bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold">Sì, elimina</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </AdminLayout>
  );
};

export default Leads;