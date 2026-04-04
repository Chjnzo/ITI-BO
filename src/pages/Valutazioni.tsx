import { useState, useEffect, useCallback } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { showError } from '@/utils/toast';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { Plus, Calculator, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import ValuationWizard from '@/components/valutazioni/ValuationWizard';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Valutazione {
  id: string;
  indirizzo: string;
  superficie_mq: number;
  stato: string;
  created_at: string;
  stima_min: number | null;
  stima_max: number | null;
  slug: string | null;
  leads?: { nome: string; cognome: string } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATO_BADGE: Record<string, string> = {
  Bozza:      'bg-gray-100 text-gray-600',
  Completata: 'bg-emerald-50 text-emerald-700',
};

const fmtEuro = (n: number | null) =>
  n == null ? null : `€${(n / 1000).toFixed(0)}k`;

// ── Page ──────────────────────────────────────────────────────────────────────

const Valutazioni = () => {
  const [valutazioni, setValutazioni] = useState<Valutazione[]>([]);
  const [loading, setLoading] = useState(true);
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  const fetchValutazioni = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('valutazioni')
      .select('id, indirizzo, superficie_mq, stato, created_at, stima_min, stima_max, slug, leads(nome, cognome)')
      .order('created_at', { ascending: false });
    if (error) {
      showError('Errore nel caricamento valutazioni');
    } else {
      setValutazioni((data as any) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchValutazioni(); }, [fetchValutazioni]);

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
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col style={{ width: '22%' }} />
              <col style={{ width: '26%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '3%' }} />
            </colgroup>
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-widest text-gray-400">Lead</th>
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-widest text-gray-400">Indirizzo</th>
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-widest text-gray-400">MQ</th>
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-widest text-gray-400">Stima</th>
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-widest text-gray-400">Stato</th>
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-widest text-gray-400">Data</th>
                <th className="px-2 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {valutazioni.map(v => {
                const minStr = fmtEuro(v.stima_min);
                const maxStr = fmtEuro(v.stima_max);
                return (
                  <tr key={v.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-5 py-4 font-medium text-gray-800 truncate">
                      {v.leads
                        ? `${v.leads.nome} ${v.leads.cognome}`
                        : <span className="text-gray-300 italic">—</span>}
                    </td>
                    <td className="px-5 py-4 text-gray-600 truncate">{v.indirizzo}</td>
                    <td className="px-5 py-4 text-gray-600">{v.superficie_mq} m²</td>
                    <td className="px-5 py-4">
                      {minStr && maxStr
                        ? <span className="font-bold text-[#94b0ab]">{minStr} – {maxStr}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-5 py-4">
                      <span className={cn(
                        'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold',
                        STATO_BADGE[v.stato] ?? 'bg-gray-100 text-gray-600',
                      )}>
                        {v.stato}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-gray-400 text-xs">
                      {format(parseISO(v.created_at), 'd MMM', { locale: it })}
                    </td>
                    <td className="px-2 py-4">
                      {v.slug && (
                        <a
                          href={`/report/${v.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg flex items-center justify-center text-gray-400 hover:text-[#94b0ab] hover:bg-[#94b0ab]/10 transition-colors"
                          title="Apri report"
                        >
                          <ExternalLink size={14} />
                        </a>
                      )}
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

    </AdminLayout>
  );
};

export default Valutazioni;
