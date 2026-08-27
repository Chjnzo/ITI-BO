"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { showError, showSuccess } from '@/utils/toast';
import { z } from 'zod';
import { format, parseISO } from 'date-fns';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Phone, Home as HomeIcon,
  User, Search, Save, X,
  Calendar, CalendarPlus, Plus, ExternalLink,
  Heart, UserCheck, Briefcase, MapPin, ChevronDown, Trash2,
  CheckSquare, AlertTriangle, SlidersHorizontal, X as XIcon,
  MessageSquare, FileText,
} from 'lucide-react';
import TaskModal from '@/components/TaskModal';
import EventFormModal, { TIPOLOGIA_COLORS, type Appointment, type AgentProfile } from '@/components/agenda/EventFormModal';
import { cn } from '@/lib/utils';

// compratori.stato pipeline — new mapping, no equivalent existed pre-pivot
// (SELLER_STATES in the old Leads.tsx covered only the 3 seller-side states).
const STATO_COLORS: Record<string, string> = {
  'Nuovo':       'bg-blue-50 border border-blue-100 text-blue-700',
  'Contattato':  'bg-sky-50 border border-sky-100 text-sky-700',
  'Trattativa':  'bg-amber-50 border border-amber-100 text-amber-700',
  'Chiuso':      'bg-emerald-50 border border-emerald-100 text-emerald-700',
  'Perso':       'bg-red-50 border border-red-100 text-red-700',
};
const STATO_PIPELINE = ['Nuovo', 'Contattato', 'Trattativa', 'Chiuso', 'Perso'] as const;

interface PropertyRef {
  id: string;
  titolo: string;
  prezzo?: number | null;
  copertina_url?: string | null;
  stato?: string | null;
  zone?: { nome: string } | null;
}

interface CompratoreImmobileLink {
  id: string;
  stato_interesse?: string | null;
  note?: string | null;
  created_at?: string;
  immobili: PropertyRef;
}

interface CompratoreRecord {
  id?: string;
  nome: string;
  cognome: string;
  email?: string | null;
  telefono?: string | null;
  budget?: number | string | null;
  tipologia_ricerca?: string[] | null;
  zone_ricercate?: string[] | null;
  note_interne?: string | null;
  stato?: string | null;
  is_deleted?: boolean;
  deleted_at?: string | null;
  _version?: number;
  created_at?: string;
  agente_id?: string | null;
  compratori_immobili?: CompratoreImmobileLink[];
}

interface CompratoreTaskItem {
  id: string;
  titolo?: string | null;
  nota?: string | null;
  data?: string | null;
  ora?: string | null;
  stato: string;
  agente_id?: string | null;
  telefono?: string | null;
  urgente?: boolean;
}

interface CompratoreEventItem {
  id: string;
  tipologia: string;
  data: string;
  ora_inizio?: string | null;
  ora_fine?: string | null;
  note?: string | null;
  agente_id?: string | null;
  contatto_id?: string | null;
}

interface CompratoreNote {
  id: string;
  testo: string;
  autore: string;
  created_at: string;
}

interface EventPropertyOption {
  id: string;
  titolo: string;
}

const formatPrice = (price: number | null | undefined) => {
  if (!price) return 'N/D';
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(price);
};

const safeFormat = (date: string | number | Date | null | undefined, fmt: string, options?: object): string => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return format(d, fmt, options);
};

interface CompratoriViewProps {
  /** Old leads.id passed via router state from Tasks.tsx — translated to the new
   * compratori.id through contatti.lead_id_origine before opening the dialog. */
  deepLinkLeadId?: string | null;
}

