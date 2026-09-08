import { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart3, Download } from 'lucide-react';
import { useKpiReport, type KpiReportData } from '@/hooks/useKpiReport';
import { useAgentRoles } from '@/hooks/useAgentRoles';

const oggiISO = () => new Date().toISOString().slice(0, 10);
const primoGiornoMeseISO = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

const KPI_LABELS: Record<keyof KpiReportData, string> = {
  nuoviProprietari: 'Nuovi proprietari',
  nuoviAcquirenti: 'Nuovi acquirenti',
  nuoviCollaboratori: 'Nuovi collaboratori',
  immobiliAcquisiti: 'Immobili acquisiti',
  immobiliVenduti: 'Immobili venduti',
  valutazioniCompletate: 'Valutazioni completate',
};

const ReportKpi = () => {
  const { data: agenti, isLoading: agentiLoading } = useAgentRoles();
  const [agenteId, setAgenteId] = useState<string | null>(null);
  const [kpiFrom, setKpiFrom] = useState(primoGiornoMeseISO());
  const [kpiTo, setKpiTo] = useState(oggiISO());
  const { data: kpiData, isLoading: kpiLoading } = useKpiReport(kpiFrom, kpiTo, agenteId);

  // Il report è per singolo agente: appena la lista è disponibile si
  // preseleziona il primo, non esiste una vista "tutti gli agenti" aggregata.
  useEffect(() => {
    if (!agenteId && agenti && agenti.length > 0) setAgenteId(agenti[0].id);
  }, [agenti, agenteId]);

  const agenteSelezionato = agenti?.find((a) => a.id === agenteId);

  const esportaKpiCsv = () => {
    if (!kpiData) return;
    const righe = [
      ['Indicatore', 'Valore'],
      ...(Object.keys(KPI_LABELS) as (keyof KpiReportData)[]).map((k) => [KPI_LABELS[k], String(kpiData[k])]),
    ];
    const csv = righe.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const nomeFile = agenteSelezionato?.nome_completo?.toLowerCase().trim().replace(/\s+/g, '-') ?? 'agente';
    a.download = `report-kpi_${nomeFile}_${kpiFrom}_${kpiTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminLayout>
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-extrabold text-[#1a1a1a]">Report KPI</h1>
          <p className="text-gray-500 mt-1">Andamento del singolo agente nel periodo selezionato.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={agenteId ?? undefined} onValueChange={setAgenteId} disabled={agentiLoading || !agenti?.length}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Seleziona agente" />
            </SelectTrigger>
            <SelectContent>
              {(agenti ?? []).map((agente) => (
                <SelectItem key={agente.id} value={agente.id}>{agente.nome_completo ?? 'Senza nome'}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="date" value={kpiFrom} onChange={(e) => setKpiFrom(e.target.value)} className="w-40" />
          <span className="text-gray-400 text-sm">→</span>
          <Input type="date" value={kpiTo} onChange={(e) => setKpiTo(e.target.value)} className="w-40" />
          <Button
            type="button"
            variant="outline"
            onClick={esportaKpiCsv}
            disabled={!kpiData}
            className="gap-1.5"
          >
            <Download size={14} /> Esporta CSV
          </Button>
        </div>
      </div>

      {kpiLoading || !kpiData ? (
        <p className="text-sm text-gray-400 italic">Caricamento...</p>
      ) : (
        <div className="max-w-3xl grid grid-cols-2 md:grid-cols-3 gap-4">
          {(Object.keys(KPI_LABELS) as (keyof KpiReportData)[]).map((k) => (
            <div key={k} className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-5 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-gray-400">
                <BarChart3 size={13} />
                <span className="text-xs font-bold uppercase tracking-wide">{KPI_LABELS[k]}</span>
              </div>
              <span className="text-3xl font-extrabold text-[#1a1a1a]">{kpiData[k]}</span>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
};

export default ReportKpi;
