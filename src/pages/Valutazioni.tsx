import { useState, useEffect, useCallback } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase';
import { showError, showSuccess } from '@/utils/toast';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import {
  Plus, Calculator, ExternalLink, MoreHorizontal,
  Copy, Link2, Eye, Pencil, ToggleLeft, ToggleRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ValuationWizard from '@/components/valutazioni/ValuationWizard';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Valutazione {
  id: string;
  indirizzo: string;
  citta: string | null;
  superficie_mq: number;
  stato: string;
  created_at: string;
  stima_min: number | null;
  stima_max: number | null;
  motivazione_ai: string | null;
  slug: string | null;
  leads?: { nome: string; cognome: string } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtEuro = (n: number | null) =>
  n == null ? null : `€${(n / 1000).toFixed(0)}k`;

const StatoBadge = ({ stato }: { stato: string }) => {
  if (stato === 'Completata') {
    return (
      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50 font-semibold text-[11px] rounded-lg px-2.5 py-1">
        Completata
      </Badge>
    );
  }
  return (
    <Badge className="bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-50 font-semibold text-[11px] rounded-lg px-2.5 py-1">
      Bozza
    </Badge>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────

const Valutazioni = () => {
  const [valutazioni, setValutazioni] = useState<Valutazione[]>([]);
  const [loading, setLoading] = useState(true);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Edit modal
  const [editTarget, setEditTarget] = useState<Valutazione | null>(null);
  const [editStimaMin, setEditStimaMin] = useState('');
  const [editStimaMax, setEditStimaMax] = useState('');
  const [editMotivazione, setEditMotivazione] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const fetchValutazioni = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('valutazioni')
      .select('id, indirizzo, citta, superficie_mq, stato, created_at, stima_min, stima_max, motivazione_ai, slug, leads(nome, cognome)')
      .order('created_at', { ascending: false });
    if (error) {
      showError('Errore nel caricamento valutazioni');
    } else {
      setValutazioni((data as unknown as Valutazione[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchValutazioni(); }, [fetchValutazioni]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleCopyLink = async (slug: string) => {
    const url = `${window.location.origin}/report/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      showSuccess('Link copiato negli appunti!');
    } catch {
      showError('Impossibile copiare il link');
    }
  };

  const handleToggleStato = async (v: Valutazione) => {
    const nuovoStato = v.stato === 'Completata' ? 'Bozza' : 'Completata';
    setTogglingId(v.id);
    const { error } = await supabase
      .from('valutazioni')
      .update({ stato: nuovoStato })
      .eq('id', v.id);
    if (error) {
      showError('Errore nel cambio stato');
    } else {
      setValutazioni(prev =>
        prev.map(item => item.id === v.id ? { ...item, stato: nuovoStato } : item),
      );
      showSuccess(`Stato aggiornato: ${nuovoStato}`);
    }
    setTogglingId(null);
  };

  const handleOpenEdit = (v: Valutazione) => {
    setEditTarget(v);
    setEditStimaMin(v.stima_min != null ? String(v.stima_min) : '');
    setEditStimaMax(v.stima_max != null ? String(v.stima_max) : '');
    setEditMotivazione(v.motivazione_ai ?? '');
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    setIsSavingEdit(true);
    const payload: Record<string, unknown> = {
      motivazione_ai: editMotivazione.trim() || null,
      updated_at: new Date().toISOString(),
    };
    if (editStimaMin) payload.stima_min = Number(editStimaMin);
    if (editStimaMax) payload.stima_max = Number(editStimaMax);

    const { error } = await supabase
      .from('valutazioni')
      .update(payload)
      .eq('id', editTarget.id);

    if (error) {
      showError('Errore nel salvataggio');
    } else {
      setValutazioni(prev => prev.map(item =>
        item.id === editTarget.id
          ? {
              ...item,
              stima_min: editStimaMin ? Number(editStimaMin) : item.stima_min,
              stima_max: editStimaMax ? Number(editStimaMax) : item.stima_max,
              motivazione_ai: editMotivazione.trim() || null,
            }
          : item,
      ));
      showSuccess('Valutazione aggiornata');
      setEditTarget(null);
    }
    setIsSavingEdit(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AdminLayout>

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900">Valutazioni</h1>
          <p className="text-gray-500 mt-1 font-medium">
            {loading ? '…' : `${valutazioni.length} valutazioni`}
          </p>
        </div>
        <Button
          onClick={() => setIsWizardOpen(true)}
          className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-2xl px-7 h-11 shadow-lg shadow-[#94b0ab]/20 font-bold transition-all"
        >
          <Plus size={16} className="mr-2" /> Nuova Valutazione
        </Button>
      </div>

      {/* Table card */}
      <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-gray-300 animate-pulse text-sm">Caricamento...</div>
        ) : valutazioni.length === 0 ? (
          <div className="py-20 flex flex-col items-center gap-3 text-gray-300">
            <Calculator size={40} strokeWidth={1.5} />
            <p className="text-sm italic">Nessuna valutazione ancora. Creane una!</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-widest text-gray-400 w-[28%]">Immobile</th>
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-widest text-gray-400 w-[18%]">Lead</th>
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-widest text-gray-400 w-[20%]">Stima</th>
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-widest text-gray-400 w-[10%]">Stato</th>
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-widest text-gray-400 w-[9%]">Data</th>
                <th className="px-6 py-4 w-[12%]" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {valutazioni.map(v => {
                const minStr = fmtEuro(v.stima_min);
                const maxStr = fmtEuro(v.stima_max);
                const isPublished = v.stato === 'Completata';
                const isToggling = togglingId === v.id;

                return (
                  <tr key={v.id} className="hover:bg-gray-50/60 transition-colors group">

                    {/* Immobile — address + city stacked */}
                    <td className="px-6 py-5">
                      <p className="font-semibold text-gray-900 truncate leading-snug">
                        {v.indirizzo}
                      </p>
                      {v.citta && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{v.citta}</p>
                      )}
                    </td>

                    {/* Lead */}
                    <td className="px-6 py-5">
                      {v.leads
                        ? <span className="font-medium text-gray-700 truncate block">{v.leads.nome} {v.leads.cognome}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>

                    {/* Stima */}
                    <td className="px-6 py-5">
                      {minStr && maxStr
                        ? <span className="font-bold text-[#94b0ab] tabular-nums">{minStr} – {maxStr}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>

                    {/* Stato badge */}
                    <td className="px-6 py-5">
                      <StatoBadge stato={v.stato} />
                    </td>

                    {/* Data */}
                    <td className="px-6 py-5 text-gray-400 text-xs tabular-nums">
                      {format(parseISO(v.created_at), 'd MMM yy', { locale: it })}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-5">
                      <div className="flex items-center justify-end gap-2">

                        {/* Copy link — visible only when published and slug exists */}
                        {isPublished && v.slug && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopyLink(v.slug!)}
                            className="h-8 px-2.5 rounded-lg text-gray-400 hover:text-[#94b0ab] hover:bg-[#94b0ab]/8 gap-1.5 text-xs font-semibold transition-colors opacity-0 group-hover:opacity-100"
                            title="Copia link pubblico"
                          >
                            <Link2 size={13} />
                            <span className="hidden lg:inline">Copia link</span>
                          </Button>
                        )}

                        {/* Actions dropdown */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                            >
                              <MoreHorizontal size={15} />
                              <span className="sr-only">Azioni</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52 rounded-2xl shadow-xl border-gray-100 p-1.5">

                            {/* Visualizza report */}
                            {v.slug && (
                              <DropdownMenuItem asChild>
                                <a
                                  href={`/report/${v.slug}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={cn(
                                    'flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer text-sm font-medium',
                                    'text-gray-700 hover:bg-[#94b0ab]/8 hover:text-[#7a948f]',
                                  )}
                                >
                                  <Eye size={14} className="text-[#94b0ab]" />
                                  Visualizza Report
                                  <ExternalLink size={11} className="ml-auto text-gray-300" />
                                </a>
                              </DropdownMenuItem>
                            )}

                            {/* Copia link */}
                            {v.slug && (
                              <DropdownMenuItem
                                onClick={() => handleCopyLink(v.slug!)}
                                className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer text-sm font-medium text-gray-700 hover:bg-[#94b0ab]/8 hover:text-[#7a948f]"
                              >
                                <Copy size={14} className="text-[#94b0ab]" />
                                Copia link
                              </DropdownMenuItem>
                            )}

                            {v.slug && <DropdownMenuSeparator className="my-1" />}

                            {/* Modifica */}
                            <DropdownMenuItem
                              onClick={() => handleOpenEdit(v)}
                              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer text-sm font-medium text-gray-700 hover:bg-[#94b0ab]/8 hover:text-[#7a948f]"
                            >
                              <Pencil size={14} className="text-[#94b0ab]" />
                              Modifica
                            </DropdownMenuItem>

                            <DropdownMenuSeparator className="my-1" />

                            {/* Toggle stato */}
                            <DropdownMenuItem
                              onClick={() => handleToggleStato(v)}
                              disabled={isToggling}
                              className={cn(
                                'flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer text-sm font-medium',
                                isPublished
                                  ? 'text-amber-600 hover:bg-amber-50'
                                  : 'text-emerald-600 hover:bg-emerald-50',
                              )}
                            >
                              {isPublished
                                ? <ToggleLeft size={14} />
                                : <ToggleRight size={14} />}
                              {isToggling
                                ? 'Aggiornamento...'
                                : isPublished ? 'Metti in Bozza' : 'Segna Completata'}
                            </DropdownMenuItem>

                          </DropdownMenuContent>
                        </DropdownMenu>

                      </div>
                    </td>

                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Wizard */}
      <ValuationWizard
        open={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onSaved={() => { setIsWizardOpen(false); fetchValutazioni(); }}
      />

      {/* ── Edit Modal ──────────────────────────────────────────────────────── */}
      <Dialog open={!!editTarget} onOpenChange={open => { if (!open) setEditTarget(null); }}>
        <DialogContent className="max-w-lg rounded-[2rem] border-none shadow-2xl p-0 overflow-hidden" aria-describedby={undefined}>
          <DialogHeader className="px-8 pt-8 pb-4 border-b border-slate-100">
            <DialogTitle className="text-xl font-bold text-gray-900">Modifica Valutazione</DialogTitle>
            {editTarget && (
              <p className="text-sm text-gray-400 mt-0.5 truncate">{editTarget.indirizzo}</p>
            )}
          </DialogHeader>

          <div className="px-8 py-6 space-y-5">
            {/* Price range */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">
                  Stima minima €
                </Label>
                <Input
                  type="number"
                  min={0}
                  value={editStimaMin}
                  onChange={e => setEditStimaMin(e.target.value)}
                  onKeyDown={e => ['-', 'e', 'E'].includes(e.key) && e.preventDefault()}
                  placeholder="es. 200000"
                  className="h-12 rounded-xl border-slate-100"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">
                  Stima massima €
                </Label>
                <Input
                  type="number"
                  min={0}
                  value={editStimaMax}
                  onChange={e => setEditStimaMax(e.target.value)}
                  onKeyDown={e => ['-', 'e', 'E'].includes(e.key) && e.preventDefault()}
                  placeholder="es. 250000"
                  className="h-12 rounded-xl border-slate-100"
                />
              </div>
            </div>

            {/* AI text */}
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">
                Analisi del mercato (testo AI)
              </Label>
              <Textarea
                value={editMotivazione}
                onChange={e => setEditMotivazione(e.target.value)}
                placeholder="Inserisci o modifica il testo dell'analisi..."
                className="rounded-xl border-slate-100 min-h-[180px] resize-none text-sm leading-relaxed"
              />
              <p className="text-[11px] text-gray-400">
                Il testo verrà salvato e mostrato nel report pubblico.
              </p>
            </div>
          </div>

          <DialogFooter className="px-8 py-5 border-t border-slate-100 bg-slate-50/50 flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => setEditTarget(null)}
              disabled={isSavingEdit}
              className="rounded-xl h-11 border-gray-200"
            >
              Annulla
            </Button>
            <div className="flex-1" />
            <Button
              onClick={handleSaveEdit}
              disabled={isSavingEdit}
              className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl h-11 px-8 font-bold"
            >
              {isSavingEdit ? 'Salvataggio...' : 'Salva modifiche'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </AdminLayout>
  );
};

export default Valutazioni;
