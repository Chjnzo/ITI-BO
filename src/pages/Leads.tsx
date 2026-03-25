"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';
import { showError, showSuccess } from '@/utils/toast';
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from "@/components/ui/select";
import {
  Phone, Home as HomeIcon,
  User, Search, MessageSquare, Save,
  Calendar, GripVertical, Plus, LayoutDashboard, List, ExternalLink,
  Filter, TrendingUp, History, Heart, UserCheck, Briefcase, Send, MapPin, X, ChevronDown, Trash2,
  CheckSquare
} from 'lucide-react';
import TaskModal, { TIPOLOGIA_CONFIG } from '@/components/TaskModal';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

const COLUMNS = [
  { id: 'Nuovo', label: 'Nuovi Lead', color: 'bg-blue-50/50 border-blue-100 text-blue-700' },
  { id: 'In Trattativa', label: 'In Trattativa', color: 'bg-amber-50/50 border-amber-100 text-amber-700' },
  { id: 'Visita Fissata', label: 'Visita Fissata', color: 'bg-purple-50/50 border-purple-100 text-purple-700' },
  { id: 'Chiuso', label: 'Chiusi', color: 'bg-emerald-50/50 border-emerald-100 text-emerald-700' }
];

const AGENTS = ["Matteo", "Gabriele"];


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

