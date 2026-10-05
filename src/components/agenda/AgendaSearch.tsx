"use client";

import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Search, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { buildLeadSearchClauses } from '@/utils/search';
import { APPOINTMENT_CONTACT_SELECT, getAppointmentContactName, type Appointment } from '@/components/agenda/EventFormModal';

interface Props {
  onSelect: (appointment: Appointment) => void;
}

type ContattoTipo = 'proprietari' | 'acquirenti' | 'collaboratori';

// Ricerca appuntamenti per telefono/nome proprietario-acquirente o nome
// immobile (spec cliente 2026-10-05). Risolve prima gli id di contatti/
// immobili che matchano la query (stesso pattern di ContattiGlobalSearch),
// poi interroga `appuntamenti` filtrando su quegli id — su tutte le date,
// non solo la settimana visualizzata. I lead legacy (tabella `leads`, pre-
// pivot) non sono coperti: non hanno colonna `cellulare` e sono ormai
// residuali dopo il pivot proprietari/acquirenti/collaboratori del 2026-09-28.
const AgendaSearch = ({ onSelect }: Props) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Appointment[]>([]);
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

      const runContattoQuery = async (table: ContattoTipo): Promise<string[]> => {
        const clauses = buildLeadSearchClauses(trimmed);
        let q = supabase.from(table).select('id').eq('is_deleted', false).limit(10);
        for (const clause of clauses) q = q.or(clause);
        const { data, error } = await q;
        if (error || !data) return [];
        return data.map((r) => (r as { id: string }).id);
      };

      const runImmobiliQuery = async (): Promise<string[]> => {
        const { data, error } = await supabase
          .from('immobili')
          .select('id')
          .ilike('titolo', `%${trimmed}%`)
          .limit(10);
        if (error || !data) return [];
        return data.map((r) => (r as { id: string }).id);
      };

      const [propIds, acqIds, collIds, immobileIds] = await Promise.all([
        runContattoQuery('proprietari'),
        runContattoQuery('acquirenti'),
        runContattoQuery('collaboratori'),
        runImmobiliQuery(),
      ]);
      if (controller.signal.aborted) return;

      const contattoIds = [...propIds, ...acqIds, ...collIds];
      const orParts: string[] = [];
      if (contattoIds.length > 0) orParts.push(`contatto_id.in.(${contattoIds.join(',')})`);
      if (immobileIds.length > 0) orParts.push(`immobile_id.in.(${immobileIds.join(',')})`);

      if (orParts.length === 0) {
        setResults([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('appuntamenti')
        .select(`*, ${APPOINTMENT_CONTACT_SELECT}, immobili(titolo)`)
        .or(orParts.join(','))
        .order('data', { ascending: false })
        .limit(15);
      if (controller.signal.aborted) return;
      setResults(error || !data ? [] : (data as Appointment[]));
      setLoading(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const hasResults = results.length > 0;

  return (
    <div ref={wrapperRef} className="relative w-full max-w-xs">
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => query && setOpen(true)}
          placeholder="Cerca per telefono, nome o immobile..."
          className="pl-9 pr-9 h-11 rounded-xl border-gray-200"
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
        <div className="absolute z-40 mt-2 w-full min-w-[22rem] bg-white rounded-2xl border border-gray-100 shadow-xl max-h-[26rem] overflow-y-auto">
          {loading && (
            <div className="p-4 text-sm text-gray-400 italic">Ricerca...</div>
          )}
          {!loading && !hasResults && (
            <div className="p-4 text-sm text-gray-400 italic">Nessun appuntamento trovato.</div>
          )}
          {!loading && hasResults && (
            <div className="py-2">
              {results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => { onSelect(r); setOpen(false); setQuery(''); }}
                  className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-gray-800 truncate">
                      {getAppointmentContactName(r) ?? r.immobili?.titolo ?? 'Appuntamento'}
                    </div>
                    <div className="text-xs text-gray-400 truncate">
                      {r.tipologia} · {format(parseISO(r.data), 'd MMM yyyy', { locale: it })}
                      {r.ora_inizio && ` · ${r.ora_inizio.slice(0, 5)}`}
                      {r.immobili?.titolo && getAppointmentContactName(r) && ` · ${r.immobili.titolo}`}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AgendaSearch;
