"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { showError, showSuccess } from '@/utils/toast';
import { cn } from '@/lib/utils';
import { Home, Search, Star, X, Loader2 } from 'lucide-react';

interface Immobile {
  id: string;
  titolo: string;
  citta: string;
  indirizzo: string;
  prezzo: number | null;
  copertina_url: string | null;
  in_evidenza: boolean;
  stato: string;
}

const MAX_EVIDENZA = 3;

const formatPrice = (p: number | null) =>
  p ? new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(p) : 'Su richiesta';

interface EvidenzaModalProps {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}

const EvidenzaModal = ({ open, onClose, onChanged }: EvidenzaModalProps) => {
  const [featured, setFeatured] = useState<Immobile[]>([]);
  const [results, setResults] = useState<Immobile[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchFeatured = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('immobili')
      .select('id, titolo, citta, indirizzo, prezzo, copertina_url, in_evidenza, stato')
      .eq('in_evidenza', true)
      .eq('is_deleted', false)
      .order('titolo');
    if (error) showError('Errore caricamento');
    else setFeatured((data as Immobile[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) { fetchFeatured(); setSearch(''); setResults([]); }
  }, [open, fetchFeatured]);

  const doSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) { setResults([]); return; }
    const escaped = trimmed.replace(/[%_\\]/g, '\\$&');
    const { data } = await supabase
      .from('immobili')
      .select('id, titolo, citta, indirizzo, prezzo, copertina_url, in_evidenza, stato')
      .eq('is_deleted', false)
      .neq('stato', 'Venduto')
      .eq('in_evidenza', false)
      .or(`titolo.ilike.%${escaped}%,citta.ilike.%${escaped}%,indirizzo.ilike.%${escaped}%`)
      .order('titolo')
      .limit(8);
    setResults((data as Immobile[]) ?? []);
  }, []);

  const handleSearch = (v: string) => {
    setSearch(v);
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => doSearch(v), 280);
  };

  const toggle = async (prop: Immobile, targetValue: boolean) => {
    if (targetValue && featured.length >= MAX_EVIDENZA) {
      showError(`Massimo ${MAX_EVIDENZA} immobili in evidenza. Rimuovine uno prima.`);
      return;
    }
    setToggling(prev => new Set(prev).add(prop.id));
    const { error } = await supabase.from('immobili').update({ in_evidenza: targetValue }).eq('id', prop.id);
    if (error) {
      showError('Errore aggiornamento');
    } else {
      showSuccess(targetValue ? `"${prop.titolo}" aggiunto in evidenza` : `"${prop.titolo}" rimosso dall'evidenza`);
      await fetchFeatured();
      // Refresh search results if active
      if (search.trim()) doSearch(search);
      onChanged();
    }
    setToggling(prev => { const s = new Set(prev); s.delete(prop.id); return s; });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl w-full border-none shadow-2xl p-0 overflow-hidden">
        <DialogHeader className="px-7 pt-7 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl font-bold text-gray-900">Immobili in Evidenza</DialogTitle>
              <p className="text-sm text-gray-400 mt-0.5 font-medium">Visibili in homepage sul sito</p>
            </div>
            <span className={cn(
              "text-sm font-black px-3 py-1 rounded-full",
              featured.length >= MAX_EVIDENZA
                ? "bg-amber-50 text-amber-600 border border-amber-200"
                : "bg-teal-50 text-[#94b0ab] border border-teal-100"
            )}>
              {featured.length}/{MAX_EVIDENZA}
            </span>
          </div>
        </DialogHeader>

        <div className="px-7 py-5 space-y-6 max-h-[70vh] overflow-y-auto">

          {/* Featured now */}
          <div className="space-y-2.5">
            <p className="text-[0.65rem] font-black uppercase tracking-widest text-gray-400">In evidenza ora</p>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={20} className="animate-spin text-gray-300" />
              </div>
            ) : featured.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm font-medium italic">
                Nessun immobile in evidenza
              </div>
            ) : (
              <div className="space-y-2">
                {featured.map(prop => (
                  <FeaturedCard
                    key={prop.id}
                    prop={prop}
                    toggling={toggling.has(prop.id)}
                    onRemove={() => toggle(prop, false)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Add from search */}
          <div className="space-y-2.5">
            <p className="text-[0.65rem] font-black uppercase tracking-widest text-gray-400">Aggiungi</p>
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Cerca per titolo, zona o indirizzo..."
                className="h-11 pl-9 rounded-xl border-gray-200 bg-slate-50/50"
                disabled={featured.length >= MAX_EVIDENZA}
              />
            </div>
            {featured.length >= MAX_EVIDENZA && (
              <p className="text-xs text-amber-600 font-medium">
                Hai raggiunto il limite di {MAX_EVIDENZA}. Rimuovi un immobile per aggiungerne un altro.
              </p>
            )}
            {results.length > 0 && (
              <div className="space-y-1.5 mt-1">
                {results.map(prop => (
                  <SearchResultRow
                    key={prop.id}
                    prop={prop}
                    toggling={toggling.has(prop.id)}
                    disabled={featured.length >= MAX_EVIDENZA}
                    onAdd={() => toggle(prop, true)}
                  />
                ))}
              </div>
            )}
            {search.trim() && results.length === 0 && !loading && (
              <p className="text-sm text-gray-400 italic text-center py-3">Nessun risultato</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────

const FeaturedCard = ({ prop, toggling, onRemove }: { prop: Immobile; toggling: boolean; onRemove: () => void }) => (
  <div className="flex items-center gap-3 bg-amber-50/60 border border-amber-100 rounded-2xl px-4 py-3 group">
    <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 border border-amber-100 flex-shrink-0">
      {prop.copertina_url
        ? <img src={prop.copertina_url} alt="" className="w-full h-full object-cover" />
        : <div className="w-full h-full flex items-center justify-center text-gray-300"><Home size={18} /></div>
      }
    </div>
    <Star size={14} className="fill-[#facc15] text-[#facc15] shrink-0" />
    <div className="flex-1 min-w-0">
      <p className="font-bold text-gray-900 text-sm truncate">{prop.titolo}</p>
      <p className="text-xs text-gray-400 truncate">{prop.citta} · {formatPrice(prop.prezzo)}</p>
    </div>
    <button
      onClick={onRemove}
      disabled={toggling}
      className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
    >
      {toggling ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
    </button>
  </div>
);

const SearchResultRow = ({ prop, toggling, disabled, onAdd }: { prop: Immobile; toggling: boolean; disabled: boolean; onAdd: () => void }) => (
  <div className="flex items-center gap-3 bg-white border border-gray-100 rounded-2xl px-4 py-3 hover:border-teal-200 transition-colors">
    <div className="w-10 h-10 rounded-xl overflow-hidden bg-gray-100 border border-gray-100 flex-shrink-0">
      {prop.copertina_url
        ? <img src={prop.copertina_url} alt="" className="w-full h-full object-cover" />
        : <div className="w-full h-full flex items-center justify-center text-gray-300"><Home size={14} /></div>
      }
    </div>
    <div className="flex-1 min-w-0">
      <p className="font-bold text-gray-800 text-sm truncate">{prop.titolo}</p>
      <p className="text-xs text-gray-400 truncate">{prop.citta} · {formatPrice(prop.prezzo)}</p>
    </div>
    <button
      onClick={onAdd}
      disabled={toggling || disabled}
      className="shrink-0 flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-[#94b0ab]/10 text-[#94b0ab] hover:bg-[#94b0ab]/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {toggling ? <Loader2 size={12} className="animate-spin" /> : <Star size={12} />}
      Aggiungi
    </button>
  </div>
);

export default EvidenzaModal;
