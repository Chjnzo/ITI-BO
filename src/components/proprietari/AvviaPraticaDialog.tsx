"use client";

import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { showError, showSuccess } from '@/utils/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { KeyRound } from 'lucide-react';
import { TIPOLOGIE_IMMOBILE } from '@/lib/constants';

export interface AvviaPraticaTarget {
  id: string;
  nome: string;
  cognome: string | null;
  via_immobile?: string | null;
  citta_immobile?: string | null;
  tipologia_immobile?: string | null;
}

interface AvviaPraticaDialogProps {
  proprietario: AvviaPraticaTarget | null;
  onClose: () => void;
  onCreated: () => void;
}

// Precondizione: il proprietario è già "caldo" (il bottone che apre questo
// dialog appare solo per proprietari.caldo=true — vedi ProprietariList).
// Avviare una pratica ora significa solo creare la prima riga in
// proprietari_pratiche, direttamente in "Incontro/Sopralluogo" (la fase
// "Contatto" è stata rimossa: il flag caldo copre da solo il primo momento
// di contatto, vedi 20260907120000_remove_contatto_fase_proprietari.sql).
const AvviaPraticaDialog = ({ proprietario, onClose, onCreated }: AvviaPraticaDialogProps) => {
  const [via, setVia] = useState('');
  const [tipologia, setTipologia] = useState('');
  const [citta, setCitta] = useState('');

  useEffect(() => {
    if (proprietario) {
      setVia(proprietario.via_immobile ?? '');
      setTipologia(proprietario.tipologia_immobile ?? '');
      setCitta(proprietario.citta_immobile ?? '');
    }
  }, [proprietario]);

  const avviaPratica = useMutation({
    mutationFn: async () => {
      if (!proprietario) return;
      const { error } = await supabase
        .from('proprietari_pratiche')
        .insert({
          proprietario_id: proprietario.id,
          via: via.trim(),
          tipologia: tipologia || null,
          citta: citta.trim() || null,
          fase: 'Incontro/Sopralluogo',
        });
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess('Pratica avviata.');
      onCreated();
      onClose();
    },
    onError: () => showError('Impossibile avviare la pratica.'),
  });

  return (
    <Dialog open={!!proprietario} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-full sm:max-w-md border-none shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold">Avvia pratica</DialogTitle>
          <DialogDescription className="font-medium">
            {proprietario && `Per ${proprietario.nome} ${proprietario.cognome ?? ''}`.trim()}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => { e.preventDefault(); avviaPratica.mutate(); }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="ap-via" className="text-xs font-bold text-gray-500">Via *</Label>
            <Input
              id="ap-via"
              value={via}
              onChange={(e) => setVia(e.target.value)}
              required
              className="rounded-xl"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ap-tipologia" className="text-xs font-bold text-gray-500">Tipologia</Label>
              <Select value={tipologia} onValueChange={setTipologia}>
                <SelectTrigger id="ap-tipologia" className="rounded-xl"><SelectValue placeholder="Seleziona..." /></SelectTrigger>
                <SelectContent className="rounded-xl">
                  {TIPOLOGIE_IMMOBILE.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ap-citta" className="text-xs font-bold text-gray-500">Città</Label>
              <Input
                id="ap-citta"
                value={citta}
                onChange={(e) => setCitta(e.target.value)}
                className="rounded-xl"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl font-bold border-gray-200">
              Annulla
            </Button>
            <Button
              type="submit"
              disabled={avviaPratica.isPending || !via.trim()}
              className="bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl font-bold"
            >
              <KeyRound size={14} className="mr-1.5" />
              Avvia
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AvviaPraticaDialog;
