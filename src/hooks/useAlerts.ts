import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { differenceInCalendarDays } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { showError } from '@/utils/toast';
import { useCurrentProfile } from './useCurrentProfile';
import { ALERT_REGOLE_QUERY_KEY, fetchAlertRegole } from './useAlertRegole';
import type { AlertRegola, FasePipeline, FaseProprietario, ImmobileAlert } from '@/types';

export interface AlertManuale extends ImmobileAlert {
  immobile: { titolo: string; indirizzo: string; citta: string } | null;
}

// Alert "N giorni fermo in fase X", generati a runtime dalle righe attive di
// alert_regole (Fase 7 del pivot, vedi 20260827190000_alert_regole.sql) — non
// più soglie hardcoded, e non più solo immobili: copre anche il kanban
// proprietari. "documento_mancante" resta invece calcolato con la vecchia
// logica di confronto presenza/catalogo, che non è un pattern "N giorni in
// fase X" e quindi non passa dalla tabella regole.
export interface AlertAutomatico {
  id: string;
  tipo: 'stagnazione' | 'documento_mancante';
  entita: 'immobile' | 'proprietario';
  entitaId: string;
  titolo: string;
  indirizzo: string;
  citta: string;
  messaggio: string;
}

interface RawImmobileRow {
  id: string;
  titolo: string;
  indirizzo: string;
  citta: string;
  pipeline: { fase: FasePipeline; updated_at: string } | null;
  documenti: { documento: string; fase: FasePipeline }[] | null;
  // Reverse embed dalla pratica proprietari che ha generato questo immobile
  // (creaImmobileDaPratica in useProprietariPipeline.ts) — unico modo
  // affidabile di risalire all'agente responsabile: immobili.proprietario_id
  // punta ancora a `leads`, gap noto e volutamente non toccato (vedi
  // docs/DECISIONI.md 2026-08-27 Fase 5). Per immobili senza pratica
  // collegata (creati direttamente da PropertyWizard) resta vuoto.
  pratiche: { proprietario: { contatti: { agente_id: string | null } | null } | null }[] | null;
}

interface RawPraticaRow {
  id: string;
  via: string;
  citta: string | null;
  fase: FaseProprietario;
  updated_at: string;
  proprietario: {
    nome: string;
    cognome: string | null;
    contatti: { agente_id: string | null } | null;
  } | null;
}

const MANUALI_QUERY_KEY = ['immobile-alert-manuali'];
const IMMOBILI_BASE_QUERY_KEY = ['immobili-alert-base'];
const PROPRIETARI_BASE_QUERY_KEY = ['proprietari-alert-base'];
const CATALOGO_QUERY_KEY = ['documenti-catalogo-alert'];

// destinatario 'tutti' → visibile a chiunque (comportamento identico a prima
// che esistessero le regole). destinatario 'agente_responsabile' → visibile
// solo all'agente collegato, oppure a un Admin (stessa parità già usata in
// Dashboard.tsx per "tutti i leads" vs "i miei"), oppure a chiunque se non è
// stato possibile risolvere un responsabile — per non far sparire in
// silenzio un alert senza un destinatario reale.
const visibileAUtente = (
  destinatario: AlertRegola['destinatario'],
  agenteResponsabileId: string | null,
  currentUserId: string | null,
  isAdmin: boolean,
): boolean => {
  if (destinatario === 'tutti') return true;
  if (!agenteResponsabileId) return true;
  if (isAdmin) return true;
  return agenteResponsabileId === currentUserId;
};

