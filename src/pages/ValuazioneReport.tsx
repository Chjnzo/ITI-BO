import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { showError } from '@/utils/toast';
import { Button } from '@/components/ui/button';
import {
  FileDown, Home, ShieldCheck, TrendingUp,
  MapPin, Ruler, Building2, Wrench, ArrowUpRight, ArrowDownRight,
  Printer, Star, ChevronDown, Lock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

// ── Types ─────────────────────────────────────────────────────────────────────

interface StimaFattore {
  nome: string;
  delta_percentuale: number;
  nota?: string;
}

interface StimaBreakdown {
  prezzo_mq_base: number;
  fattori: StimaFattore[];
  prezzo_mq_finale: number;
  stima_calcolata: number;
}

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
  stima_breakdown: StimaBreakdown | null;
  motivazione_ai: string | null;
  trend_mercato_locale: Array<{ anno: number; prezzo_mq: number }> | string | null;
  stato: string;
  created_at: string;
  leads?: { nome: string; cognome: string } | null;
  zone_omi?: ZonaOmiRow | null;
}

interface ZonaOmiRow {
  codice_zona: string;
  fascia: string;
  zona: string;
  prezzo_mq_min: number;
  prezzo_mq_max: number;
  prezzo_mq_medio: number;
}

interface ComparabileFetched {
  distanza_metri: number;
  transazioni_chiuse: {
    indirizzo: string;
    prezzo_mq: number;
    prezzo_finale: number;
    mq: number;
    num_locali: number | null;
    data_chiusura: string;
  } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtEuro = (n: number | null): string =>
  n == null
    ? '—'
    : new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

const parseTrend = (raw: unknown): { anno: number; prezzo_mq: number }[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw as string); } catch { return []; }
};

const parseBreakdown = (raw: unknown): StimaBreakdown | null => {
  if (!raw) return null;
  if (typeof raw === 'object') return raw as StimaBreakdown;
  try { return JSON.parse(raw as string); } catch { return null; }
};

const parseAiParagraphs = (text: string): string[] => {
  // Try double-newline split first (matches our AI prompt output format)
  const byDouble = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  if (byDouble.length >= 2) return byDouble;
  return text.split('\n').map(p => p.trim()).filter(Boolean);
};

const AI_PARA_LABELS = ['Contesto di Mercato', 'Analisi Tecnica', 'Conclusione Strategica'];

const COMFORT_LABELS: { key: keyof ValutazioneDetail; label: string; icon: string }[] = [
  { key: 'ha_box',        label: 'Box auto',    icon: '🚗' },
  { key: 'ha_posto_auto', label: 'Posto auto',  icon: '🅿️' },
  { key: 'ha_cantina',    label: 'Cantina',     icon: '📦' },
  { key: 'ha_giardino',   label: 'Giardino',    icon: '🌿' },
  { key: 'ascensore',     label: 'Ascensore',   icon: '🛗' },
];

// ── Custom Chart Tooltip ───────────────────────────────────────────────────────

