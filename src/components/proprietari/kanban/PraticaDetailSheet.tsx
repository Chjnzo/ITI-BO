import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Phone, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { showError, showSuccess } from '@/utils/toast';
import { cn } from '@/lib/utils';
import type { PraticaCard } from '@/hooks/useProprietariPipeline';
import type { ProprietarioPraticaDocumento } from '@/types';

interface PraticaDetailSheetProps {
  pratica: PraticaCard | null;
  onClose: () => void;
}

interface FormState {
  via: string;
  tipologia: string;
  citta: string;
  zona_venditore: string;
  motivazione_vendita: string;
  scadenza_esclusiva: string;
  valutazione_stimata: string;
}

const emptyForm: FormState = {
  via: '',
  tipologia: '',
  citta: '',
  zona_venditore: '',
  motivazione_vendita: '',
  scadenza_esclusiva: '',
  valutazione_stimata: '',
};

const PraticaDetailSheet = ({ pratica, onClose }: PraticaDetailSheetProps) => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm);

  // La PraticaCard non porta zona_venditore/motivazione_vendita/scadenza_esclusiva
  // (non servono al kanban), quindi al cambio pratica si idratano dai soli campi
  // disponibili e il resto si carica on-demand dalla tabella.
  useEffect(() => {
    if (!pratica) {
      setForm(emptyForm);
      return;
    }
    setForm({
      via: pratica.via ?? '',
      tipologia: pratica.tipologia ?? '',
      citta: pratica.citta ?? '',
      zona_venditore: '',
      motivazione_vendita: '',
      scadenza_esclusiva: '',
      valutazione_stimata: pratica.valutazione_stimata != null ? String(pratica.valutazione_stimata) : '',
    });

    let cancelled = false;
    supabase
      .from('proprietari_pratiche')
      .select('zona_venditore, motivazione_vendita, scadenza_esclusiva')
      .eq('id', pratica.id)
      .single()
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        setForm((prev) => ({
          ...prev,
          zona_venditore: data.zona_venditore ?? '',
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
          zona_venditore: form.zona_venditore.trim() || null,
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

            <form
              className="mt-6 space-y-4"
              onSubmit={(e) => { e.preventDefault(); salvaPratica.mutate(); }}
            >
              <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400">Dettagli pratica</h4>

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
                  <Input
                    id="tipologia"
                    value={form.tipologia}
                    onChange={(e) => setForm((f) => ({ ...f, tipologia: e.target.value }))}
                    className="rounded-xl"
                  />
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
                <Label htmlFor="zona_venditore" className="text-xs font-bold text-gray-500">Zona</Label>
                <Input
                  id="zona_venditore"
                  value={form.zona_venditore}
                  onChange={(e) => setForm((f) => ({ ...f, zona_venditore: e.target.value }))}
                  className="rounded-xl"
                />
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

              <Button
                type="submit"
                disabled={salvaPratica.isPending || !form.via.trim()}
                className="w-full bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl font-bold h-11"
              >
                Salva
              </Button>
            </form>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default PraticaDetailSheet;
