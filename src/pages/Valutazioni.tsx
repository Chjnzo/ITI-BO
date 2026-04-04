import { useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { showError } from '@/utils/toast';

interface Lead {
  id: string;
  nome: string;
  cognome: string;
}

const TIPOLOGIE = ['Monolocale', 'Bilocale', 'Trilocale', 'Quadrilocale', 'Villa', 'Attico'];
const CONDIZIONI = ['Da ristrutturare', 'Discreto', 'Buono', 'Ottimo', 'Nuova Costruzione'];

const Valutazioni = () => {
  // Left card state
  const [leadId, setLeadId] = useState('');
  const [indirizzo, setIndirizzo] = useState('');
  const [mq, setMq] = useState('');
  const [tipologia, setTipologia] = useState('');
  const [condizioni, setCondizioni] = useState('');
  const [stimaMin, setStimaMin] = useState('');
  const [stimaMax, setStimaMax] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Right card state
  const [descrizioneZona, setDescrizioneZona] = useState('');
  const [rationaleValutazione, setRationaleValutazione] = useState('');

  // Leads for select
  const [leads, setLeads] = useState<Lead[]>([]);

  useEffect(() => {
    supabase
      .from('leads')
      .select('id, nome, cognome')
      .order('cognome')
      .then(({ data }) => setLeads(data ?? []));
  }, []);

  const handleGenerateAI = async () => {
    if (!indirizzo || !mq || !tipologia || !condizioni || !stimaMin || !stimaMax) {
      showError('Compila tutti i campi prima di generare i testi.');
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-evaluation', {
        body: {
          indirizzo,
          metri_quadri: Number(mq),
          tipologia,
          condizioni,
          stima_minima: Number(stimaMin),
          stima_massima: Number(stimaMax),
        },
      });

      if (error) throw error;

      setDescrizioneZona(data.descrizione_zona ?? '');
      setRationaleValutazione(data.razionale_valutazione ?? '');
    } catch (err) {
      showError('Errore durante la generazione. Riprova.');
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveAndGenerateLink = async () => {
    // TODO: persist to DB, return sharable dossier URL
  };

  return (
    <AdminLayout>
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-extrabold tracking-tight text-gray-900">
          Valutazioni AI ✨
        </h1>
        <p className="text-gray-500 mt-1 font-medium">
          Genera dossier immobiliari interattivi e professionali.
        </p>
      </div>

      {/* Two-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* Left Card — Input form */}
        <div className="bg-white border-none shadow-sm rounded-[2rem] p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-900">Dati Immobile</h2>

          <div className="space-y-1.5">
            <Label htmlFor="lead">Lead</Label>
            <Select value={leadId} onValueChange={setLeadId}>
              <SelectTrigger id="lead" className="h-12 rounded-xl border-gray-100">
                <SelectValue placeholder="Seleziona cliente..." />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {leads.map(l => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.cognome} {l.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="indirizzo">Indirizzo</Label>
            <Input
              id="indirizzo"
              type="text"
              placeholder="Via Roma 12, Bologna"
              value={indirizzo}
              onChange={e => setIndirizzo(e.target.value)}
              className="h-12 rounded-xl border-gray-100"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mq">Metri Quadri</Label>
            <Input
              id="mq"
              type="number"
              placeholder="80"
              value={mq}
              onChange={e => setMq(e.target.value)}
              className="h-12 rounded-xl border-gray-100"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tipologia">Tipologia</Label>
            <Select value={tipologia} onValueChange={setTipologia}>
              <SelectTrigger id="tipologia" className="h-12 rounded-xl border-gray-100">
                <SelectValue placeholder="Seleziona tipologia..." />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {TIPOLOGIE.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="condizioni">Condizioni</Label>
            <Select value={condizioni} onValueChange={setCondizioni}>
              <SelectTrigger id="condizioni" className="h-12 rounded-xl border-gray-100">
                <SelectValue placeholder="Seleziona condizioni..." />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {CONDIZIONI.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="stimaMin">Stima Minima €</Label>
              <Input
                id="stimaMin"
                type="number"
                placeholder="200000"
                value={stimaMin}
                onChange={e => setStimaMin(e.target.value)}
                className="h-12 rounded-xl border-gray-100"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="stimaMax">Stima Massima €</Label>
              <Input
                id="stimaMax"
                type="number"
                placeholder="250000"
                value={stimaMax}
                onChange={e => setStimaMax(e.target.value)}
                className="h-12 rounded-xl border-gray-100"
              />
            </div>
          </div>

          <Button
            onClick={handleGenerateAI}
            disabled={isGenerating}
            className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl h-12 w-full font-semibold"
          >
            {isGenerating ? 'Generazione in corso...' : 'Genera Testi con AI ✨'}
          </Button>
        </div>

        {/* Right Card — AI output */}
        <div className="bg-white border-none shadow-sm rounded-[2rem] p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-900">Testi Generati</h2>

          <div className="space-y-1.5">
            <Label htmlFor="descrizioneZona">Descrizione Zona</Label>
            <Textarea
              id="descrizioneZona"
              placeholder="La descrizione della zona verrà generata dall'AI..."
              value={descrizioneZona}
              onChange={e => setDescrizioneZona(e.target.value)}
              className="min-h-[150px] rounded-xl border-gray-100 resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rationaleValutazione">Razionale Valutazione</Label>
            <Textarea
              id="rationaleValutazione"
              placeholder="Il razionale della valutazione verrà generato dall'AI..."
              value={rationaleValutazione}
              onChange={e => setRationaleValutazione(e.target.value)}
              className="min-h-[150px] rounded-xl border-gray-100 resize-none"
            />
          </div>

          <Button
            variant="outline"
            onClick={handleSaveAndGenerateLink}
            className="rounded-xl h-12 w-full font-semibold border-gray-200 hover:bg-gray-50"
          >
            Salva e Genera Link Dossier
          </Button>
        </div>

      </div>
    </AdminLayout>
  );
};

export default Valutazioni;
