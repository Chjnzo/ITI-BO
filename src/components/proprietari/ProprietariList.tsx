"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { showError, showSuccess } from '@/utils/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Phone, Search, X, KeyRound } from 'lucide-react';
import type { FaseProprietario } from '@/types';

interface ProprietarioPraticaRow {
  id: string;
  via: string;
  tipologia: string | null;
  citta: string | null;
  fase: FaseProprietario;
  updated_at: string;
}

interface ProprietarioRow {
  id: string;
  nome: string;
  cognome: string | null;
  email: string | null;
  telefono: string | null;
  professione: string | null;
  is_deleted: boolean;
  contatti: { agente_id: string | null; created_at: string } | null;
  proprietari_pratiche: ProprietarioPraticaRow[];
}

interface AgenteOption {
  id: string;
  nome_completo: string | null;
}

interface ProprietariListProps {
  // Incrementato dalla pagina quando un nuovo proprietario viene creato
  // altrove (dialog "Nuovo Proprietario"), per forzare un refetch qui.
  refreshSignal?: number;
}

const ultimaPratica = (pratiche: ProprietarioPraticaRow[]): ProprietarioPraticaRow | null => {
  if (!pratiche.length) return null;
  return [...pratiche].sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))[0];
};

const ProprietariList = ({ refreshSignal }: ProprietariListProps) => {
  const queryClient = useQueryClient();
  const [proprietari, setProprietari] = useState<ProprietarioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [agenti, setAgenti] = useState<AgenteOption[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [agenteFilter, setAgenteFilter] = useState<string>('tutti');
  const [avviaPraticaTarget, setAvviaPraticaTarget] = useState<ProprietarioRow | null>(null);

  const fetchProprietari = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('proprietari')
      .select(`
        id, nome, cognome, email, telefono, professione, is_deleted,
        contatti(agente_id, created_at),
        proprietari_pratiche(id, via, tipologia, citta, fase, updated_at)
      `)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false, foreignTable: 'contatti' });
    if (signal?.aborted) return;
    if (error) {
      showError('Errore nel caricamento proprietari.');
    } else {
      setProprietari((data ?? []) as unknown as ProprietarioRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchProprietari(controller.signal);
    return () => controller.abort();
  }, [fetchProprietari, refreshSignal]);

  useEffect(() => {
    supabase
      .from('profili_agenti')
      .select('id, nome_completo')
      .then(({ data, error }) => {
        if (!error) setAgenti((data ?? []) as AgenteOption[]);
      });
  }, []);

  const filtered = useMemo(() => {
    let rows = proprietari;
    if (agenteFilter !== 'tutti') {
      rows = rows.filter((p) => p.contatti?.agente_id === agenteFilter);
    }
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    const tokens = q.split(/\s+/).filter(Boolean);
    return rows.filter((p) => {
      const fullName = `${p.nome ?? ''} ${p.cognome ?? ''}`.toLowerCase();
      const phoneNorm = (p.telefono ?? '').replace(/[\s-]/g, '');
      return tokens.every((token) => {
        const tokenPhone = token.replace(/[\s-]/g, '');
        return (
          fullName.includes(token) ||
          p.email?.toLowerCase().includes(token) ||
          (tokenPhone && phoneNorm.includes(tokenPhone))
        );
      });
    });
  }, [proprietari, searchQuery, agenteFilter]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden min-h-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 shrink-0 pt-2">
        <p className="text-gray-500 font-medium">{filtered.length} proprietari</p>

        <div className="flex items-center gap-3 flex-wrap">
          <Select value={agenteFilter} onValueChange={setAgenteFilter}>
            <SelectTrigger className="h-11 w-[200px] rounded-xl border-gray-200 bg-white text-sm font-medium">
              <SelectValue placeholder="Tutti gli agenti" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tutti">Tutti gli agenti</SelectItem>
              {agenti.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.nome_completo ?? 'Agente'}</SelectItem>
              ))}
            </SelectContent>
          </Select>

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
              placeholder="Cerca per nome, telefono, email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoComplete="off"
              name="search-proprietari"
              className="h-11 pl-9 w-[280px] rounded-xl border-gray-200 bg-white"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden min-h-0">
        <div className="h-full bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-y-auto">
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left table-fixed">
              <colgroup>
                <col style={{ width: '25%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '35%' }} />
                <col style={{ width: '20%' }} />
              </colgroup>
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100">
                  <th className="px-8 py-5 text-xs font-bold uppercase tracking-widest text-gray-400">Proprietario</th>
                  <th className="px-8 py-5 text-xs font-bold uppercase tracking-widest text-gray-400">Professione</th>
                  <th className="px-8 py-5 text-xs font-bold uppercase tracking-widest text-gray-400">Pratica</th>
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
                      <td className="px-8 py-5"><div className="h-8 bg-gray-50 rounded-xl animate-pulse w-24 ml-auto" /></td>
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={4} className="px-8 py-16 text-center text-gray-300 italic">Nessun proprietario trovato</td></tr>
                ) : filtered.map((p) => {
                  const pratica = ultimaPratica(p.proprietari_pratiche ?? []);
                  return (
                    <tr key={p.id} className="hover:bg-gray-50/30 transition-colors group">
                      <td className="px-8 py-5 min-w-0">
                        <div className="font-bold text-gray-900 truncate">{p.nome} {p.cognome}</div>
                        <div className="text-xs text-gray-400 font-medium flex items-center gap-1.5 mt-0.5 min-w-0">
                          <Phone size={10} className="text-gray-300 shrink-0" />
                          <span className="truncate">{p.telefono || 'N/D'}</span>
                        </div>
                      </td>
                      <td className="px-8 py-5 min-w-0">
                        {p.professione
                          ? <span className="text-xs text-gray-500 truncate block">{p.professione}</span>
                          : <span className="text-xs text-gray-200">—</span>}
                      </td>
                      <td className="px-8 py-5 min-w-0">
                        {pratica ? (
                          <div className="flex items-center gap-2 min-w-0">
                            <Badge variant="secondary" className="font-semibold text-[0.65rem] shrink-0">{pratica.fase}</Badge>
                            <span className="text-xs text-gray-500 truncate">{pratica.via}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300 italic">Nessuna pratica</span>
                        )}
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-2 justify-end">
                          {!pratica && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setAvviaPraticaTarget(p)}
                              className="h-8 rounded-xl text-xs font-bold border-gray-200 hover:border-[#94b0ab] hover:text-[#7a948f]"
                            >
                              <KeyRound size={13} className="mr-1.5" />
                              Avvia pratica
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <AvviaPraticaDialog
        proprietario={avviaPraticaTarget}
        onClose={() => setAvviaPraticaTarget(null)}
        onCreated={() => {
          fetchProprietari();
          queryClient.invalidateQueries({ queryKey: ['proprietari-pipeline'] });
        }}
      />
    </div>
  );
};

interface AvviaPraticaDialogProps {
  proprietario: ProprietarioRow | null;
  onClose: () => void;
  onCreated: () => void;
}

const AvviaPraticaDialog = ({ proprietario, onClose, onCreated }: AvviaPraticaDialogProps) => {
  const [via, setVia] = useState('');
  const [tipologia, setTipologia] = useState('');
  const [citta, setCitta] = useState('');

  useEffect(() => {
    if (proprietario) {
      setVia('');
      setTipologia('');
      setCitta('');
    }
  }, [proprietario]);

  const avviaPratica = useMutation({
    mutationFn: async () => {
      if (!proprietario) return;
      const { error } = await supabase
        .from('proprietari_pratiche')
        .insert({
          proprietario_id: proprietario.id,
          via: via.trim(),
          tipologia: tipologia.trim() || null,
          citta: citta.trim() || null,
          fase: 'Contatto',
        });
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess('Pratica avviata.');
      onCreated();
      onClose();
    },
    onError: () => showError('Impossibile avviare la pratica.'),
  });

  return (
    <Dialog open={!!proprietario} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-full sm:max-w-md border-none shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold">Avvia pratica</DialogTitle>
          <DialogDescription className="font-medium">
            {proprietario && `Per ${proprietario.nome} ${proprietario.cognome ?? ''}`.trim()}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => { e.preventDefault(); avviaPratica.mutate(); }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="ap-via" className="text-xs font-bold text-gray-500">Via *</Label>
            <Input
              id="ap-via"
              value={via}
              onChange={(e) => setVia(e.target.value)}
              required
              className="rounded-xl"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ap-tipologia" className="text-xs font-bold text-gray-500">Tipologia</Label>
              <Input
                id="ap-tipologia"
                value={tipologia}
                onChange={(e) => setTipologia(e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ap-citta" className="text-xs font-bold text-gray-500">Città</Label>
              <Input
                id="ap-citta"
                value={citta}
                onChange={(e) => setCitta(e.target.value)}
                className="rounded-xl"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl font-bold border-gray-200">
              Annulla
            </Button>
            <Button
              type="submit"
              disabled={avviaPratica.isPending || !via.trim()}
              className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl font-bold"
            >
              Avvia
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ProprietariList;
