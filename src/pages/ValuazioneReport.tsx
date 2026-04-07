import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { showError } from '@/utils/toast';
import { Button } from '@/components/ui/button';
import { FileDown, Home, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ValutazioneDetail {
  id: string;
  indirizzo: string;
  citta: string;
  tipologia: string | null;
  superficie_mq: number;
  piano: number | null;
  num_locali: number | null;
  num_bagni: number | null;
  anno_costruzione: number | null;
  stato_conservativo: string | null;
  classe_energetica: string | null;
  ha_box: boolean;
  ha_posto_auto: boolean;
  ha_cantina: boolean;
  ha_giardino: boolean;
  ascensore: boolean;
  note_tecniche: string | null;
  stima_min: number | null;
  stima_max: number | null;
  motivazione_ai: string | null;
  trend_mercato_locale: string | null;
  stato: string;
  created_at: string;
  leads?: { nome: string; cognome: string } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtEuro = (n: number | null): string =>
  n == null ? '—' : new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

const COMFORT_LABELS: { key: keyof ValutazioneDetail; label: string }[] = [
  { key: 'ha_box',        label: 'Box auto' },
  { key: 'ha_posto_auto', label: 'Posto auto' },
  { key: 'ha_cantina',    label: 'Cantina' },
  { key: 'ha_giardino',   label: 'Giardino' },
  { key: 'ascensore',     label: 'Ascensore' },
];

// ── Page ──────────────────────────────────────────────────────────────────────

const ValuazioneReport = () => {
  const { slug } = useParams<{ slug: string }>();
  const [val, setVal] = useState<ValutazioneDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    if (!slug) { setNotFound(true); setLoading(false); return; }
    supabase
      .from('valutazioni')
      .select('*, leads(nome, cognome)')
      .eq('slug', slug)
      .single()
      .then(({ data, error }) => {
        if (error || !data) setNotFound(true);
        else setVal(data as ValutazioneDetail);
        setLoading(false);
      });
  }, [slug]);

  const handleDownloadPdf = async () => {
    setIsDownloading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-pdf', {
        body: { slug },
      });
      if (error || !data?.pdf_base64) {
        showError('Errore nella generazione del PDF');
        return;
      }
      const blob = new Blob(
        [Uint8Array.from(atob(data.pdf_base64), c => c.charCodeAt(0))],
        { type: 'application/pdf' },
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `valutazione-${slug}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showError('Errore nella generazione del PDF');
    } finally {
      setIsDownloading(false);
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-gray-300 animate-pulse text-sm">Caricamento...</div>
      </div>
    );
  }

  if (notFound || !val) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3 text-gray-400">
        <Home size={40} strokeWidth={1.5} />
        <p className="text-lg font-semibold">Valutazione non trovata</p>
        <p className="text-sm">Il link potrebbe essere scaduto o non corretto.</p>
      </div>
    );
  }

  const activeComfort = COMFORT_LABELS.filter(c => val[c.key] === true);

  const trendData: { anno: number; prezzo_mq: number }[] = (() => {
    try { return val.trend_mercato_locale ? JSON.parse(val.trend_mercato_locale) : []; }
    catch { return []; }
  })();

  const prezzoPmq = val.stima_min && val.superficie_mq
    ? Math.round(((val.stima_min + (val.stima_max ?? val.stima_min)) / 2) / val.superficie_mq)
    : null;

  // ── Report ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-[#94b0ab] flex items-center justify-center">
            <Home size={14} className="text-white" />
          </div>
          <span className="font-bold text-gray-900 text-sm">Il Tuo Immobiliare</span>
        </div>
        <span className={cn(
          'text-xs font-semibold px-2.5 py-1 rounded-full',
          val.stato === 'Completata' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500',
        )}>
          {val.stato}
        </span>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">

        {/* Hero card */}
        <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-8">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Valutazione Immobiliare</p>
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 leading-tight">
            {val.indirizzo}
          </h1>
          <p className="text-gray-400 mt-1 text-sm">{val.citta}</p>

          {/* Key metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
            {[
              { label: 'Superficie', value: `${val.superficie_mq} m²` },
              { label: 'Tipologia', value: val.tipologia ?? '—' },
              { label: 'Locali', value: val.num_locali ? `${val.num_locali} locali` : '—' },
              { label: 'Condizioni', value: val.stato_conservativo ?? '—' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-slate-50 rounded-2xl p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">{label}</p>
                <p className="text-sm font-semibold text-gray-800">{value}</p>
              </div>
            ))}
          </div>

          {/* Price range */}
          {(val.stima_min || val.stima_max) && (
            <div className="mt-6 pt-6 border-t border-gray-100">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Stima di Valore</p>
              <p className="text-4xl font-black text-[#94b0ab] tracking-tight">
                {fmtEuro(val.stima_min)}
                {val.stima_min && val.stima_max && (
                  <span className="text-2xl text-gray-300 mx-3">–</span>
                )}
                {fmtEuro(val.stima_max)}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Generato il {format(parseISO(val.created_at), "d MMMM yyyy", { locale: it })}
                {val.leads && ` · per ${val.leads.nome} ${val.leads.cognome}`}
              </p>
            </div>
          )}
        </div>

        {/* AI Analysis */}
        {val.motivazione_ai && (
          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-8">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xl">✨</span>
              <h2 className="text-lg font-bold text-gray-900">Analisi AI</h2>
              <span className="ml-auto text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full bg-[#94b0ab]/10 text-[#94b0ab]">
                AI Generated
              </span>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
              {val.motivazione_ai}
            </p>
          </div>
        )}

        {/* Market Trend Chart */}
        {trendData.length > 0 && (
          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-900">Andamento Prezzi</h2>
              {prezzoPmq && (
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-widest text-gray-400">Prezzo/m² stimato</p>
                  <p className="text-xl font-black text-[#94b0ab]">€{prezzoPmq.toLocaleString('it-IT')}</p>
                </div>
              )}
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trendData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="anno" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }}
                       tickFormatter={(v: number) => `€${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(v: number) => [`€${v.toLocaleString('it-IT')}/m²`, 'Prezzo/m²']}
                  labelFormatter={(l: string) => `Anno ${l}`}
                />
                <Line
                  type="monotone"
                  dataKey="prezzo_mq"
                  stroke="#94b0ab"
                  strokeWidth={2.5}
                  dot={{ fill: '#94b0ab', r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Comfort */}
        {activeComfort.length > 0 && (
          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-8">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Dotazioni</h2>
            <div className="flex flex-wrap gap-2">
              {activeComfort.map(c => (
                <span
                  key={c.key}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#94b0ab]/10 text-[#94b0ab] text-sm font-semibold"
                >
                  <CheckCircle2 size={13} />
                  {c.label}
                </span>
              ))}
            </div>
            {val.note_tecniche && (
              <p className="text-sm text-gray-500 mt-4 leading-relaxed">{val.note_tecniche}</p>
            )}
          </div>
        )}

        {/* Footer / PDF */}
        <div className="flex items-center justify-between pt-2 pb-8">
          <p className="text-xs text-gray-300">
            Documento generato da Il Tuo Immobiliare · {format(parseISO(val.created_at), 'd MMM yyyy', { locale: it })}
          </p>
          <Button
            onClick={handleDownloadPdf}
            disabled={isDownloading}
            className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl h-10 px-5 font-semibold text-sm gap-2"
          >
            <FileDown size={15} />
            {isDownloading ? 'Generazione...' : 'Scarica PDF'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ValuazioneReport;
