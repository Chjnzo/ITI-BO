"use client";

import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Search, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { buildLeadSearchClauses } from '@/utils/search';

export type ContattoTipo = 'proprietari' | 'acquirenti' | 'collaboratori';

interface SearchResult {
  id: string;
  nome: string;
  cognome: string | null;
  email: string | null;
  telefono: string | null;
  tipo: ContattoTipo;
}

interface Props {
  onSelect: (tipo: ContattoTipo, id: string) => void;
}

const TIPO_LABEL: Record<ContattoTipo, string> = {
  proprietari: 'Proprietario',
  acquirenti: 'Acquirente',
  collaboratori: 'Collaboratore',
};

const TIPO_COLOR: Record<ContattoTipo, string> = {
  proprietari: 'bg-red-50 text-red-700 border-red-200',
  acquirenti: 'bg-blue-50 text-blue-700 border-blue-200',
  collaboratori: 'bg-amber-50 text-amber-700 border-amber-200',
};

// Ricerca unificata su proprietari + acquirenti + collaboratori. Query
// parallele con buildLeadSearchClauses (ILIKE su nome/cognome/telefono,
// gestisce il match "digit sequence" per i telefoni formattati diversamente).
// Click sul risultato → switch tab + apertura scheda via prop opzionale.
const ContattiGlobalSearch = ({ onSelect }: Props) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const clauses = buildLeadSearchClauses(trimmed);
      const runQuery = async (table: ContattoTipo) => {
        let q = supabase
          .from(table)
          .select('id, nome, cognome, email, telefono')
          .eq('is_deleted', false)
          .limit(8);
        for (const clause of clauses) q = q.or(clause);
        const { data, error } = await q;
        if (error || !data) return [] as SearchResult[];
        return data.map((r) => ({ ...r, tipo: table } as SearchResult));
      };

      const [prop, acq, coll] = await Promise.all([
        runQuery('proprietari'),
        runQuery('acquirenti'),
        runQuery('collaboratori'),
      ]);
      if (controller.signal.aborted) return;
      setResults([...prop, ...acq, ...coll]);
      setLoading(false);
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  // Chiude il dropdown quando si clicca fuori.
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const grouped: Record<ContattoTipo, SearchResult[]> = {
    proprietari: results.filter((r) => r.tipo === 'proprietari'),
    acquirenti: results.filter((r) => r.tipo === 'acquirenti'),
    collaboratori: results.filter((r) => r.tipo === 'collaboratori'),
  };

  const hasResults = results.length > 0;

  return (
    <div ref={wrapperRef} className="relative w-full max-w-xl">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => query && setOpen(true)}
          placeholder="Cerca in tutti i contatti (nome, cognome, telefono, email)..."
          className="pl-9 pr-9 h-10 rounded-xl border-gray-200"
        />
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(''); setResults([]); setOpen(false); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-gray-100 text-gray-400"
            aria-label="Cancella ricerca"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {open && query.trim() && (
        <div className="absolute z-40 mt-2 w-full bg-white rounded-2xl border border-gray-100 shadow-xl max-h-[26rem] overflow-y-auto">
          {loading && (
            <div className="p-4 text-sm text-gray-400 italic">Ricerca...</div>
          )}
          {!loading && !hasResults && (
            <div className="p-4 text-sm text-gray-400 italic">Nessun contatto trovato.</div>
          )}
          {!loading && hasResults && (
            <div className="py-2">
              {(['proprietari', 'acquirenti', 'collaboratori'] as ContattoTipo[]).map((tipo) => {
                const rows = grouped[tipo];
                if (rows.length === 0) return null;
                return (
                  <div key={tipo} className="py-1">
                    <div className="px-4 py-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                      {TIPO_LABEL[tipo]} ({rows.length})
                    </div>
                    {rows.map((r) => (
                      <button
                        key={`${tipo}-${r.id}`}
                        type="button"
                        onClick={() => { onSelect(r.tipo, r.id); setOpen(false); setQuery(''); }}
                        className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-3"
                      >
                        <span className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-md border ${TIPO_COLOR[r.tipo]}`}>
                          {TIPO_LABEL[r.tipo].slice(0, 3)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-gray-800 truncate">
                            {r.nome} {r.cognome ?? ''}
                          </div>
                          <div className="text-xs text-gray-400 truncate">
                            {r.telefono ?? r.email ?? ''}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ContattiGlobalSearch;
