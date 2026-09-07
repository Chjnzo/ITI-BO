import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Phone, User, Calculator, ExternalLink, Sparkles, Pencil } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { showError, showSuccess } from '@/utils/toast';
import { cn } from '@/lib/utils';
import { TIPOLOGIE_IMMOBILE } from '@/lib/constants';
import type { PraticaCard } from '@/hooks/useProprietariPipeline';
import type { ProprietarioPraticaDocumento } from '@/types';
import ValuationWizard from '@/components/valutazioni/ValuationWizard';

interface PraticaDetailSheetProps {
  pratica: PraticaCard | null;
  onClose: () => void;
}

interface FormState {
  via: string;
  tipologia: string;
  citta: string;
  motivazione_vendita: string;
  scadenza_esclusiva: string;
  valutazione_stimata: string;
}

const emptyForm: FormState = {
  via: '',
  tipologia: '',
  citta: '',
  motivazione_vendita: '',
  scadenza_esclusiva: '',
  valutazione_stimata: '',
};

const PraticaDetailSheet = ({ pratica, onClose }: PraticaDetailSheetProps) => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Ultima valutazione collegata al proprietario di questa pratica: se esiste
  // la mostriamo con range stima_min-stima_max + link al report pubblico,
  // altrimenti mostriamo solo il bottone "Crea valutazione" che apre il wizard
  // già precompilato col proprietario (initialProprietarioId).
  const { data: ultimaValutazione } = useQuery<{
    id: string;
    stima_min: number | null;
    stima_max: number | null;
    slug: string | null;
    created_at: string;
    stato: string;
  } | null>({
    queryKey: ['pratica-ultima-valutazione', pratica?.proprietario_id],
    enabled: !!pratica?.proprietario_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('valutazioni')
        .select('id, stima_min, stima_max, slug, created_at, stato')
        .eq('proprietario_id', pratica!.proprietario_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });

  const formatEuro = (n: number | null | undefined) => n == null ? '—' : new Intl.NumberFormat('it-IT', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(n);

  // La PraticaCard non porta motivazione_vendita/scadenza_esclusiva (non
  // servono al kanban), quindi al cambio pratica si idratano dai soli campi
  // disponibili e il resto si carica on-demand dalla tabella.
  useEffect(() => {
    if (!pratica) {
      setForm(emptyForm);
      setIsEditing(false);
      return;
    }
    setIsEditing(false);
    setForm({
      via: pratica.via ?? '',
      tipologia: pratica.tipologia ?? '',
      citta: pratica.citta ?? '',
      motivazione_vendita: '',
      scadenza_esclusiva: '',
      valutazione_stimata: pratica.valutazione_stimata != null ? String(pratica.valutazione_stimata) : '',
    });

    let cancelled = false;
    supabase
      .from('proprietari_pratiche')
      .select('motivazione_vendita, scadenza_esclusiva')
      .eq('id', pratica.id)
      .single()
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        setForm((prev) => ({
          ...prev,
          motivazione_vendita: data.motivazione_vendita ?? '',
          scadenza_esclusiva: data.scadenza_esclusiva ?? '',
        }));
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pratica?.id]);

  const salvaPratica = useMutation({
    mutationFn: async () => {
      if (!pratica) return;
      const { error } = await supabase
        .from('proprietari_pratiche')
        .update({
          via: form.via.trim(),
          tipologia: form.tipologia.trim() || null,
          citta: form.citta.trim() || null,
          motivazione_vendita: form.motivazione_vendita.trim() || null,
          scadenza_esclusiva: form.scadenza_esclusiva || null,
          valutazione_stimata: form.valutazione_stimata ? Number(form.valutazione_stimata) : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', pratica.id);
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess('Pratica aggiornata.');
      queryClient.invalidateQueries({ queryKey: ['proprietari-pipeline'] });
      setIsEditing(false);
    },
    onError: () => showError('Salvataggio non riuscito.'),
  });

  // Query key allineata a quella invalidata in useProprietariPipeline.spostaFase
  // dopo la generazione checklist della nuova fase.
  const { data: documenti, isLoading: documentiLoading } = useQuery<ProprietarioPraticaDocumento[]>({
    queryKey: ['proprietari-pratica-documenti', pratica?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proprietari_pratica_documenti')
        .select('*')
        .eq('pratica_id', pratica!.id)
        .order('fase')
        .order('documento');
      if (error) throw error;
      return (data ?? []) as ProprietarioPraticaDocumento[];
    },
    enabled: !!pratica,
  });

  // Solo la fase corrente: le altre fasi (Incontro/Sopralluogo, Rivalutazione)
  // non hanno documenti in catalogo, coerente col conteggio docTotali/docCompletati
  // già mostrato sulla card kanban.
  const documentiFaseCorrente = (documenti ?? []).filter((d) => d.fase === pratica?.fase);

  const toggleDocumento = useMutation({
    mutationFn: async (doc: ProprietarioPraticaDocumento) => {
      const nuovoStato = doc.stato === 'Fatto' ? 'Da fare' : 'Fatto';
      const { error } = await supabase
        .from('proprietari_pratica_documenti')
        .update({
          stato: nuovoStato,
          completato_at: nuovoStato === 'Fatto' ? new Date().toISOString() : null,
        })
        .eq('id', doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proprietari-pratica-documenti', pratica?.id] });
      queryClient.invalidateQueries({ queryKey: ['proprietari-pipeline'] });
    },
    onError: () => showError('Aggiornamento documento non riuscito.'),
  });

  return (
    <Sheet open={!!pratica} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[480px] overflow-y-auto">
        {pratica && (
          <>
            <SheetHeader className="text-left">
              <SheetTitle className="text-xl font-extrabold">{pratica.via}</SheetTitle>
              <SheetDescription className="font-medium">
                {[pratica.citta, pratica.tipologia].filter(Boolean).join(' · ') || 'Pratica proprietario'}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="font-semibold">{pratica.fase}</Badge>
            </div>

            <div className="mt-6 rounded-2xl border border-gray-100 bg-gray-50/50 p-4 space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Proprietario</h4>
              {pratica.proprietario_nome && (
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <User size={14} className="text-gray-400 shrink-0" />
                  {pratica.proprietario_nome}
                </div>
              )}
              {pratica.proprietario_telefono && (
                <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
                  <Phone size={14} className="text-gray-400 shrink-0" />
                  {pratica.proprietario_telefono}
                </div>
              )}
            </div>

            <div className="mt-6 rounded-2xl border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
                  <Sparkles size={12} className="text-[#94b0ab]" />
                  Valutazione AI
                </h4>
                {ultimaValutazione?.slug && (
                  <a
                    href={`/report/${ultimaValutazione.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-bold text-[#94b0ab] hover:underline flex items-center gap-1"
                  >
                    Apri report <ExternalLink size={11} />
                  </a>
                )}
              </div>
              {ultimaValutazione ? (
                <>
                  <p className="text-lg font-black text-gray-900 leading-tight">
                    {formatEuro(ultimaValutazione.stima_min)}
                    {ultimaValutazione.stima_min != null && ultimaValutazione.stima_max != null && (
                      <span className="text-gray-300 mx-2 font-light">–</span>
                    )}
                    {formatEuro(ultimaValutazione.stima_max)}
                  </p>
                  <p className="text-[0.65rem] text-gray-400 uppercase tracking-wider mt-1">
                    {ultimaValutazione.stato} · {new Date(ultimaValutazione.created_at).toLocaleDateString('it-IT')}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setWizardOpen(true)}
                    className="w-full mt-3 rounded-xl text-xs font-bold border-gray-200"
                  >
                    <Calculator size={13} className="mr-1.5" />
                    Nuova valutazione
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-400 italic mb-3">Nessuna valutazione per questo proprietario.</p>
                  <Button
                    type="button"
                    onClick={() => setWizardOpen(true)}
                    className="w-full bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl text-xs font-bold h-10"
                  >
                    <Calculator size={13} className="mr-1.5" />
                    Crea valutazione
                  </Button>
                </>
              )}
            </div>

            <div className="mt-6">
              <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Checklist documenti</h4>
              {documentiLoading ? (
                <p className="text-sm text-gray-400 italic">Caricamento...</p>
              ) : documentiFaseCorrente.length === 0 ? (
                <p className="text-sm text-gray-400 italic">Nessun documento per questa fase.</p>
              ) : (
                <div className="space-y-2">
                  {documentiFaseCorrente.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center gap-3 rounded-xl border border-gray-100 px-3 py-2.5 hover:bg-gray-50 transition-colors"
                    >
                      <label className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
                        <Checkbox
                          checked={doc.stato === 'Fatto'}
                          onCheckedChange={() => toggleDocumento.mutate(doc)}
                        />
                        <span className={cn(
                          'text-sm font-medium truncate',
                          doc.stato === 'Fatto' ? 'text-gray-400 line-through' : 'text-gray-700',
                        )}>
                          {doc.documento}
                        </span>
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400">Dettagli pratica</h4>
                {!isEditing && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditing(true)}
                    className="h-7 text-xs font-bold text-[#94b0ab] hover:bg-[#94b0ab]/10 rounded-lg px-2"
                  >
                    <Pencil size={12} className="mr-1" />
                    Modifica
                  </Button>
                )}
              </div>

              {isEditing ? (
                <form
                  className="space-y-4"
                  onSubmit={(e) => { e.preventDefault(); salvaPratica.mutate(); }}
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="via" className="text-xs font-bold text-gray-500">Via *</Label>
                    <Input
                      id="via"
                      value={form.via}
                      onChange={(e) => setForm((f) => ({ ...f, via: e.target.value }))}
                      required
                      className="rounded-xl"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="tipologia" className="text-xs font-bold text-gray-500">Tipologia</Label>
                      <Select value={form.tipologia} onValueChange={(v) => setForm((f) => ({ ...f, tipologia: v }))}>
                        <SelectTrigger id="tipologia" className="rounded-xl"><SelectValue placeholder="Seleziona..." /></SelectTrigger>
                        <SelectContent className="rounded-xl">
                          {TIPOLOGIE_IMMOBILE.map((t) => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="citta" className="text-xs font-bold text-gray-500">Città</Label>
                      <Input
                        id="citta"
                        value={form.citta}
                        onChange={(e) => setForm((f) => ({ ...f, citta: e.target.value }))}
                        className="rounded-xl"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="motivazione_vendita" className="text-xs font-bold text-gray-500">Motivazione vendita</Label>
                    <Textarea
                      id="motivazione_vendita"
                      value={form.motivazione_vendita}
                      onChange={(e) => setForm((f) => ({ ...f, motivazione_vendita: e.target.value }))}
                      className="rounded-xl min-h-[4rem]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="scadenza_esclusiva" className="text-xs font-bold text-gray-500">Scadenza esclusiva</Label>
                      <Input
                        id="scadenza_esclusiva"
                        type="date"
                        value={form.scadenza_esclusiva}
                        onChange={(e) => setForm((f) => ({ ...f, scadenza_esclusiva: e.target.value }))}
                        className="rounded-xl"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="valutazione_stimata" className="text-xs font-bold text-gray-500">Valutazione stimata</Label>
                      <Input
                        id="valutazione_stimata"
                        type="number"
                        min="0"
                        value={form.valutazione_stimata}
                        onChange={(e) => setForm((f) => ({ ...f, valutazione_stimata: e.target.value }))}
                        className="rounded-xl"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsEditing(false)}
                      className="flex-1 rounded-xl font-bold border-gray-200 h-11"
                    >
                      Annulla
                    </Button>
                    <Button
                      type="submit"
                      disabled={salvaPratica.isPending || !form.via.trim()}
                      className="flex-1 bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl font-bold h-11"
                    >
                      Salva
                    </Button>
                  </div>
                </form>
              ) : (
                <dl className="space-y-2 text-sm">
                  <ReadRow label="Via" value={form.via} />
                  <ReadRow label="Tipologia" value={form.tipologia || '—'} />
                  <ReadRow label="Città" value={form.citta || '—'} />
                  <ReadRow label="Motivazione" value={form.motivazione_vendita || '—'} multiline />
                  <ReadRow label="Scadenza esclusiva" value={form.scadenza_esclusiva ? new Date(form.scadenza_esclusiva).toLocaleDateString('it-IT') : '—'} />
                  <ReadRow label="Valutazione stimata" value={form.valutazione_stimata ? formatEuro(Number(form.valutazione_stimata)) : '—'} />
                </dl>
              )}
            </div>

            <ValuationWizard
              open={wizardOpen}
              onClose={() => setWizardOpen(false)}
              onSaved={() => {
                queryClient.invalidateQueries({ queryKey: ['pratica-ultima-valutazione', pratica.proprietario_id] });
              }}
              initialProprietarioId={pratica.proprietario_id}
              initialProprietarioNome={pratica.proprietario_nome || undefined}
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

// Riga read-only per la modalità view dei dettagli: label a sinistra piccola,
// valore a destra tipografia semi-bold. `multiline` per campi lunghi
// (motivazione).
const ReadRow = ({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) => (
  <div className={cn('flex gap-3', multiline ? 'flex-col' : 'items-baseline justify-between')}>
    <dt className="text-[0.65rem] font-bold uppercase tracking-wider text-gray-400 shrink-0">{label}</dt>
    <dd className={cn('text-gray-800 font-semibold', multiline ? 'text-sm whitespace-pre-wrap' : 'text-sm text-right truncate')}>{value}</dd>
  </div>
);

export default PraticaDetailSheet;
