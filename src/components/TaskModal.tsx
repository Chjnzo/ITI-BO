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
import { Phone, MessageCircle, CalendarDays, Search, CalendarIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { showError, showSuccess } from '@/utils/toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';

// Exported for use in Tasks.tsx and Dashboard.tsx
export const TIPOLOGIA_CONFIG: Record<string, {
  icon: React.ElementType;
  color: string;
  bg: string;
  activeCls: string;
}> = {
  Chiamata:     { icon: Phone,         color: 'text-blue-500',   bg: 'bg-blue-50',   activeCls: 'bg-blue-50 border-blue-200 text-blue-700'   },
  WhatsApp:     { icon: MessageCircle, color: 'text-green-500',  bg: 'bg-green-50',  activeCls: 'bg-green-50 border-green-200 text-green-700'  },
  Appuntamento: { icon: CalendarDays,  color: 'text-purple-500', bg: 'bg-purple-50', activeCls: 'bg-purple-50 border-purple-200 text-purple-700' },
};

interface TaskModalProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  defaultLeadId?: string;
  defaultLeadName?: string;
}

const TaskModal = ({ open, onClose, onSaved, defaultLeadId, defaultLeadName }: TaskModalProps) => {
  const [titolo, setTitolo] = useState('');
  const [leadId, setLeadId] = useState('');
  const [leadSearch, setLeadSearch] = useState('');
  const [leadResults, setLeadResults] = useState<any[]>([]);
  const [showLeadDrop, setShowLeadDrop] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [ora, setOra] = useState('');
  const [nota, setNota] = useState('');
  const [agenteId, setAgenteId] = useState('');
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
    setSelectedDate(new Date());
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
      lead_id: leadId || null,
      agente_id: agenteId || currentUserId,
      tipologia: null,
      nota: nota.trim() || null,
      data: format(selectedDate!, 'yyyy-MM-dd'),
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
          {/* Titolo task */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-gray-500">Titolo task *</Label>
            <Input
              value={titolo}
              onChange={(e) => setTitolo(e.target.value)}
              placeholder="Es: Richiamare cliente, Preparare documentazione..."
              className="h-11 rounded-xl border-gray-200 bg-slate-50/50"
            />
          </div>

          {/* Agente assegnato */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-gray-500">Agente assegnato *</Label>
            <Select value={agenteId} onValueChange={setAgenteId}>
              <SelectTrigger className="h-11 rounded-xl border-gray-200 bg-slate-50/50">
                <SelectValue placeholder="Seleziona agente..." />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
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
            <Label className="text-xs font-bold text-gray-500">Lead collegato</Label>
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
                  placeholder="Cerca lead per nome... (opzionale)"
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
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal rounded-xl bg-gray-50/50 border-gray-100 hover:bg-gray-100 h-11',
                      !selectedDate && 'text-muted-foreground',
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-[#94b0ab]" />
                    {selectedDate ? format(selectedDate, 'PPP', { locale: it }) : 'Seleziona data'}
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
              placeholder="Aggiungi un promemoria..."
              className="rounded-xl border-gray-200 bg-slate-50/50 min-h-[80px] resize-none"
            />
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