const CompratoriView = ({ deepLinkLeadId }: CompratoriViewProps) => {
  const pendingDeepLinkRef = useRef<string | null>(deepLinkLeadId ?? null);
  const [compratori, setCompratori] = useState<CompratoreRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCompratore, setSelectedCompratore] = useState<CompratoreRecord | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");

  // Property picker state
  const [isPropertyPickerOpen, setIsPropertyPickerOpen] = useState(false);
  const [allProperties, setAllProperties] = useState<PropertyRef[]>([]);
  const [propertySearch, setPropertySearch] = useState('');
  const [isLoadingProperties, setIsLoadingProperties] = useState(false);

  // Autosave
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<CompratoreRecord | null>(null);
  const hasInteractedRef = useRef(false);

  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const [unlinkConfirmId, setUnlinkConfirmId] = useState<string | null>(null);
  const [compratoreToDelete, setCompratoreToDelete] = useState<{ id: string; nome: string; cognome: string } | null>(null);

  // Tasks state
  const [compratoreTasks, setCompratoreTasks] = useState<CompratoreTaskItem[]>([]);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskDetail, setTaskDetail] = useState<CompratoreTaskItem | null>(null);
  const [taskDetailNota, setTaskDetailNota] = useState('');
  const [taskDetailSaving, setTaskDetailSaving] = useState(false);

  // Events state (appuntamenti linked via contatto_id)
  const [compratoreEvents, setCompratoreEvents] = useState<CompratoreEventItem[]>([]);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [eventModalDefaultId, setEventModalDefaultId] = useState<string | undefined>(undefined);
  const [eventModalDefaultName, setEventModalDefaultName] = useState<string | undefined>(undefined);
  const [agentsForEventModal, setAgentsForEventModal] = useState<AgentProfile[]>([]);
  const [propertiesForEventModal, setPropertiesForEventModal] = useState<EventPropertyOption[]>([]);
  const [editingEvent, setEditingEvent] = useState<Appointment | null>(null);

  // Quick task from list row
  const [quickTaskId, setQuickTaskId] = useState<string | undefined>(undefined);
  const [quickTaskName, setQuickTaskName] = useState<string | undefined>(undefined);
  const [isQuickTaskModalOpen, setIsQuickTaskModalOpen] = useState(false);

  // Autocomplete suggestions for zone_ricercate
  const [zoneSuggestions, setZoneSuggestions] = useState<string[]>([]);
  const [zoneInput, setZoneInput] = useState('');

  // Advanced filters
  const [showFilters, setShowFilters] = useState(false);
  const [filterBudgetMin, setFilterBudgetMin] = useState<number | null>(null);
  const [filterBudgetMax, setFilterBudgetMax] = useState<number | null>(null);
  const [filterZona, setFilterZona] = useState('');
  const [filterTipologia, setFilterTipologia] = useState('');
  const [filterStato, setFilterStato] = useState('');

  // Notes tab
  const [compratoreNotes, setCompratoreNotes] = useState<CompratoreNote[]>([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);

  const hasActiveFilters = filterBudgetMin !== null || filterBudgetMax !== null || filterZona.trim() !== '' || filterTipologia !== '' || filterStato !== '';

  // Slim query — only fields needed to render the list rows
  const fetchCompratori = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);

    if (searchQuery.trim() || hasActiveFilters) {
      // Search mode: load all matches with full search fields, no pagination
      let query = supabase
        .from('compratori')
        .select(`
          id, nome, cognome, stato, budget, tipologia_ricerca, zone_ricercate,
          note_interne, telefono, email,
          contatti(created_at, agente_id),
          compratori_immobili(immobili(titolo))
        `)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false, foreignTable: 'contatti' });

      if (searchQuery.trim()) {
        const sq = searchQuery.trim();
        const tokens = sq.toLowerCase().split(/\s+/).filter(Boolean);
        for (const token of tokens) {
          const tokenPhone = token.replace(/[\s-]/g, '');
          const clauses = [
            `nome.ilike.%${token}%`,
            `cognome.ilike.%${token}%`,
            `email.ilike.%${token}%`,
            `telefono.ilike.%${tokenPhone}%`,
            `note_interne.ilike.%${token}%`,
          ];
          query = query.or(clauses.join(','));
        }
      } else {
        if (filterBudgetMin !== null) query = query.gte('budget', filterBudgetMin);
        if (filterBudgetMax !== null) query = query.lte('budget', filterBudgetMax);
        if (filterStato)              query = query.eq('stato', filterStato);
        if (filterTipologia)          query = query.contains('tipologia_ricerca', [filterTipologia]);
        query = query.limit(2000);
      }

      const { data, error } = await query;
      if (signal?.aborted) return;
      if (error) {
        showError("Errore nella ricerca");
      } else {
        const sanitized = (data || []) as unknown as CompratoreRecord[];
        setCompratori(sanitized);
        setTotalCount(sanitized.length);
      }
    } else {
      // Normal paginated mode
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, count, error } = await supabase
        .from('compratori')
        .select(`
          id, nome, cognome, stato, telefono, email,
          contatti(created_at, agente_id),
          compratori_immobili(immobili(titolo))
        `, { count: 'exact' })
        .eq('is_deleted', false)
        .order('created_at', { ascending: false, foreignTable: 'contatti' })
        .range(from, to);

      if (signal?.aborted) return;
      if (error) {
        showError("Errore nel caricamento contatti");
      } else {
        setCompratori((data || []) as unknown as CompratoreRecord[]);
        setTotalCount(count ?? 0);
      }
    }

    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, searchQuery, hasActiveFilters, filterBudgetMin, filterBudgetMax, filterZona, filterTipologia, filterStato]);

  // Full query — fired only when a compratore dialog is opened
  const fetchCompratoreDetail = useCallback(async (id: string) => {
    setIsLoadingDetail(true);
    const { data, error } = await supabase
      .from('compratori')
      .select(`
        *,
        _version,
        contatti(created_at, agente_id),
        compratori_immobili(
          id, stato_interesse, note, created_at,
          immobili(id, titolo, prezzo, copertina_url)
        )
      `)
      .eq('id', id)
      .single();

    if (!error && data) {
      const row = data as unknown as CompratoreRecord & { contatti?: { created_at?: string; agente_id?: string | null } };
      const full: CompratoreRecord = {
        ...row,
        created_at: row.contatti?.created_at,
        agente_id: row.contatti?.agente_id,
      };
      setSelectedCompratore((prev) => prev?.id === id ? full : prev);
    } else if (error) {
      showError('Errore nel caricamento del dettaglio contatto');
    }

    setIsLoadingDetail(false);
  }, []);

  // Opens the dialog immediately with row data, then hydrates with full detail
  const openCompratoreDetail = useCallback((compratore: CompratoreRecord) => {
    setSelectedCompratore(compratore);
    if (compratore.id) fetchCompratoreDetail(compratore.id);
  }, [fetchCompratoreDetail]);

  // Opens the unified dialog in create mode (no id → INSERT path)
  const openCreateModal = useCallback(() => {
    setSelectedCompratore({ nome: '', cognome: '', email: '', telefono: '', stato: 'Nuovo', created_at: new Date().toISOString() });
    setZoneInput('');
  }, []);

  const handleDeleteCompratore = async () => {
    if (!compratoreToDelete) return;
    const targetId = compratoreToDelete.id;
    setCompratoreToDelete(null);
    const { error } = await supabase
      .from('compratori')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', targetId);
    if (error) {
      showError("Errore nell'eliminazione.");
    } else {
      showSuccess('Contatto eliminato.');
      fetchCompratori();
    }
  };

  /** Optimistically update stato in the list and persist to Supabase. */
  const updateStato = useCallback(async (id: string, newStato: string) => {
    setCompratori(prev => prev.map(c => c.id === id ? { ...c, stato: newStato } : c));
    const { error } = await supabase
      .from('compratori')
      .update({ stato: newStato })
      .eq('id', id);
    if (error) {
      showError('Errore aggiornamento stato: ' + error.message);
      fetchCompratori();
    }
  }, [fetchCompratori]);

  useEffect(() => {
    const controller = new AbortController();
    fetchCompratori(controller.signal);
    return () => controller.abort();
  }, [fetchCompratori]);

  useEffect(() => { setPage(1); }, [searchQuery, filterBudgetMin, filterBudgetMax, filterZona, filterTipologia, filterStato]);

  // Load distinct zone names used across all compratori for autocomplete
  useEffect(() => {
    supabase
      .from('compratori')
      .select('zone_ricercate')
      .not('zone_ricercate', 'is', null)
      .then(({ data }) => {
        if (!data) return;
        const unique = Array.from(
          new Set(data.flatMap((r) => r.zone_ricercate ?? []))
        ).sort() as string[];
        setZoneSuggestions(unique);
      });
  }, []);

  // Join all zone strings into one text blob for token-based matching.
  const zoneTextOf = (c: CompratoreRecord) =>
    (c.zone_ricercate ?? []).join(' ').toLowerCase();

  // Returns true if ALL whitespace-separated tokens in `query` appear
  // somewhere inside `text` (order-independent, partial match per token).
  const allTokensMatch = (text: string, query: string) => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return tokens.length > 0 && tokens.every(t => text.includes(t));
  };

  const isSearchOrFilterMode = searchQuery.trim() !== '' || hasActiveFilters;

  const filteredCompratori = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const tokens = q.split(/\s+/).filter(Boolean);

    return compratori.filter(c => {
      const zoneText = zoneTextOf(c);

      if (tokens.length > 0) {
        const phoneNorm = (c.telefono ?? '').replace(/[\s-]/g, '');
        const fullName = `${c.nome ?? ''} ${c.cognome ?? ''}`.toLowerCase();
        const budgetStr = c.budget != null ? String(Math.floor(Number(c.budget))) : '';
        const matchesAllTokens = tokens.every(token => {
          const tokenPhone = token.replace(/[\s-]/g, '');
          return (
            fullName.includes(token) ||
            c.email?.toLowerCase().includes(token) ||
            (tokenPhone && phoneNorm.includes(tokenPhone)) ||
            budgetStr.includes(token) ||
            (c.tipologia_ricerca ?? []).some((t: string) => t.toLowerCase().includes(token)) ||
            zoneText.includes(token) ||
            c.note_interne?.toLowerCase().includes(token)
          );
        });
        if (!matchesAllTokens) return false;
      }
      if (filterBudgetMin !== null && (c.budget == null || Number(c.budget) < filterBudgetMin)) return false;
      if (filterBudgetMax !== null && (c.budget == null || Number(c.budget) > filterBudgetMax)) return false;
      if (filterZona.trim()) {
        if (!allTokensMatch(zoneText, filterZona)) return false;
      }
      if (filterTipologia) {
        if (!(c.tipologia_ricerca ?? []).includes(filterTipologia)) return false;
      }
      if (filterStato && c.stato !== filterStato) return false;

      return true;
    });
  }, [compratori, searchQuery, filterBudgetMin, filterBudgetMax, filterZona, filterTipologia, filterStato]);

  const displayCount = isSearchOrFilterMode ? filteredCompratori.length : totalCount;
  const pagedCompratori = isSearchOrFilterMode
    ? filteredCompratori.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    : filteredCompratori;

  const CompratoreValidationSchema = z.object({
    nome: z.string().max(100).optional().or(z.literal('')),
    cognome: z.string().max(100).optional().or(z.literal('')),
    email: z.string().email('Email non valida').optional().or(z.literal('')),
    telefono: z.string().optional(),
  }).refine(
    (data) => (data.nome?.trim() ?? '').length > 0 || (data.cognome?.trim() ?? '').length > 0,
    { message: 'Inserisci almeno il nome o il cognome' },
  );

  const buildPayload = (c: CompratoreRecord) => ({
    nome: c.nome.trim(),
    cognome: c.cognome.trim(),
    telefono: c.telefono || null,
    email: c.email || null,
    budget: parseFloat(String(c.budget)) || null,
    tipologia_ricerca: c.tipologia_ricerca?.length ? c.tipologia_ricerca : null,
    zone_ricercate: c.zone_ricercate?.length ? c.zone_ricercate : null,
    note_interne: c.note_interne || null,
  });

  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompratore) return;

    const validation = CompratoreValidationSchema.safeParse({
      nome: selectedCompratore.nome?.trim() ?? '',
      cognome: selectedCompratore.cognome?.trim() ?? '',
      email: selectedCompratore.email ?? '',
      telefono: selectedCompratore.telefono ?? '',
    });

    if (!validation.success) {
      showError(validation.error.errors[0].message);
      return;
    }

    const isCreateMode = !selectedCompratore.id;
    const payload = buildPayload(selectedCompratore);

    setIsSaving(true);

    if (isCreateMode) {
      // Two-step insert: contatti first (base row), then compratori with the same id.
      // No automatic rollback if the second insert fails — surfaced via showError.
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
        .from('compratori')
        .insert({ id: contatto.id, ...payload, stato: 'Nuovo' });

      if (error) {
        showError("Errore nella creazione: " + error.message);
      } else {
        showSuccess("Contatto creato correttamente");
        setZoneInput('');
        fetchCompratori();
        setSelectedCompratore(null);
      }
    } else {
      const version = selectedCompratore._version ?? 1;
      const { data: updated, error } = await supabase
        .from('compratori')
        .update({ ...payload, _version: version + 1 })
        .eq('id', selectedCompratore.id)
        .eq('_version', version)
        .select('_version');

      if (error) {
        showError("Errore nel salvataggio");
      } else if (!updated || updated.length === 0) {
        showError('Conflitto: il contatto è stato modificato da un altro utente. Ricaricamento...');
        fetchCompratoreDetail(selectedCompratore.id!);
      } else {
        showSuccess("Scheda cliente aggiornata");
        setCompratori(prev => prev.map(c => c.id === selectedCompratore.id ? {
          ...c,
          nome: selectedCompratore.nome.trim(),
          cognome: selectedCompratore.cognome.trim(),
        } : c));
        setZoneInput('');
        setSelectedCompratore(null);
      }
    }

    setIsSaving(false);
  };

  // Autosave — only fires in edit mode after the user has interacted
  const performAutoSave = useCallback(async (c: CompratoreRecord) => {
    if (!c?.id || !c.nome?.trim()) return;
    setAutoSaveStatus('saving');
    const version = c._version ?? 1;
    const payload = { ...buildPayload(c), _version: version + 1 };
    const { data: updated, error } = await supabase
      .from('compratori')
      .update(payload)
      .eq('id', c.id)
      .eq('_version', version)
      .select('_version');

    if (error) {
      setAutoSaveStatus('error');
    } else if (!updated || updated.length === 0) {
      showError('Il contatto è stato modificato da un altro utente. Ricaricamento...');
      setAutoSaveStatus('error');
      if (c.id) fetchCompratoreDetail(c.id);
    } else {
      setSelectedCompratore((prev) => prev?.id === c.id ? ({ ...prev, _version: updated[0]._version } as CompratoreRecord) : prev);
      setCompratori(prev => prev.map(x => x.id === c.id ? { ...x, nome: c.nome.trim(), cognome: c.cognome.trim() } : x));
      setAutoSaveStatus('saved');
      if (autoSaveStatusTimerRef.current) clearTimeout(autoSaveStatusTimerRef.current);
      autoSaveStatusTimerRef.current = setTimeout(() => setAutoSaveStatus('idle'), 2000);
    }
  }, [fetchCompratoreDetail]);

  useEffect(() => {
    if (!selectedCompratore?.id || !hasInteractedRef.current) return;
    if (!selectedCompratore.nome?.trim()) return;
    pendingSaveRef.current = selectedCompratore;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      if (!pendingSaveRef.current) return;
      performAutoSave(pendingSaveRef.current);
    }, 1500);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [selectedCompratore, performAutoSave]);

  // Reset interaction tracking on new compratore
  useEffect(() => {
    if (!selectedCompratore?.id) {
      hasInteractedRef.current = false;
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      setAutoSaveStatus('idle');
      return;
    }
  }, [selectedCompratore?.id]);

  // Mark as "interacted" after detail finishes loading (so autosave ignores initial hydration)
  useEffect(() => {
    if (!selectedCompratore?.id || isLoadingDetail) return;
    const t = setTimeout(() => { hasInteractedRef.current = true; }, 300);
    return () => clearTimeout(t);
  }, [selectedCompratore?.id, isLoadingDetail]);

  const handleUnlinkProperty = async (linkId: string) => {
    const { error } = await supabase.from('compratori_immobili').delete().eq('id', linkId);
    if (error) {
      showError("Errore nella rimozione");
    } else {
      setSelectedCompratore((prev) => prev ? {
        ...prev,
        compratori_immobili: (prev.compratori_immobili ?? []).filter((li) => li.id !== linkId),
      } : prev);
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

  const handleAssociateProperty = async (immobile: PropertyRef) => {
    if (!selectedCompratore) return;
    const { error } = await supabase
      .from('compratori_immobili')
      .insert({ compratore_id: selectedCompratore.id, immobile_id: immobile.id, stato_interesse: 'Interessato' });

    if (error) {
      showError("Errore nell'associazione: " + error.message);
      return;
    }

    showSuccess(`"${immobile.titolo}" aggiunto alla wishlist`);
    setIsPropertyPickerOpen(false);
    setPropertySearch('');

    fetchCompratoreDetail(selectedCompratore.id!);
  };

  // Fetch tasks whenever a different compratore is opened
  useEffect(() => {
    if (!selectedCompratore?.id) { setCompratoreTasks([]); return; }
    (async () => {
      const { data } = await supabase
        .from('tasks')
        .select('id, titolo, nota, data, ora, stato, agente_id, telefono, urgente')
        .eq('contatto_id', selectedCompratore.id)
        .order('urgente', { ascending: false })
        .order('data', { ascending: true });
      setCompratoreTasks(data || []);
    })();
  }, [selectedCompratore?.id]);

  // Fetch events (appuntamenti) whenever a different compratore is opened
  useEffect(() => {
    if (!selectedCompratore?.id) { setCompratoreEvents([]); return; }
    (async () => {
      const { data } = await supabase
        .from('appuntamenti')
        .select('id, tipologia, data, ora_inizio, ora_fine, note, agente_id, contatto_id')
        .eq('contatto_id', selectedCompratore.id)
        .order('data', { ascending: true })
        .order('ora_inizio', { ascending: true });
      setCompratoreEvents(data || []);
    })();
  }, [selectedCompratore?.id]);

  // Fetch notes whenever a different compratore is opened
  useEffect(() => {
    if (!selectedCompratore?.id) { setCompratoreNotes([]); setNewNoteText(''); return; }
    (async () => {
      const { data } = await supabase
        .from('lead_notes')
        .select('id, testo, autore, created_at')
        .eq('contatto_id', selectedCompratore.id)
        .order('created_at', { ascending: true });
      setCompratoreNotes(data || []);
    })();
  }, [selectedCompratore?.id]);

  const handleSaveNote = async () => {
    if (!newNoteText.trim() || !selectedCompratore?.id) return;
    setIsSavingNote(true);
    const { data, error } = await supabase
      .from('lead_notes')
      .insert({ contatto_id: selectedCompratore.id, testo: newNoteText.trim(), autore: 'Agente' })
      .select('id, testo, autore, created_at')
      .single();
    setIsSavingNote(false);
    if (error) {
      showError('Errore nel salvataggio della nota');
    } else {
      setCompratoreNotes(prev => [...prev, data]);
      setNewNoteText('');
    }
  };

  // Open compratore from navigation state (e.g. coming from Tasks page).
  // contatti.id is freshly generated during the pivot backfill and does NOT equal
  // the old leads.id, so the old id is translated via contatti.lead_id_origine first.
  useEffect(() => {
    if (loading || !pendingDeepLinkRef.current) return;
    const oldLeadId = pendingDeepLinkRef.current;
    pendingDeepLinkRef.current = null;
    (async () => {
      const { data: contatto } = await supabase
        .from('contatti')
        .select('id')
        .eq('lead_id_origine', oldLeadId)
        .maybeSingle();
      if (!contatto?.id) return;
      const existing = compratori.find((c) => c.id === contatto.id);
      if (existing) {
        openCompratoreDetail(existing);
      } else {
        setSelectedCompratore({ id: contatto.id, nome: '', cognome: '' });
        fetchCompratoreDetail(contatto.id);
      }
    })();
  }, [loading, compratori, openCompratoreDetail, fetchCompratoreDetail]);

  // Open EventFormModal pre-filled with a compratore
  const openEventForCompratore = useCallback(async (c: CompratoreRecord) => {
    if (agentsForEventModal.length === 0) {
      const [{ data: agents }, { data: props }] = await Promise.all([
        supabase.from('profili_agenti').select('id, nome_completo, colore_calendario'),
        supabase.from('immobili').select('id, titolo').neq('stato', 'Venduto').order('titolo'),
      ]);
      setAgentsForEventModal(agents || []);
      setPropertiesForEventModal(props || []);
    }
    setEventModalDefaultId(c.id);
    setEventModalDefaultName(`${c.nome} ${c.cognome}`);
    setIsEventModalOpen(true);
  }, [agentsForEventModal.length]);

  const cycleTaskStato = async (taskId: string, currentStato: string) => {
    const STATI = ['Da fare', 'In corso', 'Completata'];
    const nextStato = STATI[(STATI.indexOf(currentStato) + 1) % STATI.length];
    setCompratoreTasks(prev => prev.map(t => t.id === taskId ? { ...t, stato: nextStato } : t));
    if (taskDetail?.id === taskId) setTaskDetail((prev) => prev ? { ...prev, stato: nextStato } : prev);
    const { error } = await supabase.from('tasks').update({ stato: nextStato }).eq('id', taskId);
    if (error) {
      showError('Errore aggiornamento stato');
      setCompratoreTasks(prev => prev.map(t => t.id === taskId ? { ...t, stato: currentStato } : t));
    }
  };

  const toggleTaskUrgente = async (taskId: string, currentUrgente: boolean | undefined) => {
    const newUrgente = !currentUrgente;
    setCompratoreTasks(prev => prev.map(t => t.id === taskId ? { ...t, urgente: newUrgente } : t));
    if (taskDetail?.id === taskId) setTaskDetail((prev) => prev ? { ...prev, urgente: newUrgente } : prev);
    const { error } = await supabase.from('tasks').update({ urgente: newUrgente }).eq('id', taskId);
    if (error) {
      showError('Errore aggiornamento urgenza');
      setCompratoreTasks(prev => prev.map(t => t.id === taskId ? { ...t, urgente: currentUrgente } : t));
      if (taskDetail?.id === taskId) setTaskDetail((prev) => prev ? { ...prev, urgente: currentUrgente } : prev);
    }
  };

  const saveTaskNota = async () => {
    if (!taskDetail) return;
    setTaskDetailSaving(true);
    const { error } = await supabase.from('tasks').update({ nota: taskDetailNota }).eq('id', taskDetail.id);
    if (error) {
      showError('Errore nel salvataggio della nota');
    } else {
      setCompratoreTasks(prev => prev.map(t => t.id === taskDetail.id ? { ...t, nota: taskDetailNota } : t));
      showSuccess('Nota aggiornata');
      setTaskDetail(null);
    }
    setTaskDetailSaving(false);
  };

  const filteredPickerProperties = useMemo(() => {
    const q = propertySearch.toLowerCase();
    if (!q) return allProperties;
    return allProperties.filter(p => p.titolo?.toLowerCase().includes(q));
  }, [allProperties, propertySearch]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden min-h-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 shrink-0 pt-2">
        <div>
          <p className="text-gray-500 font-medium">{displayCount} compratori</p>
        </div>

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
              placeholder="Cerca per nome, telefono, email, zona..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoComplete="off"
              name="search-compratori"
              className="h-11 pl-9 w-[280px] rounded-xl border-gray-200 bg-white"
            />
          </div>

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
                {[filterBudgetMin !== null || filterBudgetMax !== null, filterZona !== '', filterTipologia !== '', filterStato !== ''].filter(Boolean).length}
              </span>
            )}
          </Button>

          <Button
            onClick={openCreateModal}
            className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-2xl px-7 h-11 shadow-lg shadow-[#94b0ab]/20 font-bold transition-all"
          >
            <Plus className="mr-2" size={16} /> Nuovo Compratore
          </Button>
        </div>
      </div>

      {showFilters && (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4 mb-4 shrink-0">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1">
              <Label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Budget (€)</Label>
              <div className="flex items-center gap-1.5">
                <Select value={filterBudgetMin !== null ? String(filterBudgetMin) : '_all'} onValueChange={(v) => setFilterBudgetMin(v === '_all' ? null : Number(v))}>
                  <SelectTrigger className="h-9 w-[148px] rounded-xl border-gray-200 bg-slate-50/50 text-sm">
                    <SelectValue placeholder="Da..." />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="_all">Da qualsiasi</SelectItem>
                    <SelectItem value="50000">Da €50.000</SelectItem>
                    <SelectItem value="100000">Da €100.000</SelectItem>
                    <SelectItem value="150000">Da €150.000</SelectItem>
                    <SelectItem value="200000">Da €200.000</SelectItem>
                    <SelectItem value="250000">Da €250.000</SelectItem>
                    <SelectItem value="300000">Da €300.000</SelectItem>
                    <SelectItem value="400000">Da €400.000</SelectItem>
                    <SelectItem value="500000">Da €500.000</SelectItem>
                    <SelectItem value="750000">Da €750.000</SelectItem>
                    <SelectItem value="1000000">Da €1.000.000</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-xs text-gray-400 shrink-0">—</span>
                <Select value={filterBudgetMax !== null ? String(filterBudgetMax) : '_all'} onValueChange={(v) => setFilterBudgetMax(v === '_all' ? null : Number(v))}>
                  <SelectTrigger className="h-9 w-[148px] rounded-xl border-gray-200 bg-slate-50/50 text-sm">
                    <SelectValue placeholder="A..." />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="_all">A qualsiasi</SelectItem>
                    <SelectItem value="50000">A €50.000</SelectItem>
                    <SelectItem value="100000">A €100.000</SelectItem>
                    <SelectItem value="150000">A €150.000</SelectItem>
                    <SelectItem value="200000">A €200.000</SelectItem>
                    <SelectItem value="250000">A €250.000</SelectItem>
                    <SelectItem value="300000">A €300.000</SelectItem>
                    <SelectItem value="400000">A €400.000</SelectItem>
                    <SelectItem value="500000">A €500.000</SelectItem>
                    <SelectItem value="750000">A €750.000</SelectItem>
                    <SelectItem value="1000000">A €1.000.000</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1 min-w-[160px]">
              <Label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Zona ricercata</Label>
              <Input
                value={filterZona}
                onChange={(e) => setFilterZona(e.target.value)}
                placeholder="Es: Centro, Bergamo..."
                className="h-9 rounded-xl border-gray-200 bg-slate-50/50 text-sm"
              />
            </div>

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

            <div className="space-y-1 min-w-[140px]">
              <Label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Stato</Label>
              <Select value={filterStato || '_all'} onValueChange={(v) => setFilterStato(v === '_all' ? '' : v)}>
                <SelectTrigger className="h-9 rounded-xl border-gray-200 bg-slate-50/50 text-sm">
                  <SelectValue placeholder="Tutti" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="_all">Tutti</SelectItem>
                  {STATO_PIPELINE.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => { setFilterBudgetMin(null); setFilterBudgetMax(null); setFilterZona(''); setFilterTipologia(''); setFilterStato(''); }}
                className="h-9 flex items-center gap-1.5 px-3 rounded-xl text-xs font-bold text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors border border-red-100"
              >
                <XIcon size={13} /> Reset filtri
              </button>
            )}
          </div>
        </div>
      )}

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
                  <th className="px-8 py-5 text-xs font-bold uppercase tracking-widest text-gray-400">Stato</th>
                  <th className="px-8 py-5 text-xs font-bold uppercase tracking-widest text-gray-400">Immobile collegato</th>
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
                ) : filteredCompratori.length === 0 ? (
                  <tr><td colSpan={5} className="px-8 py-16 text-center text-gray-300 italic">Nessun compratore trovato</td></tr>
                ) : pagedCompratori.map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-gray-50/30 transition-colors group cursor-pointer"
                    onClick={() => openCompratoreDetail(c)}
                  >
                    <td className="px-8 py-5 min-w-0">
                      <div className="font-bold text-gray-900 truncate">{c.nome} {c.cognome}</div>
                      <div className="text-xs text-gray-400 font-medium flex items-center gap-1.5 mt-0.5 min-w-0">
                        <Phone size={10} className="text-gray-300 shrink-0" />
                        <span className="truncate">{c.telefono || 'N/D'}</span>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Badge className={cn(
                            "text-[9px] font-black uppercase tracking-widest cursor-pointer hover:opacity-75 transition-opacity gap-1",
                            STATO_COLORS[c.stato ?? 'Nuovo'] ?? STATO_COLORS['Nuovo']
                          )}>
                            {c.stato || 'Nuovo'}
                            <ChevronDown size={9} className="shrink-0" />
                          </Badge>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="rounded-xl min-w-[160px]">
                          {STATO_PIPELINE.map(stato => (
                            <DropdownMenuItem
                              key={stato}
                              onClick={(e) => { e.stopPropagation(); updateStato(c.id!, stato); }}
                              className={cn(
                                "rounded-lg text-xs font-semibold cursor-pointer",
                                c.stato === stato && "bg-gray-100",
                              )}
                            >
                              {stato}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                    <td className="px-8 py-5 min-w-0">
                      {c.compratori_immobili?.[0]?.immobili?.titolo
                        ? <span className="text-xs text-gray-500 truncate block">{c.compratori_immobili[0].immobili.titolo}</span>
                        : <span className="text-xs text-gray-200">—</span>}
                    </td>
                    <td className="px-8 py-5">
                      <span className="text-xs text-gray-400">
                        {safeFormat(c.created_at, 'd MMM yyyy', { locale: it })}
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
                          onClick={() => openEventForCompratore(c)}
                          className="h-8 w-8 p-0 rounded-xl text-gray-400 hover:text-[#94b0ab] hover:bg-[#94b0ab]/5"
                        >
                          <CalendarPlus size={15} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Nuova task"
                          onClick={() => {
                            setQuickTaskId(c.id);
                            setQuickTaskName(`${c.nome} ${c.cognome}`);
                            setIsQuickTaskModalOpen(true);
                          }}
                          className="h-8 w-8 p-0 rounded-xl text-gray-400 hover:text-[#94b0ab] hover:bg-[#94b0ab]/5"
                        >
                          <CheckSquare size={15} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Elimina compratore"
                          onClick={() => setCompratoreToDelete({ id: c.id!, nome: c.nome, cognome: c.cognome })}
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

      {displayCount > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 shrink-0">
          <p className="text-xs text-gray-400 font-medium">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, displayCount)} di {displayCount}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              className="rounded-xl border-gray-200 h-9 px-4 text-xs font-bold"
            >
              ← Precedente
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page * PAGE_SIZE >= displayCount}
              onClick={() => setPage(p => p + 1)}
              className="rounded-xl border-gray-200 h-9 px-4 text-xs font-bold"
            >
              Successiva →
            </Button>
          </div>
        </div>
      )}

      <Dialog open={!!selectedCompratore} onOpenChange={(open) => { if (!open) { setSelectedCompratore(null); setZoneInput(''); } }}>
        <DialogContent className="w-full sm:max-w-4xl h-[85vh] p-0 overflow-hidden flex flex-col gap-0 border-none shadow-2xl">
          {selectedCompratore && (
            <form onSubmit={handleSaveDetails} className="flex flex-col min-h-0 flex-1">

              {(() => {
                const isCreate = !selectedCompratore.id;
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
                            {isCreate ? 'Nuovo Compratore' : `${selectedCompratore.nome} ${selectedCompratore.cognome}`}
                          </DialogTitle>
                          {!isCreate && (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button type="button" className={cn(
                                  "px-3 py-1 rounded-full font-bold uppercase tracking-widest text-[10px] border cursor-pointer hover:opacity-80 transition-opacity",
                                  STATO_COLORS[selectedCompratore.stato ?? 'Nuovo'] ?? STATO_COLORS['Nuovo']
                                )}>
                                  {selectedCompratore.stato || 'Nuovo'}
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-2 rounded-xl shadow-xl border-none" align="start">
                                <div className="flex flex-col gap-1">
                                  {STATO_PIPELINE.map(stato => (
                                    <button
                                      key={stato}
                                      type="button"
                                      onClick={() => {
                                        setSelectedCompratore({ ...selectedCompratore, stato });
                                        if (selectedCompratore.id) updateStato(selectedCompratore.id, stato);
                                      }}
                                      className={cn(
                                        "px-3 py-1.5 rounded-lg text-xs font-bold text-left transition-colors",
                                        selectedCompratore.stato === stato ? "bg-gray-100" : "hover:bg-gray-50"
                                      )}
                                    >
                                      {stato}
                                    </button>
                                  ))}
                                </div>
                              </PopoverContent>
                            </Popover>
                          )}
                        </div>
                        <DialogDescription className="text-xs text-gray-400 font-medium mt-1 flex items-center gap-2">
                          {isCreate
                            ? 'Compila il profilo e salva per creare il contatto.'
                            : <>Contatto acquisito il {safeFormat(selectedCompratore.created_at, 'PPP', { locale: it })}</>
                          }
                          {isLoadingDetail && <span className="inline-block w-3 h-3 rounded-full border-2 border-[#94b0ab]/40 border-t-[#94b0ab] animate-spin" />}
                        </DialogDescription>
                      </div>
                    </div>
                  </DialogHeader>
                );
              })()}

              {(() => {
                const isCreate = !selectedCompratore.id;
                return (
                  <Tabs defaultValue="profilo" className="flex flex-col flex-1 min-h-0">
                    <div className="px-7 border-b bg-white shrink-0">
                      <TabsList className="bg-transparent p-0 h-12 gap-8 w-full justify-start">
                        <TabsTrigger value="profilo" className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#94b0ab] data-[state=active]:bg-transparent px-0 h-full font-bold text-gray-400 data-[state=active]:text-[#94b0ab] gap-2">
                          <User size={15} /> Profilo
                        </TabsTrigger>
                        <TabsTrigger value="immobili" disabled={isCreate} className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#94b0ab] data-[state=active]:bg-transparent px-0 h-full font-bold text-gray-400 data-[state=active]:text-[#94b0ab] gap-2 disabled:opacity-30 disabled:cursor-not-allowed">
                          <Heart size={15} /> Immobili
                        </TabsTrigger>
                        <TabsTrigger value="eventi" disabled={isCreate} className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#94b0ab] data-[state=active]:bg-transparent px-0 h-full font-bold text-gray-400 data-[state=active]:text-[#94b0ab] gap-2 disabled:opacity-30 disabled:cursor-not-allowed">
                          <Calendar size={15} /> Eventi
                          {compratoreEvents.length > 0 && (
                            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[#94b0ab]/10 text-[#94b0ab] text-[10px] font-black">{compratoreEvents.length}</span>
                          )}
                        </TabsTrigger>
                        <TabsTrigger value="task" disabled={isCreate} className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#94b0ab] data-[state=active]:bg-transparent px-0 h-full font-bold text-gray-400 data-[state=active]:text-[#94b0ab] gap-2 disabled:opacity-30 disabled:cursor-not-allowed">
                          <CheckSquare size={15} /> Task
                          {compratoreTasks.length > 0 && (
                            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[#94b0ab]/10 text-[#94b0ab] text-[10px] font-black">{compratoreTasks.length}</span>
                          )}
                        </TabsTrigger>
                        <TabsTrigger value="note" disabled={isCreate} className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#94b0ab] data-[state=active]:bg-transparent px-0 h-full font-bold text-gray-400 data-[state=active]:text-[#94b0ab] gap-2 disabled:opacity-30 disabled:cursor-not-allowed">
                          <FileText size={15} /> Note
                          {compratoreNotes.length > 0 && (
                            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[#94b0ab]/10 text-[#94b0ab] text-[10px] font-black">{compratoreNotes.length}</span>
                          )}
                        </TabsTrigger>
                      </TabsList>
                    </div>

                <div className="flex-1 overflow-y-auto bg-slate-50">
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
                            value={selectedCompratore.nome || ''}
                            onChange={(e) => setSelectedCompratore({...selectedCompratore, nome: e.target.value})}
                            className="h-11 rounded-xl border-gray-200 bg-slate-50/50"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-bold text-gray-500">Cognome</Label>
                          <Input
                            value={selectedCompratore.cognome || ''}
                            onChange={(e) => setSelectedCompratore({...selectedCompratore, cognome: e.target.value})}
                            className="h-11 rounded-xl border-gray-200 bg-slate-50/50"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-bold text-gray-500">Email</Label>
                          <Input
                            type="email"
                            value={selectedCompratore.email || ''}
                            onChange={(e) => setSelectedCompratore({...selectedCompratore, email: e.target.value})}
                            className="h-11 rounded-xl border-gray-200 bg-slate-50/50"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-bold text-gray-500">Cellulare</Label>
                          <Input
                            value={selectedCompratore.telefono || ''}
                            onChange={(e) => setSelectedCompratore({...selectedCompratore, telefono: e.target.value})}
                            className="h-11 rounded-xl border-gray-200 bg-slate-50/50"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Card: Esigenze di Acquisto — unconditional (this view is buyers-only) */}
                    <div className="bg-white border border-blue-100 rounded-xl shadow-sm p-5 space-y-5">
                      <div className="flex items-center gap-2">
                        <Briefcase size={15} className="text-blue-500" />
                        <h3 className="text-sm font-semibold text-blue-600 tracking-wide uppercase">Esigenze di Acquisto</h3>
                      </div>
                      <div className="flex flex-col gap-4">
                        <div className="space-y-2">
                          <Label className="text-xs font-bold text-gray-500">Budget Massimo (€)</Label>
                          <div className="flex flex-wrap gap-1.5">
                            {[100000, 150000, 200000, 250000, 300000, 500000, 750000, 1000000].map((preset) => {
                              const isActive = Number(selectedCompratore.budget) === preset;
                              return (
                                <button
                                  key={preset}
                                  type="button"
                                  onClick={() => setSelectedCompratore({...selectedCompratore, budget: isActive ? '' : String(preset)})}
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
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none select-none">€</span>
                            <Input
                              type="text"
                              inputMode="numeric"
                              value={selectedCompratore.budget
                                ? Number(String(selectedCompratore.budget).replace(/\./g, '')).toLocaleString('it-IT')
                                : ''}
                              onChange={(e) => {
                                const raw = e.target.value.replace(/\./g, '').replace(/[^0-9]/g, '');
                                setSelectedCompratore({...selectedCompratore, budget: raw});
                              }}
                              placeholder="Importo personalizzato..."
                              className="h-10 pl-8 rounded-xl border-gray-200 bg-slate-50/50"
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs font-bold text-gray-500">Tipologie Ricercate</Label>
                          <div className="flex flex-wrap gap-1.5">
                            {['Monolocale','Bilocale','Trilocale','Quadrilocale','Pentalocale+','Villa','Villetta a schiera','Attico','Box','Posto auto','Locale commerciale','Capannone','Terreno'].map(t => {
                              const active = (selectedCompratore.tipologia_ricerca ?? []).includes(t);
                              return (
                                <button
                                  key={t}
                                  type="button"
                                  onClick={() => {
                                    const cur: string[] = selectedCompratore.tipologia_ricerca ?? [];
                                    setSelectedCompratore({
                                      ...selectedCompratore,
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

                        <div className="space-y-2">
                          <Label className="text-xs font-bold text-gray-500 flex items-center gap-1.5">
                            <MapPin size={11} className="text-blue-400" /> Zone di Ricerca
                          </Label>
                          {(selectedCompratore.zone_ricercate ?? []).length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {(selectedCompratore.zone_ricercate as string[]).map(z => (
                                <span
                                  key={z}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-500 text-white border border-blue-500"
                                >
                                  {z}
                                  <button
                                    type="button"
                                    onClick={() => setSelectedCompratore({
                                      ...selectedCompratore,
                                      zone_ricercate: (selectedCompratore.zone_ricercate as string[]).filter((v: string) => v !== z),
                                    })}
                                    className="ml-0.5 hover:opacity-70"
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
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
                                    const cur: string[] = selectedCompratore.zone_ricercate ?? [];
                                    const newZones = vals.filter(v => !cur.includes(v));
                                    if (newZones.length === 0) { setZoneInput(''); return; }
                                    setSelectedCompratore({ ...selectedCompratore, zone_ricercate: [...cur, ...newZones] });
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
                                  const cur: string[] = selectedCompratore.zone_ricercate ?? [];
                                  const newZones = vals.filter(v => !cur.includes(v));
                                  if (newZones.length === 0) { setZoneInput(''); return; }
                                  setSelectedCompratore({ ...selectedCompratore, zone_ricercate: [...cur, ...newZones] });
                                  newZones.forEach(v => { if (!zoneSuggestions.includes(v)) setZoneSuggestions(prev => [...prev, v].sort()); });
                                  setZoneInput('');
                                }}
                                className="h-10 px-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-bold shrink-0 transition-colors"
                              >
                                <Plus size={16} />
                              </button>
                            </div>
                            {zoneInput.trim() && zoneSuggestions.filter(s =>
                              s.toLowerCase().includes(zoneInput.toLowerCase()) &&
                              !(selectedCompratore.zone_ricercate ?? []).includes(s)
                            ).length > 0 && (
                              <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                                {zoneSuggestions
                                  .filter(s =>
                                    s.toLowerCase().includes(zoneInput.toLowerCase()) &&
                                    !(selectedCompratore.zone_ricercate ?? []).includes(s)
                                  )
                                  .slice(0, 6)
                                  .map(s => (
                                    <button
                                      key={s}
                                      type="button"
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        const cur: string[] = selectedCompratore.zone_ricercate ?? [];
                                        setSelectedCompratore({ ...selectedCompratore, zone_ricercate: [...cur, s] });
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
                  </TabsContent>

                  <TabsContent value="immobili" className="mt-0 p-6 space-y-6">
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

                      {!selectedCompratore.compratori_immobili || selectedCompratore.compratori_immobili.length === 0 ? (
                        <div className="py-6 text-center bg-white rounded-xl border border-dashed border-gray-200 shadow-sm">
                          <Heart className="mx-auto text-gray-200 mb-2" size={24} />
                          <p className="text-xs text-gray-400 italic">Nessun immobile collegato manualmente.</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {selectedCompratore.compratori_immobili.map((item) => (
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

                  <TabsContent value="eventi" className="mt-0 p-6 space-y-4 animate-in fade-in slide-in-from-bottom-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">
                        Appuntamenti ({compratoreEvents.length})
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => { setEditingEvent(null); openEventForCompratore(selectedCompratore); }}
                        className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl h-8 px-3 text-xs font-bold gap-1.5"
                      >
                        <Plus size={13} /> Nuovo Evento
                      </Button>
                    </div>

                    {compratoreEvents.length === 0 ? (
                      <div className="py-10 text-center bg-white rounded-xl border border-dashed border-gray-200 shadow-sm">
                        <Calendar className="mx-auto text-gray-200 mb-2" size={26} />
                        <p className="text-xs text-gray-400 italic">Nessun appuntamento per questo contatto.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {compratoreEvents.map((evt) => {
                          const colors = TIPOLOGIA_COLORS[evt.tipologia] ?? TIPOLOGIA_COLORS['Altro'];
                          const isPast = evt.data < new Date().toISOString().slice(0, 10);
                          return (
                            <button
                              key={evt.id}
                              type="button"
                              onClick={() => { setEditingEvent(evt as unknown as Appointment); setIsEventModalOpen(true); }}
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

                  <TabsContent value="task" className="mt-0 p-6 space-y-4 animate-in fade-in slide-in-from-bottom-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-semibold text-muted-foreground tracking-wide uppercase">
                        Task ({compratoreTasks.length})
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        onClick={(e) => { e.preventDefault(); setIsTaskModalOpen(true); }}
                        className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl h-7 px-3 text-[11px] font-bold gap-1"
                      >
                        <Plus size={12} /> Nuova Task
                      </Button>
                    </div>

                    {compratoreTasks.length === 0 ? (
                      <div className="py-10 text-center bg-white rounded-xl border border-dashed border-gray-200 shadow-sm">
                        <CheckSquare className="mx-auto text-gray-200 mb-2" size={24} />
                        <p className="text-[11px] text-gray-400 italic">Nessuna task per questo contatto.</p>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {compratoreTasks.map((task) => {
                          const STATO_BADGE: Record<string, string> = {
                            'Da fare':    'bg-amber-100 text-amber-700 border-amber-200',
                            'In corso':   'bg-blue-100 text-blue-700 border-blue-200',
                            'Completata': 'bg-emerald-100 text-emerald-700 border-emerald-200',
                          };
                          const isUrgent = !!task.urgente && task.stato !== 'Completata';
                          return (
                            <div
                              key={task.id}
                              className={cn(
                                'rounded-xl border shadow-sm px-3 py-2.5 flex items-center gap-3 hover:shadow-md transition-all cursor-pointer group',
                                isUrgent
                                  ? 'bg-red-50/70 border-red-200 hover:border-red-300'
                                  : 'bg-white border-gray-100 hover:border-[#94b0ab]/40',
                              )}
                              onClick={() => { setTaskDetail(task); setTaskDetailNota(task.nota || ''); }}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {isUrgent && <AlertTriangle size={11} className="text-red-500 shrink-0" />}
                                  <span className={cn('text-[11px] font-bold truncate', isUrgent ? 'text-red-700' : 'text-gray-700')}>{task.titolo || 'Task'}</span>
                                  <span className="text-[11px] text-gray-400">{task.data}{task.ora ? ` · ${task.ora.slice(0, 5)}` : ''}</span>
                                </div>
                                {task.telefono && (
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <Phone size={10} className="text-[#94b0ab] shrink-0" />
                                    <span className="text-[11px] font-semibold text-[#94b0ab]">{task.telefono}</span>
                                  </div>
                                )}
                                {task.nota && !task.telefono && (
                                  <p className="text-[11px] text-gray-500 leading-snug truncate mt-0.5">{task.nota}</p>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); toggleTaskUrgente(task.id, task.urgente); }}
                                title={task.urgente ? 'Rimuovi urgenza' : 'Segna come urgente'}
                                className={cn(
                                  'shrink-0 p-1 rounded-full transition-opacity',
                                  task.urgente ? 'text-red-500 opacity-100' : 'text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-400',
                                )}
                              >
                                <AlertTriangle size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); cycleTaskStato(task.id, task.stato); }}
                                className={cn(
                                  'text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full border shrink-0 hover:opacity-75 transition-opacity',
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

                  <TabsContent value="note" className="mt-0 p-6 space-y-5 animate-in fade-in slide-in-from-bottom-2">

                    {(() => {
                      const siteMsg = selectedCompratore.note_interne?.trim()
                        ? selectedCompratore.note_interne
                        : compratoreNotes.find((n) => n.autore !== 'Agente')?.testo;
                      if (!siteMsg) return null;
                      const siteDate = compratoreNotes.find((n) => n.autore !== 'Agente')?.created_at;
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

                    <div className="space-y-2">
                      {compratoreNotes.filter((n) => n.autore === 'Agente' && !n.testo?.startsWith('[Audit]')).length === 0 && !selectedCompratore.note_interne && compratoreNotes.filter((n) => n.autore !== 'Agente').length === 0 ? (
                        <div className="py-8 text-center bg-white rounded-xl border border-dashed border-gray-200 shadow-sm">
                          <FileText className="mx-auto text-gray-200 mb-2" size={26} />
                          <p className="text-xs text-gray-400 italic">Nessuna nota per questo contatto.</p>
                        </div>
                      ) : (
                        compratoreNotes.filter((n) => n.autore === 'Agente' && !n.testo?.startsWith('[Audit]')).map((note) => (
                          <div key={note.id} className="rounded-xl border p-4 bg-white border-gray-100 shadow-sm">
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

                    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4 space-y-3">
                      <Label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Aggiungi nota</Label>
                      <Textarea
                        value={newNoteText}
                        onChange={(e) => setNewNoteText(e.target.value)}
                        placeholder="Scrivi una nota su questo contatto..."
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

              {(() => {
                const isCreate = !selectedCompratore.id;
                return (
                  <div className="px-7 py-4 bg-white border-t shrink-0 flex items-center justify-between gap-4">
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

      <TaskModal
        open={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        defaultContattoId={selectedCompratore?.id}
        defaultContattoName={selectedCompratore ? `${selectedCompratore.nome} ${selectedCompratore.cognome}` : undefined}
        onSaved={async () => {
          setIsTaskModalOpen(false);
          if (!selectedCompratore?.id) return;
          const { data } = await supabase
            .from('tasks')
            .select('id, titolo, nota, data, ora, stato, agente_id, telefono, urgente')
            .eq('contatto_id', selectedCompratore.id)
            .order('data', { ascending: true });
          if (data) setCompratoreTasks(data);
        }}
      />

      <Dialog open={!!taskDetail} onOpenChange={(open) => { if (!open) setTaskDetail(null); }}>
        <DialogContent className="sm:max-w-sm border-none shadow-2xl p-0 overflow-hidden gap-0">
          {taskDetail && (() => {
            const STATO_BADGE: Record<string, string> = {
              'Da fare':    'bg-amber-100 text-amber-700 border-amber-200',
              'In corso':   'bg-blue-100 text-blue-700 border-blue-200',
              'Completata': 'bg-emerald-100 text-emerald-700 border-emerald-200',
            };
            return (
              <>
                <div className={cn(
                  'px-5 py-4 flex items-center gap-3 border-b',
                  taskDetail.urgente ? 'bg-red-50/70 border-red-200' : 'bg-[#94b0ab]/10 border-[#94b0ab]/15',
                )}>
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      'text-[10px] font-black uppercase tracking-widest mb-0.5',
                      taskDetail.urgente ? 'text-red-500' : 'text-[#94b0ab]',
                    )}>Task</p>
                    <div className="flex items-center gap-1.5">
                      {taskDetail.urgente && <AlertTriangle size={12} className="text-red-500 shrink-0" />}
                      <p className={cn('text-sm font-bold truncate', taskDetail.urgente ? 'text-red-700' : 'text-gray-800')}>{taskDetail.titolo || 'Task'}</p>
                    </div>
                    <p className="text-[11px] text-gray-500">{taskDetail.data}{taskDetail.ora ? ` · ${taskDetail.ora.slice(0, 5)}` : ''}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleTaskUrgente(taskDetail.id, taskDetail.urgente)}
                    title={taskDetail.urgente ? 'Rimuovi urgenza' : 'Segna come urgente'}
                    className={cn(
                      'shrink-0 p-1.5 rounded-full transition-colors',
                      taskDetail.urgente ? 'text-red-500 bg-red-100 hover:bg-red-200' : 'text-gray-300 hover:text-red-400 hover:bg-red-50',
                    )}
                  >
                    <AlertTriangle size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => cycleTaskStato(taskDetail.id, taskDetail.stato)}
                    className={cn(
                      'text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border shrink-0 hover:opacity-75 transition-opacity',
                      STATO_BADGE[taskDetail.stato] ?? 'bg-gray-100 text-gray-500'
                    )}
                  >
                    {taskDetail.stato}
                  </button>
                </div>
                <div className="px-5 py-4 space-y-3 bg-white">
                  <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Nota</Label>
                  <Textarea
                    value={taskDetailNota}
                    onChange={(e) => setTaskDetailNota(e.target.value)}
                    placeholder="Aggiungi una nota a questa task..."
                    className="rounded-xl border-gray-200 bg-slate-50/60 min-h-[90px] resize-none text-[12px] leading-relaxed"
                  />
                </div>
                <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setTaskDetail(null)} className="rounded-xl h-8 px-4 text-xs font-bold text-gray-500">
                    Annulla
                  </Button>
                  <Button size="sm" onClick={saveTaskNota} disabled={taskDetailSaving} className="rounded-xl h-8 px-4 text-xs font-bold bg-[#94b0ab] hover:bg-[#7a948f] text-white">
                    {taskDetailSaving ? 'Salvataggio...' : 'Salva nota'}
                  </Button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={isPropertyPickerOpen} onOpenChange={(open) => { setIsPropertyPickerOpen(open); if (!open) setPropertySearch(''); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] p-0 overflow-hidden flex flex-col gap-0 border-none shadow-2xl">
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
                <div className="w-20 shrink-0 bg-slate-100 relative overflow-hidden">
                  {prop.copertina_url ? (
                    <img src={prop.copertina_url} alt={prop.titolo} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300 min-h-[72px]">
                      <HomeIcon size={22} />
                    </div>
                  )}
                </div>
                <div className="flex-1 px-4 py-3 min-w-0">
                  <p className="font-bold text-gray-900 truncate text-sm leading-tight">{prop.titolo}</p>
                  {prop.zone?.nome && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      {prop.zone.nome}
                    </p>
                  )}
                  <p className="text-sm font-bold text-[#94b0ab] mt-1.5">{formatPrice(prop.prezzo)}</p>
                </div>
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

      <TaskModal
        open={isQuickTaskModalOpen}
        onClose={() => setIsQuickTaskModalOpen(false)}
        defaultContattoId={quickTaskId}
        defaultContattoName={quickTaskName}
        onSaved={() => { setIsQuickTaskModalOpen(false); fetchCompratori(); }}
      />

      <EventFormModal
        open={isEventModalOpen}
        onClose={() => { setIsEventModalOpen(false); setEditingEvent(null); }}
        onSaved={async () => {
          setIsEventModalOpen(false);
          setEditingEvent(null);
          if (selectedCompratore?.id) {
            const { data } = await supabase
              .from('appuntamenti')
              .select('id, tipologia, data, ora_inizio, ora_fine, note, agente_id, contatto_id')
              .eq('contatto_id', selectedCompratore.id)
              .order('data', { ascending: true })
              .order('ora_inizio', { ascending: true });
            setCompratoreEvents(data || []);
          }
        }}
        event={editingEvent ?? undefined}
        defaultContattoId={editingEvent ? undefined : eventModalDefaultId}
        defaultContattoName={editingEvent ? undefined : eventModalDefaultName}
        agents={agentsForEventModal}
        properties={propertiesForEventModal}
      />

      <AlertDialog open={!!compratoreToDelete} onOpenChange={(open) => !open && setCompratoreToDelete(null)}>
        <AlertDialogContent className="border-none shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold">Confermi l'eliminazione?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 font-medium">
              Stai per eliminare <span className="font-bold text-gray-800">{compratoreToDelete?.nome} {compratoreToDelete?.cognome}</span>. L'operazione è irreversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-xl border-gray-200 font-bold">Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCompratore} className="bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold">Sì, elimina</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
};

export default CompratoriView;
