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
import { Phone, MessageCircle, CalendarDays, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { showError, showSuccess } from '@/utils/toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

export const TIPOLOGIA_CONFIG: Record<string, {
  icon: React.ElementType;
  color: string;
  bg: string;
  activeCls: string;
}> = {
  Chiamata:     { icon: Phone,        color: 'text-blue-500',   bg: 'bg-blue-50',   activeCls: 'bg-blue-50 border-blue-200 text-blue-700'   },
  WhatsApp:     { icon: MessageCircle, color: 'text-green-500',  bg: 'bg-green-50',  activeCls: 'bg-green-50 border-green-200 text-green-700'  },
  Appuntamento: { icon: CalendarDays, color: 'text-purple-500', bg: 'bg-purple-50', activeCls: 'bg-purple-50 border-purple-200 text-purple-700' },
};

const TIPOLOGIE = Object.keys(TIPOLOGIA_CONFIG);

interface TaskModalProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  defaultLeadId?: string;
  defaultLeadName?: string;
}

const TaskModal = ({ open, onClose, onSaved, defaultLeadId, defaultLeadName }: TaskModalProps) => {
  const [tipologia, setTipologia] = useState('Chiamata');
  const [leadId, setLeadId] = useState('');
  const [leadSearch, setLeadSearch] = useState('');
  const [leadResults, setLeadResults] = useState<any[]>([]);
  const [showLeadDrop, setShowLeadDrop] = useState(false);
  const [data, setData] = useState('');
  const [ora, setOra] = useState('');
  const [nota, setNota] = useState('');
  const [agenteId, setAgenteId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [currentUserId, setCurrentUserId] = useState('');
  const [teamMembers, setTeamMembers] = useState<{ id: string; full_name: string | null; email: string | null }[]>([]);

  useEffect(() => {
    if (!open) return;
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        setCurrentUserId(user.id);
        setAgenteId(user.id);
      }
      // Fetch team members from profiles with fallback
      const { data, error } = await supabase.from('profiles').select('id, full_name, email');
      if (!error && data && data.length > 0) {
        setTeamMembers(data);
      } else if (user) {
        setTeamMembers([{ id: user.id, full_name: 'Tu', email: user.email ?? null }]);
      }
    });
    setTipologia('Chiamata');
    setData(format(new Date(), 'yyyy-MM-dd'));
    setOra('');
    setNota('');
    setLeadResults([]);
    setShowLeadDrop(false);
    if (defaultLeadId) {
      setLeadId(defaultLeadId);
      setLeadSearch(defaultLeadName || '');
    } else {
      setLeadId('');
      setLeadSearch('');
    }
  }, [open, defaultLeadId, defaultLeadName]);

  const searchLeads = async (q: string) => {
    if (!q.trim()) { setLeadResults([]); return; }
    const { data: rows } = await supabase
      .from('leads')
      .select('id, nome, cognome, telefono')
      .or(`nome.ilike.%${q}%,cognome.ilike.%${q}%`)
      .limit(8);
    setLeadResults(rows || []);
    setShowLeadDrop(true);
  };

  const handleSave = async () => {
    if (!tipologia || !leadId || !data) {
      showError('Compila tutti i campi obbligatori (Tipologia, Lead, Data)');
      return;
    }
    if (!currentUserId) {
      showError('Utente non autenticato');
      return;
    }
    setIsSaving(true);
    const { error } = await supabase.from('tasks').insert({
      lead_id: leadId,
      agente_id: agenteId || currentUserId,
      tipologia,
      nota: nota.trim() || null,
      data,
      ora: ora || null,
      stato: 'Da fare',
    });
    setIsSaving(false);
    if (error) {
      console.error('[TaskModal] insert error', error);
      showError('Errore: ' + error.message);
    } else {
      showSuccess('Task creata');
      onSaved?.();
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md rounded-2xl p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-100">
          <DialogTitle className="text-lg font-bold text-gray-900">Nuova Task</DialogTitle>
        </DialogHeader>

        <div className="px-6 py-5 space-y-5">
          {/* Tipologia */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-gray-500">Tipologia *</Label>
            <div className="flex gap-2">
              {TIPOLOGIE.map(t => {
                const cfg = TIPOLOGIA_CONFIG[t];
                const Icon = cfg.icon;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipologia(t)}
                    className={cn(
                      "flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-semibold transition-all min-h-[44px]",
                      tipologia === t
                        ? cfg.activeCls
                        : "bg-slate-50/80 border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-slate-100"
                    )}
                  >
                    <Icon size={18} className={tipologia === t ? cfg.color : 'text-gray-400'} />
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Lead collegato */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-gray-500">Lead collegato *</Label>
            {defaultLeadId ? (
              <div className="h-11 flex items-center px-3 rounded-xl border border-gray-200 bg-slate-100 text-sm text-gray-700 font-medium">
                {leadSearch || 'Lead selezionato'}
              </div>
            ) : (
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <Input
                  value={leadSearch}
                  onChange={(e) => { setLeadSearch(e.target.value); searchLeads(e.target.value); }}
                  placeholder="Cerca lead per nome..."
                  className="h-11 pl-8 rounded-xl border-gray-200 bg-slate-50/50"
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
                          className="w-full px-4 py-3 text-sm text-left hover:bg-slate-50 transition-colors min-h-[44px]"
                        >
                          <p className="font-semibold text-gray-800">{lead.nome} {lead.cognome}</p>
                          {lead.telefono && <p className="text-xs text-gray-400">{lead.telefono}</p>}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Data + Ora */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-gray-500">Data *</Label>
              <Input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="h-11 rounded-xl border-gray-200 bg-slate-50/50"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-gray-500">Ora</Label>
              <Input
                type="time"
                value={ora}
                onChange={(e) => setOra(e.target.value)}
                className="h-11 rounded-xl border-gray-200 bg-slate-50/50"
              />
            </div>
          </div>

          {/* Nota */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-gray-500">Nota</Label>
            <Textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Aggiungi un messaggio o promemoria..."
              className="rounded-xl border-gray-200 bg-slate-50/50 min-h-[80px] resize-none"
            />
          </div>

          {/* Agente assegnato */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-gray-500">Agente assegnato</Label>
            <Select value={agenteId} onValueChange={setAgenteId}>
              <SelectTrigger className="h-11 rounded-xl border-gray-200 bg-slate-50/50">
                <SelectValue placeholder="Seleziona agente..." />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {teamMembers.map(m => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.full_name ?? m.email ?? m.id.substring(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-gray-100 bg-slate-50/50 gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="flex-1 rounded-xl h-11 border-gray-200"
          >
            Annulla
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl h-11 font-bold"
          >
            {isSaving ? 'Salvataggio...' : 'Crea Task'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TaskModal;