const ChartTooltip = ({ active, payload, label }: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-lg px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">Anno {label}</p>
      <p className="text-base font-black text-[#94b0ab]">
        €{payload[0].value.toLocaleString('it-IT')}<span className="text-xs font-semibold text-gray-400">/m²</span>
      </p>
    </div>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────

const ValuazioneReport = () => {
  const { slug } = useParams<{ slug: string }>();
  const [val, setVal] = useState<ValutazioneDetail | null>(null);
  const [comparabili, setComparabili] = useState<ComparabileFetched[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);

  useEffect(() => {
    if (!slug) { setNotFound(true); setLoading(false); return; }

    // Check if there is an active session (admin view)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAdmin(!!session?.user);
    });

    supabase
      .from('valutazioni')
      .select('*, leads(nome, cognome), zone_omi(codice_zona, fascia, zona, prezzo_mq_min, prezzo_mq_max, prezzo_mq_medio)')
      .eq('slug', slug)
      .single()
      .then(async ({ data, error }) => {
        if (error || !data) { setNotFound(true); setLoading(false); return; }
        setVal(data as ValutazioneDetail);

        const { data: compData } = await supabase
          .from('valutazione_comparabili')
          .select('distanza_metri, transazioni_chiuse(indirizzo, prezzo_mq, prezzo_finale, mq, num_locali, data_chiusura)')
          .eq('valutazione_id', data.id)
          .order('distanza_metri');

        setComparabili((compData ?? []) as ComparabileFetched[]);
        setLoading(false);
      });
  }, [slug]);

  const handleDownloadPdf = async () => {
    setIsDownloading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-pdf', { body: { slug } });
      if (error || !data?.pdf_base64) { showError('Errore nella generazione del PDF'); return; }
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

  // ── States ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f5f0] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#94b0ab]/20 animate-pulse" />
          <p className="text-sm text-gray-300 animate-pulse">Caricamento report...</p>
        </div>
      </div>
    );
  }

  if (notFound || !val) {
    return (
      <div className="min-h-screen bg-[#f5f5f0] flex flex-col items-center justify-center gap-3 text-gray-400">
        <div className="w-16 h-16 rounded-[1.5rem] bg-gray-100 flex items-center justify-center mb-2">
          <Home size={28} strokeWidth={1.5} />
        </div>
        <p className="text-lg font-bold text-gray-700">Valutazione non trovata</p>
        <p className="text-sm">Il link potrebbe essere scaduto o non corretto.</p>
      </div>
    );
  }

  // Draft guard — non-admin visitors cannot see reports still in Bozza
  if (val.stato === 'Bozza' && !isAdmin) {
    return (
      <div className="min-h-screen bg-[#f5f5f0] flex flex-col items-center justify-center px-6 text-center">
        <div className="max-w-sm">
          <div className="w-16 h-16 rounded-[1.5rem] bg-[#94b0ab]/10 flex items-center justify-center mx-auto mb-5">
            <Lock size={26} className="text-[#94b0ab]" strokeWidth={1.5} />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#94b0ab] mb-2">
            Il Tuo Immobiliare
          </p>
          <h1 className="text-xl font-extrabold text-gray-800 mb-3 leading-snug">
            Report in revisione tecnica
          </h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            Questo report è attualmente in fase di revisione da parte del nostro team tecnico.
            Sarà disponibile a breve. Contatta il tuo agente di riferimento per maggiori informazioni.
          </p>
          <div className="mt-8 flex items-center justify-center gap-2 text-xs text-gray-300">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            In revisione
          </div>
        </div>
      </div>
    );
  }

  const activeComfort = COMFORT_LABELS.filter(c => val[c.key] === true);
  const trendData = parseTrend(val.trend_mercato_locale);
  const breakdown = parseBreakdown(val.stima_breakdown);
  const prezzoPmq = val.stima_min && val.superficie_mq
    ? Math.round(((val.stima_min + (val.stima_max ?? val.stima_min)) / 2) / val.superficie_mq)
    : null;
  const aiParagraphs = val.motivazione_ai ? parseAiParagraphs(val.motivazione_ai) : [];

  // ── Confidence score ────────────────────────────────────────────────────────
  const hasOmi = !!val.zone_omi;
  const hasComparabili = comparabili.length > 0;
  const confidenceScore = hasOmi && hasComparabili ? 95 : hasOmi ? 75 : hasComparabili ? 70 : 45;
  const confidenceLow = confidenceScore < 60;
  const confidenceStars = Math.round(confidenceScore / 20); // 1–5

  // ── Sanity-filter breakdown factors ─────────────────────────────────────────
  // Remove any factor that references a boolean feature absent from this property.
  const FEATURE_GUARDS: { key: keyof ValutazioneDetail; keywords: string[] }[] = [
    { key: 'ha_giardino',   keywords: ['giardino', 'area verde', 'garden'] },
    { key: 'ha_box',        keywords: ['box auto', 'box garage', 'autorimessa'] },
    { key: 'ha_posto_auto', keywords: ['posto auto', 'parcheggio scoperto'] },
    { key: 'ha_cantina',    keywords: ['cantina'] },
    { key: 'ascensore',     keywords: ['ascensore'] },
  ];
  const filteredFattori = (breakdown?.fattori ?? []).filter(f => {
    if (f.delta_percentuale === 0) return false;
    const haystack = (f.nome + ' ' + (f.nota ?? '')).toLowerCase();
    for (const { key, keywords } of FEATURE_GUARDS) {
      if (!val[key] && keywords.some(kw => haystack.includes(kw))) return false;
    }
    return true;
  });

  // ── Report ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#f5f5f0]" style={{ fontFamily: "'Inter', 'Geist', sans-serif" }}>

      {/* ── Sticky top bar ─────────────────────────────────────────────────── */}
      <div className="bg-white/95 backdrop-blur-sm border-b border-gray-100 px-5 py-3.5 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#94b0ab] flex items-center justify-center flex-shrink-0">
            <Home size={13} className="text-white" />
          </div>
          <div>
            <p className="font-bold text-gray-900 text-sm leading-tight">Il Tuo Immobiliare</p>
            <p className="text-[10px] text-gray-400 leading-tight">Ranica, Bergamo</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.print()}
            className="text-gray-500 hover:text-gray-800 rounded-xl h-9 px-3 gap-1.5 text-xs font-semibold hidden sm:flex"
          >
            <Printer size={13} />
            Stampa
          </Button>
          <Button
            onClick={handleDownloadPdf}
            disabled={isDownloading}
            size="sm"
            className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl h-9 px-4 font-semibold text-xs gap-1.5 shadow-sm shadow-[#94b0ab]/30"
          >
            <FileDown size={13} />
            {isDownloading ? 'Generazione...' : 'Scarica PDF'}
          </Button>
        </div>
      </div>

      <div className="max-w-[900px] mx-auto px-4 py-8 space-y-5 pb-16">

        {/* ── Hero Card ──────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-[2rem] shadow-sm overflow-hidden">

          {/* Gradient header band */}
          <div className="bg-gradient-to-br from-[#94b0ab] via-[#88a5a0] to-[#6e8c87] px-8 pt-8 pb-9">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div className="min-w-0">
                <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest mb-1.5">
                  Perizia di Valore · Il Tuo Immobiliare
                </p>
                <h1 className="text-white font-extrabold leading-snug" style={{ fontSize: 'clamp(1.2rem, 4vw, 1.6rem)' }}>
                  {val.indirizzo}
                </h1>
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <div className="flex items-center gap-1">
                    <MapPin size={11} className="text-white/60" />
                    <span className="text-white/70 text-sm">{val.citta}</span>
                  </div>
                  {val.tipologia && (
                    <>
                      <span className="text-white/30">·</span>
                      <span className="text-white/70 text-sm">{val.tipologia}</span>
                    </>
                  )}
                </div>
              </div>
              <span className={cn(
                'flex-shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full mt-1',
                val.stato === 'Completata'
                  ? 'bg-white/20 text-white'
                  : 'bg-white/10 text-white/60',
              )}>
                {val.stato}
              </span>
            </div>

            {/* Valuation range */}
            {(val.stima_min || val.stima_max) && (
              <div>
                <p className="text-white/55 text-[10px] font-bold uppercase tracking-widest mb-2">
                  Valore di Mercato Stimato
                </p>
                <div className="flex items-end gap-3 flex-wrap">
                  <p className="text-white font-black tracking-tight leading-none" style={{ fontSize: 'clamp(2rem, 7vw, 2.75rem)' }}>
                    {fmtEuro(val.stima_min)}
                    {val.stima_min && val.stima_max && (
                      <span className="text-white/35 mx-2.5 font-light">–</span>
                    )}
                    {fmtEuro(val.stima_max)}
                  </p>
                  {prezzoPmq && (
                    <p className="text-white/55 text-sm font-medium mb-0.5">
                      ~€{prezzoPmq.toLocaleString('it-IT')}/m² · {val.superficie_mq} m²
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Affidabilità badge */}
          <div className={cn(
            'px-8 py-4 flex items-center justify-between gap-3',
            confidenceLow ? 'border-b-0' : 'border-b border-gray-100',
          )}>
            <div className="flex items-center gap-2.5">
              <ShieldCheck size={16} className={cn('flex-shrink-0', confidenceLow ? 'text-amber-400' : 'text-[#94b0ab]')} />
              <p className="text-xs text-gray-500 leading-snug">
                <span className="font-semibold text-gray-700">Affidabilità stima</span>
                {' '}—{' '}
                {hasOmi && hasComparabili
                  ? 'basata su dati OMI ufficiali e transazioni reali certificate'
                  : hasOmi
                  ? 'basata su dati OMI ufficiali; nessun comparabile disponibile'
                  : hasComparabili
                  ? 'basata su transazioni reali; dati OMI non disponibili per questa zona'
                  : 'dati OMI e comparabili non disponibili per questa micro-zona'}
              </p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map(n => (
                  <Star
                    key={n}
                    size={12}
                    className={n <= confidenceStars
                      ? (confidenceLow ? 'fill-amber-400 text-amber-400' : 'fill-[#94b0ab] text-[#94b0ab]')
                      : 'fill-gray-200 text-gray-200'}
                  />
                ))}
              </div>
              <span className={cn(
                'text-[10px] font-bold tabular-nums',
                confidenceLow ? 'text-amber-500' : 'text-[#94b0ab]',
              )}>
                {confidenceScore}%
              </span>
            </div>
          </div>

          {/* Low-confidence warning banner */}
          {confidenceLow && (
            <div className="mx-8 mb-4 flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
              <span className="text-amber-500 text-base leading-none mt-0.5">⚠</span>
              <p className="text-xs text-amber-700 leading-relaxed">
                <span className="font-bold">Stima a bassa confidenza.</span>{' '}
                Dati OMI e transazioni comparabili non disponibili per questa micro-zona.
                Il valore indicato è basato su modelli statistici generali e potrebbe discostarsi dal mercato reale.
                Si consiglia un sopralluogo e una verifica manuale prima di utilizzare questa stima.
              </p>
            </div>
          )}

          {/* Property specs grid */}
          <div className="px-8 py-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { icon: <Ruler size={13} />,    label: 'Superficie',  value: `${val.superficie_mq} m²` },
              { icon: <Building2 size={13} />, label: 'Tipologia',   value: val.tipologia ?? '—' },
              { icon: <Home size={13} />,      label: 'Locali',      value: val.num_locali ? `${val.num_locali} locali` : '—' },
              { icon: <Wrench size={13} />,    label: 'Condizioni',  value: val.stato_conservativo ?? '—' },
              ...(val.piano != null ? [{ icon: <Building2 size={13} />, label: 'Piano', value: `Piano ${val.piano}` }] : []),
              ...(val.classe_energetica ? [{ icon: <TrendingUp size={13} />, label: 'Classe en.', value: val.classe_energetica }] : []),
            ].map(({ icon, label, value }) => (
              <div key={label} className="flex items-start gap-2.5 bg-[#f5f5f0] rounded-2xl p-3">
                <span className="text-[#94b0ab] mt-0.5 flex-shrink-0">{icon}</span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 leading-tight">{label}</p>
                  <p className="text-sm font-semibold text-gray-800 leading-snug mt-0.5">{value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Date + lead */}
          <div className="px-8 pb-5">
            <p className="text-xs text-gray-400">
              Generato il {format(parseISO(val.created_at), "d MMMM yyyy", { locale: it })}
              {val.leads && (
                <span className="font-semibold text-gray-600"> · per {val.leads.nome} {val.leads.cognome}</span>
              )}
            </p>
          </div>
        </div>

        {/* ── Valuation Breakdown ─────────────────────────────────────────────── */}
        {breakdown && filteredFattori !== undefined && (
          <div className="bg-white rounded-[2rem] shadow-sm overflow-hidden">

            {/* Section header */}
            <div className="px-8 pt-7 pb-5 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900 mb-0.5">Fattori di Correzione</h2>
              <p className="text-xs text-gray-400">Aggiustamenti metodologici applicati al prezzo/m² OMI di zona</p>
            </div>

            {/* Base price — anchor row */}
            <div className="flex items-center justify-between px-8 py-4 bg-[#f5f5f0]">
              <div className="flex items-center gap-2.5">
                <div className="w-2 h-2 rounded-full bg-gray-300 flex-shrink-0" />
                <span className="text-sm text-gray-500 font-medium">Prezzo/m² base OMI di zona</span>
              </div>
              <span className="text-sm font-bold text-gray-700 tabular-nums">
                €{breakdown.prezzo_mq_base.toLocaleString('it-IT')}/m²
              </span>
            </div>

            {/* Factors — sanity-filtered, only non-zero, bespoke items */}
            {filteredFattori.length > 0 ? (
              <div className="px-8 divide-y divide-gray-50">
                {filteredFattori.map((f, i) => {
                    const isPos = f.delta_percentuale > 0;
                    return (
                      <div key={i} className="flex items-start justify-between gap-4 py-4">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className={cn(
                            'flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5',
                            isPos ? 'bg-[#94b0ab]/12' : 'bg-rose-50',
                          )}>
                            {isPos
                              ? <ArrowUpRight size={13} className="text-[#94b0ab]" />
                              : <ArrowDownRight size={13} className="text-rose-500" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-800 leading-snug">{f.nome}</p>
                            {f.nota && (
                              <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{f.nota}</p>
                            )}
                          </div>
                        </div>
                        <span className={cn(
                          'flex-shrink-0 text-sm font-black tabular-nums',
                          isPos ? 'text-[#94b0ab]' : 'text-rose-500',
                        )}>
                          {isPos ? '+' : ''}{f.delta_percentuale}%
                        </span>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <p className="px-8 py-5 text-sm text-gray-400 italic">
                Nessun fattore correttivo rilevante per questo immobile.
              </p>
            )}

            {/* Notice if any factors were removed by sanity filter */}
            {isAdmin && breakdown.fattori && breakdown.fattori.length > filteredFattori.length && (
              <p className="px-8 pb-3 text-[11px] text-amber-500 italic">
                ⚠ {breakdown.fattori.length - filteredFattori.length} fattore/i rimosso/i dalla validazione (riferimento a caratteristiche non presenti nell'input).
              </p>
            )}

            {/* Final price — conclusion row */}
            <div className="mx-8 mb-7 mt-2 flex items-center justify-between bg-[#94b0ab]/10 rounded-2xl px-5 py-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#94b0ab] mb-0.5">
                  Prezzo/m² finale
                </p>
                <p className="text-xs text-gray-500">Valore corretto per questo specifico immobile</p>
              </div>
              <div className="text-right">
                <span className="text-2xl font-black text-[#94b0ab] tabular-nums">
                  €{breakdown.prezzo_mq_finale.toLocaleString('it-IT')}
                </span>
                <span className="text-sm font-semibold text-[#94b0ab]/70">/m²</span>
              </div>
            </div>
          </div>
        )}

        {/* ── AI Analysis ─────────────────────────────────────────────────────── */}
        {aiParagraphs.length > 0 && (
          <div className="bg-white rounded-[2rem] shadow-sm p-8">
            <div className="flex items-center gap-3 mb-7">
              <div className="w-9 h-9 rounded-xl bg-[#94b0ab]/10 flex items-center justify-center flex-shrink-0">
                <span className="text-lg">✦</span>
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900 leading-tight">Analisi del Mercato</h2>
                <p className="text-[10px] text-[#94b0ab] font-bold uppercase tracking-widest mt-0.5">
                  Direttore Tecnico · Il Tuo Immobiliare
                </p>
              </div>
            </div>

            <div className="space-y-6">
              {aiParagraphs.map((para, i) => (
                <div key={i} className={cn(
                  'relative pl-5',
                  'before:absolute before:left-0 before:top-1 before:bottom-1 before:w-[2px] before:rounded-full',
                  i === 0 && 'before:bg-[#94b0ab]',
                  i === 1 && 'before:bg-amber-400',
                  i === 2 && 'before:bg-slate-300',
                )}>
                  {i < AI_PARA_LABELS.length && (
                    <p className={cn(
                      'text-[10px] font-bold uppercase tracking-widest mb-1.5',
                      i === 0 && 'text-[#94b0ab]',
                      i === 1 && 'text-amber-500',
                      i === 2 && 'text-slate-400',
                    )}>
                      {AI_PARA_LABELS[i]}
                    </p>
                  )}
                  <p className="text-sm text-gray-600 leading-relaxed">{para}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Comparables Grid ────────────────────────────────────────────────── */}
        {comparabili.length > 0 && (
          <div className="bg-white rounded-[2rem] shadow-sm p-8">
            <h2 className="text-base font-bold text-gray-900 mb-1">
              Transazioni Comparabili
            </h2>
            <p className="text-xs text-gray-400 mb-6">
              {comparabili.length} rogiti certificati nel raggio di 1.5 km
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {comparabili.map((c, i) => {
                const t = c.transazioni_chiuse;
                if (!t) return null;
                return (
                  <div
                    key={i}
                    className="bg-[#f5f5f0] rounded-2xl p-4 flex flex-col gap-3"
                  >
                    {/* Price/sqm */}
                    <div>
                      <p className="text-2xl font-black text-[#94b0ab] leading-none tabular-nums">
                        €{t.prezzo_mq.toLocaleString('it-IT')}
                        <span className="text-sm font-semibold text-[#94b0ab]/70 ml-0.5">/m²</span>
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5 font-medium">
                        {fmtEuro(t.prezzo_finale)} totali
                      </p>
                    </div>

                    {/* Divider */}
                    <div className="h-px bg-gray-200" />

                    {/* Address */}
                    <p className="text-sm font-semibold text-gray-800 leading-snug line-clamp-2">
                      {t.indirizzo}
                    </p>

                    {/* Meta */}
                    <div className="flex flex-wrap gap-1.5 text-[11px] text-gray-500 font-medium">
                      <span className="bg-white rounded-lg px-2 py-0.5">{t.mq} m²</span>
                      {t.num_locali && (
                        <span className="bg-white rounded-lg px-2 py-0.5">{t.num_locali} loc.</span>
                      )}
                      <span className="bg-white rounded-lg px-2 py-0.5">
                        {Math.round(c.distanza_metri)} m
                      </span>
                      {t.data_chiusura && (
                        <span className="bg-white rounded-lg px-2 py-0.5">
                          {format(parseISO(t.data_chiusura), 'MMM yyyy', { locale: it })}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Market Trend Chart ──────────────────────────────────────────────── */}
        {trendData.length > 0 && (
          <div className="bg-white rounded-[2rem] shadow-sm p-8">
            <div className="flex items-start justify-between gap-3 mb-6">
              <div>
                <h2 className="text-base font-bold text-gray-900 leading-tight">Andamento Prezzi di Zona</h2>
                <p className="text-xs text-gray-400 mt-0.5">Prezzo/m² dal 2018 ad oggi — fonte OMI</p>
              </div>
              {prezzoPmq && (
                <div className="text-right flex-shrink-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Stima attuale</p>
                  <p className="text-2xl font-black text-[#94b0ab]">€{prezzoPmq.toLocaleString('it-IT')}</p>
                  <p className="text-[10px] text-gray-400">/m²</p>
                </div>
              )}
            </div>

            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendData} margin={{ top: 5, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="anno"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `€${(v / 1000).toFixed(0)}k`}
                  width={44}
                />
                <Tooltip content={<ChartTooltip />} />
                <Line
                  type="monotone"
                  dataKey="prezzo_mq"
                  stroke="#94b0ab"
                  strokeWidth={2.5}
                  dot={{ fill: '#94b0ab', r: 3.5, strokeWidth: 0 }}
                  activeDot={{ r: 5.5, fill: '#7a948f', strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── Dotazioni ───────────────────────────────────────────────────────── */}
        {activeComfort.length > 0 && (
          <div className="bg-white rounded-[2rem] shadow-sm p-8">
            <h2 className="text-base font-bold text-gray-900 mb-4">Dotazioni</h2>
            <div className="flex flex-wrap gap-2">
              {activeComfort.map(c => (
                <span
                  key={c.key}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-[#94b0ab]/8 border border-[#94b0ab]/20 text-[#94b0ab] text-sm font-semibold"
                >
                  <span>{c.icon}</span>
                  {c.label}
                </span>
              ))}
            </div>
            {val.note_tecniche && (
              <p className="text-sm text-gray-500 mt-4 leading-relaxed border-t border-gray-100 pt-4">
                {val.note_tecniche}
              </p>
            )}
          </div>
        )}

        {/* ── CTA Footer ──────────────────────────────────────────────────────── */}
        <div className="bg-gradient-to-br from-[#94b0ab] via-[#88a5a0] to-[#6e8c87] rounded-[2rem] p-8 text-center">
          <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-4">
            <FileDown size={20} className="text-white" />
          </div>
          <p className="text-white font-bold text-lg mb-1">Scarica il Report Completo</p>
          <p className="text-white/65 text-sm mb-6">
            PDF professionale con tutti i dati, pronto per essere condiviso o archiviato
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Button
              onClick={handleDownloadPdf}
              disabled={isDownloading}
              className="bg-white text-[#7a948f] hover:bg-white/90 rounded-xl h-12 px-8 font-bold text-sm gap-2 shadow-md"
            >
              <FileDown size={15} />
              {isDownloading ? 'Generazione PDF...' : 'Scarica PDF'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => window.print()}
              className="text-white/80 hover:text-white hover:bg-white/10 rounded-xl h-12 px-6 font-semibold text-sm gap-2"
            >
              <Printer size={15} />
              Stampa
            </Button>
          </div>
        </div>

        {/* ── Admin: Dati Tecnici di Origine ──────────────────────────────── */}
        {isAdmin && (
          <div className="border border-dashed border-gray-200 rounded-[2rem] overflow-hidden">
            <button
              type="button"
              onClick={() => setDebugOpen(o => !o)}
              className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50/50 transition-colors"
            >
              <div className="flex items-center gap-2 text-gray-500">
                <Lock size={13} />
                <span className="text-xs font-bold uppercase tracking-widest">Dati Tecnici di Origine</span>
                <span className="text-[10px] bg-gray-100 text-gray-400 rounded-full px-2 py-0.5 font-semibold">Admin</span>
              </div>
              <ChevronDown
                size={15}
                className={cn('text-gray-400 transition-transform duration-200', debugOpen && 'rotate-180')}
              />
            </button>

            {debugOpen && (
              <div className="px-6 pb-6 space-y-5 border-t border-dashed border-gray-200">

                {/* OMI zone */}
                <div className="pt-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Zona OMI rilevata</p>
                  {val.zone_omi ? (
                    <div className="bg-gray-50 rounded-2xl p-4 text-xs font-mono text-gray-600 space-y-1">
                      <div className="flex gap-3">
                        <span className="text-gray-400 w-28 flex-shrink-0">Codice zona</span>
                        <span className="font-bold text-gray-800">{val.zone_omi.codice_zona}</span>
                      </div>
                      <div className="flex gap-3">
                        <span className="text-gray-400 w-28 flex-shrink-0">Fascia</span>
                        <span>{val.zone_omi.fascia}</span>
                      </div>
                      <div className="flex gap-3">
                        <span className="text-gray-400 w-28 flex-shrink-0">Descrizione</span>
                        <span>{val.zone_omi.zona}</span>
                      </div>
                      <div className="flex gap-3">
                        <span className="text-gray-400 w-28 flex-shrink-0">Range €/m²</span>
                        <span>€{val.zone_omi.prezzo_mq_min.toLocaleString('it-IT')} – €{val.zone_omi.prezzo_mq_max.toLocaleString('it-IT')} (medio: €{val.zone_omi.prezzo_mq_medio.toLocaleString('it-IT')})</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 italic">Nessuna zona OMI associata.</p>
                  )}
                </div>

                {/* Raw comparabili */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                    Comparabili grezzi ({comparabili.length})
                  </p>
                  {comparabili.length > 0 ? (
                    <div className="bg-gray-50 rounded-2xl overflow-hidden">
                      <table className="w-full text-xs font-mono text-gray-600">
                        <thead>
                          <tr className="border-b border-gray-200 text-[10px] uppercase tracking-wider text-gray-400">
                            <th className="text-left px-4 py-2 font-semibold">Indirizzo</th>
                            <th className="text-right px-4 py-2 font-semibold">€/m²</th>
                            <th className="text-right px-4 py-2 font-semibold">mq</th>
                            <th className="text-right px-4 py-2 font-semibold">Dist.</th>
                            <th className="text-right px-4 py-2 font-semibold">Rogito</th>
                          </tr>
                        </thead>
                        <tbody>
                          {comparabili.map((c, i) => {
                            const t = c.transazioni_chiuse;
                            if (!t) return null;
                            return (
                              <tr key={i} className="border-b border-gray-100 last:border-0">
                                <td className="px-4 py-2 max-w-[180px] truncate">{t.indirizzo}</td>
                                <td className="px-4 py-2 text-right text-[#94b0ab] font-bold">€{t.prezzo_mq.toLocaleString('it-IT')}</td>
                                <td className="px-4 py-2 text-right">{t.mq}</td>
                                <td className="px-4 py-2 text-right">{Math.round(c.distanza_metri)}m</td>
                                <td className="px-4 py-2 text-right text-gray-400">{t.data_chiusura ? format(parseISO(t.data_chiusura), 'MM/yyyy') : '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 italic">Nessun comparabile trovato nel raggio di 1.5 km.</p>
                  )}
                </div>

              </div>
            )}
          </div>
        )}

        {/* Legal footer */}
        <p className="text-center text-[11px] text-gray-400 pb-4">
          Documento generato da Il Tuo Immobiliare · {format(parseISO(val.created_at), 'd MMMM yyyy', { locale: it })}
          {' '}· La stima è indicativa e non costituisce perizia legale
        </p>

      </div>
    </div>
  );
};

export default ValuazioneReport;