export const useAlerts = () => {
  const queryClient = useQueryClient();
  const { data: currentProfile } = useCurrentProfile();
  const currentUserId = currentProfile?.id ?? null;
  const isAdmin = currentProfile?.ruolo === 'Admin';

  const manuali = useQuery<AlertManuale[]>({
    queryKey: MANUALI_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('immobile_alert')
        .select('*, immobile:immobili(titolo, indirizzo, citta)')
        .eq('risolto', false)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AlertManuale[];
    },
    staleTime: 30_000,
  });

  const regole = useQuery<AlertRegola[]>({
    queryKey: ALERT_REGOLE_QUERY_KEY,
    queryFn: fetchAlertRegole,
    staleTime: 60_000,
  });

  // Base immobili + fase/updated_at + documenti effettivamente presenti +
  // agente responsabile via pratica collegata: dati minimi per calcolare gli
  // alert automatici a runtime, senza righe persistite (vedi docs/DECISIONI.md).
  const immobiliBase = useQuery<RawImmobileRow[]>({
    queryKey: IMMOBILI_BASE_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('immobili')
        .select(`
          id, titolo, indirizzo, citta,
          pipeline:immobile_pipeline_stato(fase, updated_at),
          documenti:immobile_documenti(documento, fase),
          pratiche:proprietari_pratiche(proprietario:proprietari(contatti(agente_id)))
        `)
        .eq('is_deleted', false);
      if (error) throw error;
      return (data ?? []) as unknown as RawImmobileRow[];
    },
    staleTime: 30_000,
  });

  const proprietariBase = useQuery<RawPraticaRow[]>({
    queryKey: PROPRIETARI_BASE_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proprietari_pratiche')
        .select(`
          id, via, citta, fase, updated_at,
          proprietario:proprietari!proprietari_pratiche_proprietario_id_fkey(nome, cognome, contatti(agente_id))
        `);
      if (error) throw error;
      return (data ?? []) as unknown as RawPraticaRow[];
    },
    staleTime: 30_000,
  });

  const catalogo = useQuery<{ fase: FasePipeline; documento: string }[]>({
    queryKey: CATALOGO_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from('documenti_catalogo').select('fase, documento');
      if (error) throw error;
      return (data ?? []) as { fase: FasePipeline; documento: string }[];
    },
    staleTime: 5 * 60_000,
  });

  const automatici: AlertAutomatico[] = [];

  if (regole.data && immobiliBase.data) {
    const regolaImmobile = new Map(
      regole.data.filter((r) => r.entita_tipo === 'immobile' && r.attiva).map((r) => [r.fase, r]),
    );

    for (const immobile of immobiliBase.data) {
      // Immobili senza riga immobile_pipeline_stato (mai spostati, o creati
      // prima della pipeline) sono trattati come 'In Vendita', coerente col
      // fallback già usato in useImmobiliPipeline — ma senza updated_at non
      // c'è modo di calcolare la stagnazione, quindi restano esclusi da
      // quell'alert (non da quello documenti).
      const fase = immobile.pipeline?.fase ?? 'In Vendita';
      const regola = regolaImmobile.get(fase);

      if (regola && immobile.pipeline?.updated_at) {
        const giorni = differenceInCalendarDays(new Date(), new Date(immobile.pipeline.updated_at));
        if (giorni >= regola.giorni_soglia) {
          const agenteId = immobile.pratiche?.[0]?.proprietario?.contatti?.agente_id ?? null;
          if (visibileAUtente(regola.destinatario, agenteId, currentUserId, isAdmin)) {
            automatici.push({
              id: `stagnazione-immobile-${immobile.id}`,
              tipo: 'stagnazione',
              entita: 'immobile',
              entitaId: immobile.id,
              titolo: immobile.titolo,
              indirizzo: immobile.indirizzo,
              citta: immobile.citta,
              messaggio: `Fermo in "${fase}" da ${giorni} giorni.`,
            });
          }
        }
      }
    }
  }

  if (immobiliBase.data && catalogo.data) {
    const catalogoPerFase = catalogo.data.reduce<Record<string, string[]>>((acc, c) => {
      (acc[c.fase] ??= []).push(c.documento);
      return acc;
    }, {});

    for (const immobile of immobiliBase.data) {
      const fase = immobile.pipeline?.fase ?? 'In Vendita';

      // Confronto per presenza di riga (non per stato 'Fatto'/'Da fare', già
      // visibile nella checklist del Kanban): segnala documenti previsti dal
      // catalogo per la fase corrente ma mai generati per questo immobile
      // (tipicamente perché il catalogo è stato aggiornato dopo la creazione
      // della checklist).
      const attesi = catalogoPerFase[fase] ?? [];
      const presenti = new Set(
        (immobile.documenti ?? []).filter((d) => d.fase === fase).map((d) => d.documento),
      );
      const mancanti = attesi.filter((doc) => !presenti.has(doc));
      if (mancanti.length > 0) {
        automatici.push({
          id: `documento-mancante-${immobile.id}`,
          tipo: 'documento_mancante',
          entita: 'immobile',
          entitaId: immobile.id,
          titolo: immobile.titolo,
          indirizzo: immobile.indirizzo,
          citta: immobile.citta,
          messaggio: `Documento non ancora in checklist: ${mancanti.join(', ')}.`,
        });
      }
    }
  }

  if (regole.data && proprietariBase.data) {
    const regolaProprietario = new Map(
      regole.data.filter((r) => r.entita_tipo === 'proprietario' && r.attiva).map((r) => [r.fase, r]),
    );

    for (const pratica of proprietariBase.data) {
      const regola = regolaProprietario.get(pratica.fase);
      if (!regola) continue;

      const giorni = differenceInCalendarDays(new Date(), new Date(pratica.updated_at));
      if (giorni >= regola.giorni_soglia) {
        const agenteId = pratica.proprietario?.contatti?.agente_id ?? null;
        if (visibileAUtente(regola.destinatario, agenteId, currentUserId, isAdmin)) {
          automatici.push({
            id: `stagnazione-proprietario-${pratica.id}`,
            tipo: 'stagnazione',
            entita: 'proprietario',
            entitaId: pratica.id,
            titolo: pratica.proprietario ? `${pratica.proprietario.nome} ${pratica.proprietario.cognome ?? ''}`.trim() : 'Proprietario',
            indirizzo: pratica.via,
            citta: pratica.citta ?? '',
            messaggio: `Pratica ferma in "${pratica.fase}" da ${giorni} giorni.`,
          });
        }
      }
    }
  }

  const creaAlert = useMutation({
    mutationFn: async ({ immobileId, messaggio }: { immobileId: string; messaggio: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from('immobile_alert').insert({
        immobile_id: immobileId,
        messaggio,
        creato_da: userData.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MANUALI_QUERY_KEY }),
    onError: () => showError('Creazione alert non riuscita.'),
  });

  const risolviAlert = useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await supabase
        .from('immobile_alert')
        .update({ risolto: true, risolto_at: new Date().toISOString() })
        .eq('id', alertId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MANUALI_QUERY_KEY }),
    onError: () => showError('Risoluzione alert non riuscita.'),
  });

  return {
    manuali: manuali.data ?? [],
    automatici,
    isLoading: manuali.isLoading || regole.isLoading || immobiliBase.isLoading || proprietariBase.isLoading || catalogo.isLoading,
    totalCount: (manuali.data?.length ?? 0) + automatici.length,
    creaAlert: creaAlert.mutate,
    risolviAlert: risolviAlert.mutate,
  };
};