// ── Memoized kanban card ─────────────────────────────────────────────────────
interface LeadCardProps {
  lead: any;
  onOpen: (lead: any) => void;
}
const LeadCard = React.memo(({ lead, onOpen }: LeadCardProps) => (
  <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md hover:border-[#94b0ab]/30 transition-all group relative">
    <div className="absolute top-4 right-4 flex items-center gap-2">
      <button
        onPointerDown={(e) => { e.stopPropagation(); onOpen(lead); }}
        className="text-gray-300 hover:text-[#94b0ab] transition-colors p-1"
      >
        <ExternalLink size={14} />
      </button>
      <div className="text-gray-200 group-hover:text-gray-400 transition-colors">
        <GripVertical size={14} />
      </div>
    </div>

    <div className="font-bold text-gray-900 mb-1 pr-10 text-sm">
      {lead.nome} {lead.cognome}
    </div>

    <Badge className={cn("mb-3 text-[9px] font-black uppercase tracking-widest border", getClientTypeBadge(lead.tipo_cliente))}>
      {lead.tipo_cliente || 'Acquirente'}
    </Badge>

    <div className="space-y-1.5 mb-3">
      <div className="flex items-center gap-2 text-[9px] font-bold text-gray-400 uppercase">
        <Calendar size={10} />
        {safeFormat(lead.created_at, 'dd MMM yyyy', { locale: it })}
      </div>
      {lead.lead_immobili && lead.lead_immobili.length > 0 && (
        <div className="flex items-center gap-2 text-[9px] font-bold text-[#94b0ab] bg-[#94b0ab]/5 px-2 py-0.5 rounded-lg truncate">
          <HomeIcon size={9} />
          {lead.lead_immobili[0].immobili?.titolo}
        </div>
      )}
    </div>

    <div className="flex items-center justify-between pt-2 border-t border-gray-50">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
        <Phone size={10} className="text-gray-300" />
        {lead.telefono || 'N/D'}
      </div>
      {lead.assegnato_a && (
        <div className="w-5 h-5 rounded-full bg-[#94b0ab] text-white flex items-center justify-center text-[8px] font-black shadow-sm" title={`Assegnato a ${lead.assegnato_a}`}>
          {lead.assegnato_a.charAt(0)}
        </div>
      )}
    </div>
  </div>
));

const Leads = () => {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [agentFilter, setAgentFilter] = useState("Tutti");

  // Property Picker State
  const [isPropertyPickerOpen, setIsPropertyPickerOpen] = useState(false);
  const [allProperties, setAllProperties] = useState<any[]>([]);
  const [propertySearch, setPropertySearch] = useState('');
  const [isLoadingProperties, setIsLoadingProperties] = useState(false);

  // Zones from DB
  const [dbZones, setDbZones] = useState<{ id: string; nome: string }[]>([]);

  // Zone di interesse — stores zone UUIDs (id), not display names
  const [selectedZoneInteresse, setSelectedZoneInteresse] = useState<string[]>([]);
  const [zoneSearch, setZoneSearch] = useState('');
  const [zoneAccordionOpen, setZoneAccordionOpen] = useState(false);
  const [unlinkConfirmId, setUnlinkConfirmId] = useState<string | null>(null);

  // Autosave
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<{ lead: any; zones: string[] } | null>(null);
  const hasInteractedRef = useRef(false);

  // Auto-match results for Acquirente/Ibrido
  const [matchedProperties, setMatchedProperties] = useState<any[]>([]);
  const [isLoadingMatches, setIsLoadingMatches] = useState(false);

  // Notes / Storico State
  const [leadNotes, setLeadNotes] = useState<any[]>([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [newNoteAutore, setNewNoteAutore] = useState(AGENTS[0]);
  const [isSavingNote, setIsSavingNote] = useState(false);

  // Tasks State
  const [leadTasks, setLeadTasks] = useState<any[]>([]);
  const [isLeadTaskModalOpen, setIsLeadTaskModalOpen] = useState(false);

  // Slim query — only fields needed to render the board/list cards
  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('leads')
      .select(`
        id, nome, cognome, stato, tipo_cliente, created_at,
        assegnato_a, telefono, email,
        lead_immobili(immobili(titolo))
      `)
      .order('created_at', { ascending: false });

    if (error) {
      showError("Errore nel caricamento CRM");
    } else {
      const sanitized = (data || []).map(l => ({
        ...l,
        stato: l.stato === 'nuovo' ? 'Nuovo' : (l.stato || 'Nuovo'),
      }));
      setLeads(sanitized);
    }
    setLoading(false);
  }, []);

  // Full query — fired only when a lead dialog is opened
  const fetchLeadDetail = useCallback(async (leadId: string) => {
    setIsLoadingDetail(true);
    const { data, error } = await supabase
      .from('leads')
      .select(`
        *,
        immobile_primo_contatto:immobili!immobile_id(id, titolo, prezzo, copertina_url, zone(nome)),
        lead_immobili(
          id, stato_interesse, note, created_at,
          immobili(id, titolo, prezzo, copertina_url, zone(nome))
        ),
        lead_zone_ricercate(zona_id)
      `)
      .eq('id', leadId)
      .single();

    if (!error && data) {
      const full = { ...data, stato: data.stato === 'nuovo' ? 'Nuovo' : (data.stato || 'Nuovo') };
      // Only update if the user hasn't already closed/switched the dialog
      setSelectedLead((prev: any) => prev?.id === leadId ? full : prev);
    }
    setIsLoadingDetail(false);
  }, []);

  // Opens the dialog immediately with card data, then hydrates with full detail
  const openLeadDetail = useCallback((lead: any) => {
    setSelectedLead(lead);
    fetchLeadDetail(lead.id);
  }, [fetchLeadDetail]);

  // Opens the unified dialog in create mode (no id → INSERT path)
  const openCreateModal = useCallback(() => {
    setSelectedLead({ nome: '', cognome: '', email: '', telefono: '', tipo_cliente: 'Acquirente', stato: 'Nuovo', created_at: new Date().toISOString() });
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // Fetch the real zones from the database once on mount
  useEffect(() => {
    supabase
      .from('zone')
      .select('id, nome')
      .order('nome')
      .then(({ data }) => { if (data) setDbZones(data); });
  }, []);

  const filteredLeads = useMemo(() => {
    return leads.filter(lead => {
      const matchesSearch = 
        `${lead.nome} ${lead.cognome}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lead.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lead.telefono?.includes(searchQuery);
      
      const matchesAgent = 
        agentFilter === "Tutti" || 
        (agentFilter === "Non assegnati" && !lead.assegnato_a) ||
        lead.assegnato_a === agentFilter;

      return matchesSearch && matchesAgent;
    });
  }, [leads, searchQuery, agentFilter]);


  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const newStatus = destination.droppableId;
    const updatedLeads = Array.from(leads);
    const leadIndex = updatedLeads.findIndex(l => l.id === draggableId);
    if (leadIndex !== -1) {
      updatedLeads[leadIndex] = { ...updatedLeads[leadIndex], stato: newStatus };
      setLeads(updatedLeads);
    }

    const { error } = await supabase.from('leads').update({ stato: newStatus }).eq('id', draggableId);
    if (error) {
      showError("Errore nell'aggiornamento stato");
      fetchLeads();
    } else {
      showSuccess(`Lead spostato in ${newStatus}`);
    }
  };

  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead) return;

    if (!selectedLead.nome?.trim() || !selectedLead.cognome?.trim()) {
      showError("Nome e Cognome sono obbligatori");
      return;
    }

    const isCreateMode = !selectedLead.id;
    const payload = {
      nome: selectedLead.nome.trim(),
      cognome: selectedLead.cognome.trim(),
      telefono: selectedLead.telefono || null,
      email: selectedLead.email || null,
      assegnato_a: selectedLead.assegnato_a && selectedLead.assegnato_a !== "Nessuno" ? selectedLead.assegnato_a : null,
      tipo_cliente: selectedLead.tipo_cliente || 'Acquirente',
      budget: parseFloat(selectedLead.budget) || null,
      tipologia_ricerca: selectedLead.tipologia_ricerca || null,
      valutazione_stimata: parseFloat(selectedLead.valutazione_stimata) || null,
      scadenza_esclusiva: selectedLead.scadenza_esclusiva || null,
      motivazione_vendita: selectedLead.motivazione_vendita || null,
      note_interne: selectedLead.note_interne || null,
    };

    setIsSaving(true);

    if (isCreateMode) {
      const { error } = await supabase.from('leads').insert({ ...payload, stato: 'Nuovo' });
      if (error) {
        console.log('[Supabase INSERT leads] error', {
          message: error?.message,
          details: (error as any)?.details,
          hint: (error as any)?.hint,
          code: (error as any)?.code,
          payload: { ...payload, stato: 'Nuovo' },
        });
        showError("Errore nella creazione: " + error.message);
      } else {
        showSuccess("Contatto creato correttamente");
        fetchLeads();
        setSelectedLead(null);
      }
    } else {
      const { error } = await supabase.from('leads').update(payload).eq('id', selectedLead.id);

      // Sync lead_zone_ricercate for Acquirente / Ibrido
      if (!error && (selectedLead.tipo_cliente === 'Acquirente' || selectedLead.tipo_cliente === 'Ibrido')) {
        await supabase.from('lead_zone_ricercate').delete().eq('lead_id', selectedLead.id);
        if (selectedZoneInteresse.length > 0) {
          await supabase.from('lead_zone_ricercate').insert(
            selectedZoneInteresse.map(zona_id => ({ lead_id: selectedLead.id, zona_id }))
          );
        }
      }

      if (error) {
        showError("Errore nel salvataggio");
      } else {
        showSuccess("Scheda cliente aggiornata");
        setLeads(prev => prev.map(l => l.id === selectedLead.id ? {
          ...l,
          nome: selectedLead.nome.trim(),
          cognome: selectedLead.cognome.trim(),
          tipo_cliente: selectedLead.tipo_cliente,
          assegnato_a: payload.assegnato_a,
        } : l));
        setSelectedLead(null);
      }
    }

    setIsSaving(false);
  };

  // Autosave — only fires in edit mode after the user has interacted
  const performAutoSave = useCallback(async (lead: any, zones: string[]) => {
    if (!lead?.id || !lead.nome?.trim() || !lead.cognome?.trim()) return;
    setAutoSaveStatus('saving');
    const payload = {
      nome: lead.nome.trim(),
      cognome: lead.cognome.trim(),
      telefono: lead.telefono || null,
      email: lead.email || null,
      assegnato_a: lead.assegnato_a && lead.assegnato_a !== "Nessuno" ? lead.assegnato_a : null,
      tipo_cliente: lead.tipo_cliente || 'Acquirente',
      budget: parseFloat(lead.budget) || null,
      tipologia_ricerca: lead.tipologia_ricerca || null,
      valutazione_stimata: parseFloat(lead.valutazione_stimata) || null,
      scadenza_esclusiva: lead.scadenza_esclusiva || null,
      motivazione_vendita: lead.motivazione_vendita || null,
      note_interne: lead.note_interne || null,
    };
    const { error } = await supabase.from('leads').update(payload).eq('id', lead.id);
    if (!error && (lead.tipo_cliente === 'Acquirente' || lead.tipo_cliente === 'Ibrido')) {
      await supabase.from('lead_zone_ricercate').delete().eq('lead_id', lead.id);
      if (zones.length > 0) {
        await supabase.from('lead_zone_ricercate').insert(zones.map(zona_id => ({ lead_id: lead.id, zona_id })));
      }
    }
    if (error) {
      setAutoSaveStatus('error');
    } else {
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, nome: lead.nome.trim(), cognome: lead.cognome.trim(), tipo_cliente: lead.tipo_cliente, assegnato_a: payload.assegnato_a } : l));
      setAutoSaveStatus('saved');
      if (autoSaveStatusTimerRef.current) clearTimeout(autoSaveStatusTimerRef.current);
      autoSaveStatusTimerRef.current = setTimeout(() => setAutoSaveStatus('idle'), 2000);
    }
  }, []);

  useEffect(() => {
    if (!selectedLead?.id || !hasInteractedRef.current) return;
    if (!selectedLead.nome?.trim() || !selectedLead.cognome?.trim()) return;
    pendingSaveRef.current = { lead: selectedLead, zones: selectedZoneInteresse };
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      if (!pendingSaveRef.current) return;
      const { lead, zones } = pendingSaveRef.current;
      performAutoSave(lead, zones);
    }, 1500);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [selectedLead, selectedZoneInteresse, performAutoSave]);

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
      .select('id, titolo, prezzo, copertina_url, stato, zone(nome)')
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

  // Sync zone selection with loaded detail data; reset interaction tracking on new lead
  useEffect(() => {
    if (!selectedLead?.id) {
      setSelectedZoneInteresse([]);
      setMatchedProperties([]);
      setZoneSearch('');
      hasInteractedRef.current = false;
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      setAutoSaveStatus('idle');
      return;
    }
    if (selectedLead.lead_zone_ricercate) {
      setSelectedZoneInteresse(selectedLead.lead_zone_ricercate.map((r: any) => r.zona_id));
    }
  }, [selectedLead?.id, selectedLead?.lead_zone_ricercate]);

  // Mark as "interacted" after detail finishes loading (so autosave ignores initial hydration)
  useEffect(() => {
    if (!selectedLead?.id || isLoadingDetail) return;
    const t = setTimeout(() => { hasInteractedRef.current = true; }, 300);
    return () => clearTimeout(t);
  }, [selectedLead?.id, isLoadingDetail]);

  // Fetch notes whenever a different lead is opened
  useEffect(() => {
    if (!selectedLead?.id) {
      setLeadNotes([]);
      setNewNoteText('');
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from('lead_notes')
        .select('*')
        .eq('lead_id', selectedLead.id)
        .order('created_at', { ascending: true });
      if (!error) setLeadNotes(data || []);
    })();
  }, [selectedLead?.id]);

  // Fetch tasks whenever a different lead is opened
  useEffect(() => {
    if (!selectedLead?.id) { setLeadTasks([]); return; }
    (async () => {
      const { data } = await supabase
        .from('tasks')
        .select('id, tipologia, nota, data, ora, stato, agente_id')
        .eq('lead_id', selectedLead.id)
        .order('data', { ascending: true });
      setLeadTasks(data || []);
    })();
  }, [selectedLead?.id]);

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

  const handleAddNote = async () => {
    if (!newNoteText.trim() || !selectedLead) return;
    setIsSavingNote(true);
    const { error } = await supabase
      .from('lead_notes')
      .insert({ lead_id: selectedLead.id, testo: newNoteText.trim(), autore: newNoteAutore });
    if (error) {
      showError("Errore nel salvataggio della nota");
    } else {
      setNewNoteText('');
      const { data } = await supabase
        .from('lead_notes')
        .select('*')
        .eq('lead_id', selectedLead.id)
        .order('created_at', { ascending: true });
      if (data) setLeadNotes(data);
    }
    setIsSavingNote(false);
  };

  // Auto-match: query immobili based on lead criteria
  const fetchMatchedProperties = useCallback(async (opts: {
    budget?: number | string | null;
    tipologia?: string | null;
    zoneIds?: string[];
  }) => {
    setIsLoadingMatches(true);

    // Parse budget as number — form stores it as string
    const budgetNum = opts.budget ? parseFloat(String(opts.budget)) : null;

    // tipologia_ricerca is comma-separated (multi-select) — split into individual values
    const tipologie = opts.tipologia
      ? opts.tipologia.split(',').map(t => t.trim()).filter(Boolean)
      : [];

    console.log('[AutoMatch] criteria:', {
      budget: budgetNum,
      tipologie,
      zoneIds: opts.zoneIds,
    });

    let query = supabase
      .from('immobili')
      .select('id, titolo, prezzo, copertina_url, locali, stato, zona_id, zone(id, nome)')
      .neq('stato', 'Venduto');

    if (budgetNum) query = query.lte('prezzo', budgetNum);

    // OR across all selected tipologie — matched against the 'locali' column
    if (tipologie.length === 1) {
      query = query.ilike('locali', `%${tipologie[0]}%`);
    } else if (tipologie.length > 1) {
      query = query.or(tipologie.map(t => `locali.ilike.%${t}%`).join(','));
    }

    if (opts.zoneIds && opts.zoneIds.length > 0) query = query.in('zona_id', opts.zoneIds);

    const { data, error } = await query.order('prezzo', { ascending: true }).limit(20);

    console.log('[AutoMatch] results:', data?.length ?? 0, 'error:', error?.message ?? null);
    if (data) {
      data.forEach(p => {
        const budgetOk = !budgetNum || p.prezzo <= budgetNum;
        const tipoOk = tipologie.length === 0 || tipologie.some(t => p.locali?.toLowerCase().includes(t.toLowerCase()));
        const zonaOk = !opts.zoneIds?.length || opts.zoneIds.includes(p.zona_id);
        console.log(`  [${p.titolo}] prezzo=${p.prezzo} locali=${p.locali} zona_id=${p.zona_id} → budget:${budgetOk} tipo:${tipoOk} zona:${zonaOk}`);
      });
    }

    if (!error) setMatchedProperties(data || []);
    setIsLoadingMatches(false);
  }, []);

  // Run auto-match when lead detail finishes loading
  useEffect(() => {
    if (!selectedLead?.id || isLoadingDetail) return;
    const isAcquirente = selectedLead.tipo_cliente === 'Acquirente' || selectedLead.tipo_cliente === 'Ibrido';
    if (!isAcquirente) { setMatchedProperties([]); return; }
    const zoneIds = (selectedLead.lead_zone_ricercate || []).map((r: any) => r.zona_id);
    fetchMatchedProperties({
      budget: selectedLead.budget,
      tipologia: selectedLead.tipologia_ricerca,
      zoneIds,
    });
  }, [selectedLead?.id, isLoadingDetail, fetchMatchedProperties]);

  const filteredPickerProperties = useMemo(() => {
    const q = propertySearch.toLowerCase();
    if (!q) return allProperties;
    return allProperties.filter(p =>
      p.titolo?.toLowerCase().includes(q) ||
      p.zone?.nome?.toLowerCase().includes(q)
    );
  }, [allProperties, propertySearch]);

  // Pre-indexed by status — O(n) once instead of O(n×columns) on every render
  const leadsByStatus = useMemo(() => {
    const map = new Map<string, any[]>();
    COLUMNS.forEach(col => map.set(col.id, []));
    for (const lead of filteredLeads) {
      const bucket = map.get(lead.stato);
      if (bucket) bucket.push(lead);
    }
    return map;
  }, [filteredLeads]);

  return (
    <AdminLayout>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900">CRM Leads</h1>
          <p className="text-gray-500 mt-1 font-medium">Gestione centralizzata dei contatti e delle trattative.</p>
        </div>
        
        <Button
          onClick={openCreateModal}
          className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-2xl px-8 h-14 shadow-lg shadow-[#94b0ab]/20 font-bold transition-all"
        >
          <Plus className="mr-2" size={20} /> Nuovo Contatto
        </Button>
      </div>

      <div className="bg-white p-4 rounded-[2rem] border border-gray-100 shadow-sm mb-8 flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <Input 
            placeholder="Cerca per nome, email o telefono..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-12 pl-12 rounded-xl border-gray-100 focus:ring-[#94b0ab]"
          />
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <Filter className="text-gray-400 shrink-0" size={18} />
          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger className="h-12 w-full md:w-[200px] rounded-xl border-gray-100">
              <SelectValue placeholder="Filtra per agente" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="Tutti">Tutti gli agenti</SelectItem>
              <SelectItem value="Non assegnati">Non assegnati</SelectItem>
              {AGENTS.map(agent => (
                <SelectItem key={agent} value={agent}>{agent}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="kanban" className="w-full">
        <TabsList className="bg-white border border-gray-100 p-1.5 rounded-2xl h-14 mb-8 flex justify-start gap-1 w-fit">
          <TabsTrigger value="kanban" className="rounded-xl px-8 h-full data-[state=active]:bg-[#94b0ab] data-[state=active]:text-white font-bold transition-all gap-2">
            <LayoutDashboard size={18} /> Vista Board
          </TabsTrigger>
          <TabsTrigger value="list" className="rounded-xl px-8 h-full data-[state=active]:bg-[#94b0ab] data-[state=active]:text-white font-bold transition-all gap-2">
            <List size={18} /> Vista Lista
          </TabsTrigger>
        </TabsList>

        <TabsContent value="kanban" className="mt-0">
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 h-[calc(100vh-420px)] min-h-[600px]">
              {COLUMNS.map((col) => (
                <div key={col.id} className="flex flex-col h-full">
                  <div className={cn(
                    "flex items-center justify-between px-5 py-4 rounded-2xl border mb-4",
                    col.color
                  )}>
                    <h2 className="font-black uppercase tracking-widest text-xs">{col.label}</h2>
                    <Badge variant="outline" className="bg-white/50 border-none font-bold">
                      {(leadsByStatus.get(col.id) || []).length}
                    </Badge>
                  </div>

                  <Droppable droppableId={col.id}>
                    {(provided, snapshot) => (
                      <div 
                        {...provided.droppableProps}
                        ref={provided.innerRef}
                        className={cn(
                          "flex-1 bg-gray-50/50 rounded-[2rem] p-4 border border-gray-100 overflow-y-auto space-y-4 scrollbar-hide transition-colors",
                          snapshot.isDraggingOver && "bg-[#94b0ab]/5 border-[#94b0ab]/20"
                        )}
                      >
                        {loading ? (
                          <div className="py-10 text-center text-gray-300 animate-pulse font-medium">Caricamento...</div>
                        ) : (leadsByStatus.get(col.id) || []).length === 0 ? (
                          <div className="py-10 text-center text-gray-300 italic text-sm">Nessun lead</div>
                        ) : (leadsByStatus.get(col.id) || []).map((lead, index) => (
                          <Draggable key={lead.id} draggableId={lead.id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={cn(snapshot.isDragging && "shadow-2xl border-[#94b0ab] rotate-2 scale-105 z-50")}
                              >
                                <LeadCard lead={lead} onOpen={openLeadDetail} />
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              ))}
            </div>
          </DragDropContext>
        </TabsContent>

        <TabsContent value="list" className="mt-0">
          <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50/50 border-b border-gray-100">
                    <th className="px-8 py-5 text-xs font-bold uppercase tracking-widest text-gray-400">Contatto</th>
                    <th className="px-8 py-5 text-xs font-bold uppercase tracking-widest text-gray-400">Tipo</th>
                    <th className="px-8 py-5 text-xs font-bold uppercase tracking-widest text-gray-400">Stato</th>
                    <th className="px-8 py-5 text-xs font-bold uppercase tracking-widest text-gray-400">Assegnato</th>
                    <th className="px-8 py-5 text-xs font-bold uppercase tracking-widest text-gray-400 text-right">Azioni</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredLeads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-gray-50/30 transition-colors group">
                      <td className="px-8 py-5">
                        <div className="font-bold text-gray-900">{lead.nome} {lead.cognome}</div>
                        <div className="text-xs text-gray-400 font-medium">{lead.email}</div>
                      </td>
                      <td className="px-8 py-5">
                        <Badge className={cn(
                          "text-[9px] font-black uppercase tracking-widest border",
                          getClientTypeBadge(lead.tipo_cliente)
                        )}>
                          {lead.tipo_cliente || 'Acquirente'}
                        </Badge>
                      </td>
                      <td className="px-8 py-5">
                        <Badge className={cn(
                          "px-3 py-1 rounded-full font-bold uppercase tracking-widest text-[9px] border-none",
                          COLUMNS.find(c => c.id === lead.stato)?.color || "bg-gray-100 text-gray-600"
                        )}>
                          {lead.stato}
                        </Badge>
                      </td>
                      <td className="px-8 py-5">
                        {lead.assegnato_a ? (
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-[#94b0ab]/10 text-[#94b0ab] flex items-center justify-center text-[10px] font-bold">
                              {lead.assegnato_a.charAt(0)}
                            </div>
                            <span className="text-sm font-medium text-gray-600">{lead.assegnato_a}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300 italic">Non assegnato</span>
                        )}
                      </td>
                      <td className="px-8 py-5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openLeadDetail(lead)}
                          className="rounded-xl font-bold text-[#94b0ab] hover:bg-[#94b0ab]/5"
                        >
                          Vedi Scheda
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Unified Lead Dialog (create + edit) */}
      <Dialog open={!!selectedLead} onOpenChange={(open) => { if (!open) { setSelectedLead(null); setMatchedProperties([]); setZoneSearch(''); } }}>
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
                              <Badge className={cn("px-3 py-1 rounded-full font-bold uppercase tracking-widest text-[10px]", COLUMNS.find(c => c.id === selectedLead.stato)?.color)}>
                                {selectedLead.stato}
                              </Badge>
                              <Badge className={cn("px-3 py-1 rounded-full font-bold uppercase tracking-widest text-[10px] border", getClientTypeBadge(selectedLead.tipo_cliente))}>
                                {selectedLead.tipo_cliente || 'Acquirente'}
                              </Badge>
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
                        <TabsTrigger value="immobili" disabled={isCreate} className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#94b0ab] data-[state=active]:bg-transparent px-0 h-full font-bold text-gray-400 data-[state=active]:text-[#94b0ab] gap-2 disabled:opacity-30 disabled:cursor-not-allowed">
                          <Heart size={15} /> Immobili
                        </TabsTrigger>
                        <TabsTrigger value="storico" disabled={isCreate} className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#94b0ab] data-[state=active]:bg-transparent px-0 h-full font-bold text-gray-400 data-[state=active]:text-[#94b0ab] gap-2 disabled:opacity-30 disabled:cursor-not-allowed">
                          <History size={15} /> Storico
                        </TabsTrigger>
                        <TabsTrigger value="task" disabled={isCreate} className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#94b0ab] data-[state=active]:bg-transparent px-0 h-full font-bold text-gray-400 data-[state=active]:text-[#94b0ab] gap-2 disabled:opacity-30 disabled:cursor-not-allowed">
                          <CheckSquare size={15} /> Task
                          {leadTasks.length > 0 && (
                            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[#94b0ab]/10 text-[#94b0ab] text-[10px] font-black">{leadTasks.length}</span>
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
                          <Label className="text-xs font-bold text-gray-500">Cognome <span className="text-red-400">*</span></Label>
                          <Input
                            required
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
                          <Label className="text-xs font-bold text-gray-500">Telefono</Label>
                          <Input
                            value={selectedLead.telefono || ''}
                            onChange={(e) => setSelectedLead({...selectedLead, telefono: e.target.value})}
                            className="h-11 rounded-xl border-gray-200 bg-slate-50/50"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-bold text-gray-500">Assegnato a</Label>
                          <Select
                            value={selectedLead.assegnato_a || "Nessuno"}
                            onValueChange={(v) => setSelectedLead({...selectedLead, assegnato_a: v})}
                          >
                            <SelectTrigger className="h-11 rounded-xl border-gray-200 bg-slate-50/50">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                              <SelectItem value="Nessuno">Nessuno</SelectItem>
                              {AGENTS.map(agent => (
                                <SelectItem key={agent} value={agent}>{agent}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
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
                    {(selectedLead.tipo_cliente === 'Acquirente' || selectedLead.tipo_cliente === 'Ibrido') && (
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
                              {[50000, 100000, 150000, 200000, 300000, 500000, 750000, 1000000].map((preset) => {
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

                          {/* Row 2 — Tipologia + Zone side by side */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                            {/* Tipologia Ricercata — same Select as Zona Vendita */}
                            <div className="space-y-2">
                              <Label className="text-xs font-bold text-gray-500">Tipologia Ricercata</Label>
                              <Select
                                value={selectedLead.tipologia_ricerca || ''}
                                onValueChange={(v) => setSelectedLead({...selectedLead, tipologia_ricerca: v})}
                              >
                                <SelectTrigger className="h-11 rounded-xl border-gray-200 bg-slate-50/50">
                                  <SelectValue placeholder="Seleziona..." />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl">
                                  {['Monolocale','Bilocale','Trilocale','Quadrilocale','Pentalocale+','Villa','Villetta a schiera','Attico','Box','Posto auto','Locale commerciale','Capannone','Terreno'].map(t => (
                                    <SelectItem key={t} value={t}>{t}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Zone di Interesse — floating dropdown matching Tipologia style */}
                            <div className="space-y-2 relative">
                              <Label className="text-xs font-bold text-gray-500">Zone di Interesse</Label>
                              <button
                                type="button"
                                onClick={() => setZoneAccordionOpen(o => !o)}
                                className="flex h-11 w-full items-center justify-between rounded-xl border border-gray-200 bg-slate-50/50 px-3 text-sm transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                              >
                                <span className={cn("truncate", selectedZoneInteresse.length === 0 && "text-muted-foreground")}>
                                  {selectedZoneInteresse.length === 0
                                    ? "Seleziona zona..."
                                    : selectedZoneInteresse.length === 1
                                      ? dbZones.find(z => z.id === selectedZoneInteresse[0])?.nome ?? "1 zona"
                                      : `${selectedZoneInteresse.length} zone selezionate`
                                  }
                                </span>
                                <ChevronDown size={16} className={cn("shrink-0 opacity-50 transition-transform duration-200", zoneAccordionOpen && "rotate-180")} />
                              </button>
                              {zoneAccordionOpen && (
                                <>
                                  <div className="fixed inset-0 z-40" onClick={() => setZoneAccordionOpen(false)} />
                                  <div className="absolute z-50 left-0 right-0 top-full mt-1 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
                                    <div className="p-2 border-b border-gray-100">
                                      <div className="relative">
                                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                        <Input
                                          value={zoneSearch}
                                          onChange={(e) => setZoneSearch(e.target.value)}
                                          placeholder="Cerca zona..."
                                          className="h-9 pl-8 text-xs rounded-lg border-gray-200 bg-slate-50"
                                        />
                                      </div>
                                    </div>
                                    <div className="max-h-52 overflow-y-auto">
                                      {dbZones.length === 0 ? (
                                        <div className="px-3 py-2 text-xs text-gray-400 italic">Caricamento zone...</div>
                                      ) : dbZones
                                          .filter(z => !zoneSearch || z.nome.toLowerCase().includes(zoneSearch.toLowerCase()))
                                          .map(zona => {
                                            const isSelected = selectedZoneInteresse.includes(zona.id);
                                            return (
                                              <button
                                                key={zona.id}
                                                type="button"
                                                onClick={() => setSelectedZoneInteresse(prev =>
                                                  isSelected ? prev.filter(id => id !== zona.id) : [...prev, zona.id]
                                                )}
                                                className={cn(
                                                  "w-full flex items-center gap-3 px-3 py-2 text-sm text-left transition-colors min-h-[44px]",
                                                  isSelected ? "bg-blue-50 text-blue-700 font-semibold" : "text-gray-700 hover:bg-slate-50"
                                                )}
                                              >
                                                <span className={cn(
                                                  "w-4 h-4 rounded border flex items-center justify-center shrink-0 text-[10px] font-bold transition-colors",
                                                  isSelected ? "bg-blue-500 border-blue-500 text-white" : "border-gray-300 bg-white text-transparent"
                                                )}>✓</span>
                                                {zona.nome}
                                              </button>
                                            );
                                          })}
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>

                          </div>
                        </div>
                      </div>
                    )}

                    {/* Card: Dati di Vendita (conditional) */}
                    {(selectedLead.tipo_cliente === 'Proprietario' || selectedLead.tipo_cliente === 'Ibrido') && (
                      <div className="bg-white border border-red-100 rounded-xl shadow-sm p-5 space-y-5">
                        <div className="flex items-center gap-2">
                          <TrendingUp size={15} className="text-red-500" />
                          <h3 className="text-sm font-semibold text-red-600 tracking-wide uppercase">Dati di Vendita</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          <div className="space-y-2">
                            <Label className="text-xs font-bold text-gray-500">Zona Vendita</Label>
                            <Select
                              value={selectedLead.zona_id || ''}
                              onValueChange={(v) => setSelectedLead({...selectedLead, zona_id: v})}
                            >
                              <SelectTrigger className="h-11 rounded-xl border-gray-200 bg-slate-50/50">
                                <SelectValue placeholder="Seleziona zona..." />
                              </SelectTrigger>
                              <SelectContent className="rounded-xl">
                                {dbZones.map(zona => (
                                  <SelectItem key={zona.id} value={zona.id}>{zona.nome}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-bold text-gray-500">Via / Indirizzo</Label>
                            <Input
                              value={selectedLead.via || ''}
                              onChange={(e) => setSelectedLead({...selectedLead, via: e.target.value})}
                              placeholder="es. Via Roma 12"
                              className="h-11 rounded-xl border-gray-200 bg-slate-50/50"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-bold text-gray-500">Valutazione Stimata (€)</Label>
                            <Input
                              type="number"
                              value={selectedLead.valutazione_stimata || ''}
                              onChange={(e) => setSelectedLead({...selectedLead, valutazione_stimata: e.target.value})}
                              className="h-11 rounded-xl border-gray-200 bg-slate-50/50"
                            />
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
                    )}
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
                              {selectedLead.immobile_primo_contatto.zone?.nome && (
                                <p className="text-xs text-gray-400 mt-0.5">{selectedLead.immobile_primo_contatto.zone.nome}</p>
                              )}
                            </div>
                            <span className="text-base font-extrabold text-[#94b0ab] shrink-0">{formatPrice(selectedLead.immobile_primo_contatto.prezzo)}</span>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {/* ── Auto-Match Engine (Acquirente / Ibrido only) ── */}
                    {(selectedLead.tipo_cliente === 'Acquirente' || selectedLead.tipo_cliente === 'Ibrido') && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Corrispondenze</h3>
                            {!isLoadingMatches && matchedProperties.length > 0 && (
                              <Badge className="bg-emerald-100 text-emerald-700 border-none text-[10px] font-bold px-2">{matchedProperties.length} trovate</Badge>
                            )}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-xs text-gray-400 hover:text-[#94b0ab] rounded-lg h-7 px-2 gap-1"
                            onClick={() => fetchMatchedProperties({ budget: selectedLead.budget, tipologia: selectedLead.tipologia_ricerca, zoneIds: selectedZoneInteresse })}
                          >
                            <Search size={11} /> Aggiorna
                          </Button>
                        </div>

                        {/* Criteria pills */}
                        <div className="flex flex-wrap gap-1.5">
                          {selectedLead.budget && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-600 rounded-lg text-[11px] font-semibold border border-blue-100">
                              Budget ≤ {formatPrice(selectedLead.budget)}
                            </span>
                          )}
                          {selectedLead.tipologia_ricerca && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-600 rounded-lg text-[11px] font-semibold border border-blue-100">
                              {selectedLead.tipologia_ricerca}
                            </span>
                          )}
                          {selectedZoneInteresse.map(id => {
                            const z = dbZones.find(z => z.id === id);
                            return z ? (
                              <span key={id} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-600 rounded-lg text-[11px] font-semibold border border-blue-100">
                                <MapPin size={9} />{z.nome}
                              </span>
                            ) : null;
                          })}
                          {!selectedLead.budget && !selectedLead.tipologia_ricerca && selectedZoneInteresse.length === 0 && (
                            <span className="text-xs text-gray-400 italic">Nessun criterio impostato nel profilo.</span>
                          )}
                        </div>

                        {isLoadingMatches ? (
                          <div className="py-8 text-center text-gray-400 text-sm animate-pulse">Ricerca in corso...</div>
                        ) : matchedProperties.length === 0 ? (
                          <div className="py-8 text-center bg-white rounded-xl border border-dashed border-gray-200 shadow-sm">
                            <Search className="mx-auto text-gray-200 mb-2" size={26} />
                            <p className="text-xs text-gray-400 italic">Nessun immobile corrisponde ai criteri del lead.</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {matchedProperties.map((prop) => {
                              const alreadyLinked = selectedLead.lead_immobili?.some((li: any) => li.immobili?.id === prop.id || li.immobile_id === prop.id);
                              return (
                                <div key={prop.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex items-stretch group hover:border-emerald-200 transition-all">
                                  <div className="w-20 shrink-0 bg-slate-100 overflow-hidden">
                                    {prop.copertina_url ? (
                                      <img src={prop.copertina_url} alt={prop.titolo} className="w-full h-full object-cover min-h-[68px]" />
                                    ) : (
                                      <div className="w-full min-h-[68px] flex items-center justify-center text-slate-300"><HomeIcon size={20} /></div>
                                    )}
                                  </div>
                                  <div className="flex-1 px-4 py-3 min-w-0">
                                    <p className="font-bold text-gray-900 truncate text-sm leading-tight">{prop.titolo}</p>
                                    {prop.zone?.nome && <p className="text-xs text-gray-400 mt-0.5">{prop.zone.nome}</p>}
                                    {prop.locali && <p className="text-[11px] text-gray-400">{prop.locali}</p>}
                                    <p className="text-sm font-bold text-[#94b0ab] mt-1">{formatPrice(prop.prezzo)}</p>
                                  </div>
                                  <div className="flex items-center pr-4 shrink-0">
                                    {alreadyLinked ? (
                                      <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100">Collegato</span>
                                    ) : (
                                      <Button
                                        type="button"
                                        size="sm"
                                        className="rounded-xl bg-[#94b0ab] hover:bg-[#7a948f] text-white font-bold px-3 h-8 text-xs gap-1"
                                        onClick={(e) => { e.preventDefault(); handleAssociateProperty(prop); }}
                                      >
                                        <Plus size={12} /> Collega
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

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
                                {item.immobili.zone?.nome && <p className="text-xs text-gray-400 mt-0.5">{item.immobili.zone.nome}</p>}
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

                  {/* ── STORICO TAB ── */}
                  <TabsContent value="storico" className="mt-0 p-6 space-y-5 animate-in fade-in slide-in-from-bottom-2">

                    {/* Original message — always visible, visually distinct */}
                    <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2.5">
                        <MessageSquare size={13} className="text-amber-600 shrink-0" />
                        <span className="text-xs font-black text-amber-700 uppercase tracking-widest">Messaggio di Primo Contatto</span>
                        <span className="text-[10px] text-amber-500 ml-auto font-medium shrink-0">
                          {safeFormat(selectedLead.created_at, "d MMM yyyy", { locale: it })}
                        </span>
                      </div>
                      <p className="text-sm text-amber-900 leading-relaxed italic">
                        "{selectedLead.messaggio || 'Nessun messaggio ricevuto.'}"
                      </p>
                    </div>

                    {/* Timeline of notes */}
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground tracking-wide uppercase mb-3">Note Interne</p>

                      {/* Notes list — own scroll so the input stays visible */}
                      <div className="space-y-1 max-h-[300px] overflow-y-auto pr-1">
                        {leadNotes.length === 0 ? (
                          <div className="py-10 text-center bg-white rounded-xl border border-dashed border-gray-200">
                            <History className="mx-auto text-gray-200 mb-2" size={26} />
                            <p className="text-xs text-gray-400 italic">Nessuna nota registrata ancora.</p>
                          </div>
                        ) : leadNotes.map((note, idx) => (
                          <div key={note.id} className="flex gap-3 group">
                            {/* Avatar + timeline connector */}
                            <div className="flex flex-col items-center shrink-0 pt-0.5">
                              <div className="w-7 h-7 rounded-full bg-[#94b0ab]/10 text-[#94b0ab] flex items-center justify-center text-[10px] font-black border border-[#94b0ab]/20">
                                {note.autore?.charAt(0)?.toUpperCase() || '?'}
                              </div>
                              {idx < leadNotes.length - 1 && (
                                <div className="w-px flex-1 bg-gray-100 my-1" />
                              )}
                            </div>
                            {/* Bubble */}
                            <div className={cn("flex-1 min-w-0", idx < leadNotes.length - 1 ? "pb-3" : "pb-1")}>
                              <div className="flex items-baseline gap-2 mb-1">
                                <span className="text-xs font-bold text-gray-800">{note.autore}</span>
                                <span className="text-[10px] text-gray-400 font-medium">
                                  {safeFormat(note.created_at, "d MMMM yyyy, HH:mm", { locale: it })}
                                </span>
                              </div>
                              <div className="bg-white border border-gray-100 rounded-xl rounded-tl-sm px-4 py-3 shadow-sm">
                                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{note.testo}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Add note input */}
                    <div className="bg-white border rounded-xl shadow-sm p-4 space-y-3">
                      {/* Author selector */}
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-[#94b0ab]/10 text-[#94b0ab] flex items-center justify-center text-[10px] font-black border border-[#94b0ab]/20 shrink-0">
                          {newNoteAutore.charAt(0)}
                        </div>
                        <Select value={newNoteAutore} onValueChange={setNewNoteAutore}>
                          <SelectTrigger className="h-8 w-36 rounded-lg border-gray-200 text-xs font-bold bg-slate-50">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl">
                            {AGENTS.map(a => <SelectItem key={a} value={a} className="text-xs font-medium">{a}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <span className="text-xs text-gray-400">sta scrivendo una nota...</span>
                      </div>

                      {/* Textarea + submit */}
                      <div className="flex gap-2 items-end">
                        <Textarea
                          value={newNoteText}
                          onChange={(e) => setNewNoteText(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddNote(); }}
                          placeholder="Scrivi una nota (⌘↵ per salvare)..."
                          className="flex-1 min-h-[80px] max-h-[140px] rounded-xl border-gray-200 bg-slate-50 text-sm resize-none focus:ring-[#94b0ab] p-3"
                        />
                        <Button
                          type="button"
                          disabled={isSavingNote || !newNoteText.trim()}
                          onClick={handleAddNote}
                          className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl h-10 px-4 font-bold shrink-0 gap-1.5 transition-all disabled:opacity-40"
                        >
                          {isSavingNote ? "..." : <><Send size={14} /> Aggiungi</>}
                        </Button>
                      </div>
                    </div>

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

    </AdminLayout>
  );
};

export default Leads;