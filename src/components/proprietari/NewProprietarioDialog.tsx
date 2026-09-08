"use client";

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase';
import { showError, showSuccess } from '@/utils/toast';

interface NewProprietarioDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

interface FormState {
  nome: string;
  cognome: string;
  email: string;
  telefono: string;
  professione: string;
  via_immobile: string;
  citta_immobile: string;
  tipologia_immobile: string;
  zona_venditore: string;
  motivazione_vendita: string;
  scadenza_esclusiva: string;
  valutazione_stimata: string;
}

const emptyForm: FormState = {
  nome: '',
  cognome: '',
  email: '',
  telefono: '',
  professione: '',
  via_immobile: '',
  citta_immobile: '',
  tipologia_immobile: '',
  zona_venditore: '',
  motivazione_vendita: '',
  scadenza_esclusiva: '',
  valutazione_stimata: '',
};

// Crea solo l'anagrafica del proprietario. La pratica non viene generata qui:
// il nuovo flow è che il proprietario resta nella lista finché l'agente non
// lo marca "caldo" (dalla scheda), e solo allora nella lista appare il tasto
// "Avvia pratica" che apre AvviaPraticaDialog e crea la pratica in
// 'Incontro/Sopralluogo'. Vedi 20260907120000_remove_contatto_fase_proprietari.sql.
const NewProprietarioDialog = ({ open, onClose, onCreated }: NewProprietarioDialogProps) => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm);

  const handleClose = () => {
    setForm(emptyForm);
    onClose();
  };

  const creaProprietario = useMutation({
    mutationFn: async () => {
      const { data: contatto, error: contattoError } = await supabase
        .from('contatti')
        .insert({})
        .select()
        .single();
      if (contattoError || !contatto) {
        throw new Error(contattoError?.message ?? 'Creazione contatto non riuscita.');
      }

      const valStimataNum = form.valutazione_stimata.trim() ? Number(form.valutazione_stimata) : null;
      const { error: proprietarioError } = await supabase
        .from('proprietari')
        .insert({
          id: contatto.id,
          nome: form.nome.trim(),
          cognome: form.cognome.trim() || null,
          email: form.email.trim() || null,
          telefono: form.telefono.trim() || null,
          professione: form.professione.trim() || null,
          via_immobile: form.via_immobile.trim() || null,
          citta_immobile: form.citta_immobile.trim() || null,
          tipologia_immobile: form.tipologia_immobile.trim() || null,
          zona_venditore: form.zona_venditore.trim() || null,
          motivazione_vendita: form.motivazione_vendita.trim() || null,
          scadenza_esclusiva: form.scadenza_esclusiva || null,
          valutazione_stimata: Number.isFinite(valStimataNum!) ? valStimataNum : null,
        });
      if (proprietarioError) {
        throw new Error(proprietarioError.message);
      }
    },
    onSuccess: () => {
      showSuccess('Proprietario creato correttamente.');
      queryClient.invalidateQueries({ queryKey: ['proprietari-pipeline'] });
      onCreated();
      handleClose();
    },
    onError: (err) => showError(err instanceof Error ? err.message : 'Creazione non riuscita.'),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="w-full sm:max-w-lg border-none shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold">Nuovo Proprietario</DialogTitle>
          <DialogDescription className="font-medium">
            Solo anagrafica. La pratica si avvia dalla lista quando lo marchi "caldo".
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => { e.preventDefault(); creaProprietario.mutate(); }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="np-nome" className="text-xs font-bold text-gray-500">Nome *</Label>
              <Input
                id="np-nome"
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                required
                className="rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="np-cognome" className="text-xs font-bold text-gray-500">Cognome</Label>
              <Input
                id="np-cognome"
                value={form.cognome}
                onChange={(e) => setForm((f) => ({ ...f, cognome: e.target.value }))}
                className="rounded-xl"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="np-email" className="text-xs font-bold text-gray-500">Email</Label>
              <Input
                id="np-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="np-telefono" className="text-xs font-bold text-gray-500">Telefono</Label>
              <Input
                id="np-telefono"
                value={form.telefono}
                onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
                className="rounded-xl"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="np-professione" className="text-xs font-bold text-gray-500">Professione</Label>
            <Input
              id="np-professione"
              value={form.professione}
              onChange={(e) => setForm((f) => ({ ...f, professione: e.target.value }))}
              className="rounded-xl"
            />
          </div>

          <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-4 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400">
              Info immobile da vendere <span className="normal-case font-medium text-gray-300">(facoltativo)</span>
            </h4>
            <div className="space-y-1.5">
              <Label htmlFor="np-via" className="text-xs font-bold text-gray-500">Via / Indirizzo</Label>
              <Input
                id="np-via"
                value={form.via_immobile}
                onChange={(e) => setForm((f) => ({ ...f, via_immobile: e.target.value }))}
                placeholder="Es. Via Roma 10"
                className="rounded-xl"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="np-citta-immob" className="text-xs font-bold text-gray-500">Città</Label>
                <Input
                  id="np-citta-immob"
                  value={form.citta_immobile}
                  onChange={(e) => setForm((f) => ({ ...f, citta_immobile: e.target.value }))}
                  placeholder="Es. Bergamo"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="np-tipologia" className="text-xs font-bold text-gray-500">Tipologia</Label>
                <Input
                  id="np-tipologia"
                  value={form.tipologia_immobile}
                  onChange={(e) => setForm((f) => ({ ...f, tipologia_immobile: e.target.value }))}
                  placeholder="Es. Trilocale"
                  className="rounded-xl"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="np-zona" className="text-xs font-bold text-gray-500">Zona</Label>
              <Input
                id="np-zona"
                value={form.zona_venditore}
                onChange={(e) => setForm((f) => ({ ...f, zona_venditore: e.target.value }))}
                placeholder="Es. Centro"
                className="rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="np-motivazione" className="text-xs font-bold text-gray-500">Motivazione vendita</Label>
              <Textarea
                id="np-motivazione"
                value={form.motivazione_vendita}
                onChange={(e) => setForm((f) => ({ ...f, motivazione_vendita: e.target.value }))}
                placeholder="Es. Trasferimento lavoro"
                className="rounded-xl min-h-[3rem]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="np-scadenza" className="text-xs font-bold text-gray-500">Scadenza esclusiva</Label>
                <Input
                  id="np-scadenza"
                  type="date"
                  value={form.scadenza_esclusiva}
                  onChange={(e) => setForm((f) => ({ ...f, scadenza_esclusiva: e.target.value }))}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="np-val" className="text-xs font-bold text-gray-500">Valutazione stimata (€)</Label>
                <Input
                  id="np-val"
                  type="number"
                  inputMode="numeric"
                  value={form.valutazione_stimata}
                  onChange={(e) => setForm((f) => ({ ...f, valutazione_stimata: e.target.value }))}
                  placeholder="Es. 250000"
                  className="rounded-xl"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="outline" onClick={handleClose} className="rounded-xl font-bold border-gray-200">
              Annulla
            </Button>
            <Button
              type="submit"
              disabled={creaProprietario.isPending || !form.nome.trim()}
              className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl font-bold"
            >
              Crea
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default NewProprietarioDialog;
