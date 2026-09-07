"use client";

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import AdminLayout from '@/components/layout/AdminLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Clock, FileText, Check, BellOff, ChevronRight, Home as HomeIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useAlerts,
  type AlertAutomatico,
  type AlertManuale,
  type DocumentiIncompletiImmobile,
} from '@/hooks/useAlerts';

// Card per immobile: aggrega documenti mancanti + eventuale stagnazione +
// eventuali alert manuali in un'unica riga cliccabile. Molto più leggibile
// del vecchio elenco discorsivo.
interface ImmobileAlertCard {
  immobileId: string;
  titolo: string;
  indirizzo: string;
  citta: string;
  fase: string | null;
  documentiDaFare: string[];
  stagnazioneMessaggio: string | null;
  documentiNonInChecklist: string[];
  alertManuali: AlertManuale[];
}

const Alerts = () => {
  const navigate = useNavigate();
  const {
    manuali,
    automatici,
    documentiIncompleti,
    isLoading,
    risolviAlert,
  } = useAlerts();

  const apriImmobile = (immobileId: string) => {
    navigate('/gestione', { state: { openImmobileId: immobileId, gestioneTab: 'in-vendita' } });
  };

  const apriPratica = (praticaId: string) => {
    navigate('/gestione', { state: { openPraticaId: praticaId, gestioneTab: 'proprietari' } });
  };

  // Raggruppa per immobile: parto dalle checklist incomplete e sovrappongo
  // stagnazione + doc-non-in-catalogo + alert manuali dello stesso immobile.
  const immobiliCards: ImmobileAlertCard[] = useMemo(() => {
    const byId = new Map<string, ImmobileAlertCard>();
    const upsert = (immobileId: string, base: Partial<ImmobileAlertCard> & { immobileId: string; titolo: string; indirizzo: string; citta: string }) => {
      const existing = byId.get(immobileId);
      if (existing) return existing;
      const created: ImmobileAlertCard = {
        immobileId,
        titolo: base.titolo,
        indirizzo: base.indirizzo,
        citta: base.citta,
        fase: base.fase ?? null,
        documentiDaFare: [],
        stagnazioneMessaggio: null,
        documentiNonInChecklist: [],
        alertManuali: [],
      };
      byId.set(immobileId, created);
      return created;
    };

    for (const item of documentiIncompleti as DocumentiIncompletiImmobile[]) {
      const card = upsert(item.immobileId, item);
      card.documentiDaFare = item.documentiDaFare;
      card.fase = item.fase;
    }
    for (const alert of automatici.filter((a) => a.entita === 'immobile')) {
      const card = upsert(alert.entitaId, {
        immobileId: alert.entitaId,
        titolo: alert.titolo,
        indirizzo: alert.indirizzo,
        citta: alert.citta,
      });
      if (alert.tipo === 'stagnazione') card.stagnazioneMessaggio = alert.messaggio;
      // documento_mancante = catalogo aggiornato dopo la creazione della
      // checklist: doc previsti ma senza riga. Sono cosa diversa dai doc "Da
      // fare"; li estraggo dal messaggio "Documento non ancora in checklist: X".
      if (alert.tipo === 'documento_mancante') {
        const match = alert.messaggio.replace(/^Documento non ancora in checklist:\s*/i, '').replace(/\.$/, '');
        card.documentiNonInChecklist = match.split(',').map((s) => s.trim()).filter(Boolean);
      }
    }
    for (const m of manuali) {
      if (!m.immobile) continue;
      const card = upsert(m.immobile_id, {
        immobileId: m.immobile_id,
        titolo: m.immobile.titolo,
        indirizzo: m.immobile.indirizzo,
        citta: m.immobile.citta,
      });
      card.alertManuali.push(m);
    }
    return [...byId.values()].sort((a, b) => a.titolo.localeCompare(b.titolo, 'it'));
  }, [documentiIncompleti, automatici, manuali]);

  const stagnazioneProprietari = automatici.filter((a) => a.entita === 'proprietario');

  const totale = immobiliCards.length + stagnazioneProprietari.length;

  return (
    <AdminLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-[#1a1a1a]">Alert</h1>
        <p className="text-gray-500 mt-1">
          Ogni immobile con qualcosa da sistemare: documenti da caricare, fasi ferme, promemoria manuali.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400 italic">Caricamento...</p>
      ) : totale === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center text-gray-400">
          <BellOff size={40} className="mb-3" />
          <p className="font-semibold">Nessun alert attivo</p>
          <p className="text-sm">Tutti gli immobili sono aggiornati.</p>
        </div>
      ) : (
        <div className="space-y-8 max-w-4xl">
          {immobiliCards.length > 0 && (
            <section>
              <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">
                Immobili con alert ({immobiliCards.length})
              </h2>
              <div className="space-y-3">
                {immobiliCards.map((card) => (
                  <ImmobileCard
                    key={card.immobileId}
                    card={card}
                    onOpen={() => apriImmobile(card.immobileId)}
                    onRisolvi={risolviAlert}
                  />
                ))}
              </div>
            </section>
          )}

          {stagnazioneProprietari.length > 0 && (
            <section>
              <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">
                Pratiche proprietari ferme ({stagnazioneProprietari.length})
              </h2>
              <div className="space-y-3">
                {stagnazioneProprietari.map((alert) => (
                  <PraticaCard key={alert.id} alert={alert} onOpen={() => apriPratica(alert.entitaId)} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </AdminLayout>
  );
};

const ImmobileCard = ({ card, onOpen, onRisolvi }: { card: ImmobileAlertCard; onOpen: () => void; onRisolvi: (id: string) => void }) => {
  const totaleProblemi =
    card.documentiDaFare.length
    + (card.stagnazioneMessaggio ? 1 : 0)
    + card.documentiNonInChecklist.length
    + card.alertManuali.length;

  return (
    <div className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-[#94b0ab]/40 transition-all overflow-hidden">
      <button
        type="button"
        onClick={onOpen}
        className="w-full text-left px-5 py-4 flex items-start gap-4"
      >
        <div className="w-10 h-10 rounded-xl bg-[#94b0ab]/10 flex items-center justify-center shrink-0">
          <HomeIcon size={18} className="text-[#94b0ab]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-gray-900 truncate">{card.titolo}</p>
            {card.fase && (
              <Badge variant="secondary" className="text-[0.6rem] font-semibold px-1.5 py-0 h-4">
                {card.fase}
              </Badge>
            )}
            <span className="text-[0.65rem] font-bold text-red-600 bg-red-50 rounded-full px-2 py-0.5">
              {totaleProblemi} {totaleProblemi === 1 ? 'problema' : 'problemi'}
            </span>
          </div>
          <p className="text-xs text-gray-400 font-medium truncate">{card.indirizzo}, {card.citta}</p>
        </div>
        <ChevronRight size={16} className="text-gray-300 group-hover:text-[#94b0ab] shrink-0 mt-1 transition-colors" />
      </button>

      <div className="px-5 pb-4 pt-1 space-y-2">
        {card.documentiDaFare.length > 0 && (
          <div className="rounded-xl border border-gray-100 bg-gray-50/40 px-3 py-2">
            <div className="flex items-center gap-1.5 mb-1.5">
              <FileText size={12} className="text-sky-500" />
              <span className="text-[0.65rem] font-bold uppercase tracking-wider text-sky-700">
                Documenti da caricare ({card.documentiDaFare.length})
              </span>
            </div>
            <ul className="space-y-1 pl-4 list-disc marker:text-gray-300">
              {card.documentiDaFare.map((doc) => (
                <li key={doc} className="text-xs text-gray-700">{doc}</li>
              ))}
            </ul>
          </div>
        )}

        {card.documentiNonInChecklist.length > 0 && (
          <div className="rounded-xl border border-gray-100 bg-gray-50/40 px-3 py-2">
            <div className="flex items-center gap-1.5 mb-1.5">
              <FileText size={12} className="text-purple-500" />
              <span className="text-[0.65rem] font-bold uppercase tracking-wider text-purple-700">
                Documenti non ancora in checklist ({card.documentiNonInChecklist.length})
              </span>
            </div>
            <ul className="space-y-1 pl-4 list-disc marker:text-gray-300">
              {card.documentiNonInChecklist.map((doc) => (
                <li key={doc} className="text-xs text-gray-700">{doc}</li>
              ))}
            </ul>
          </div>
        )}

        {card.stagnazioneMessaggio && (
          <div className="flex items-start gap-2 rounded-xl border border-orange-100 bg-orange-50/40 px-3 py-2">
            <Clock size={13} className="text-orange-500 shrink-0 mt-0.5" />
            <p className="text-xs text-orange-800">{card.stagnazioneMessaggio}</p>
          </div>
        )}

        {card.alertManuali.map((m) => (
          <div key={m.id} className="flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50/40 px-3 py-2">
            <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-800 whitespace-pre-wrap">{m.messaggio}</p>
              <p className="text-[0.6rem] text-gray-400 mt-0.5">
                {format(parseISO(m.created_at), "d MMM yyyy 'alle' HH:mm", { locale: it })}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={(e) => { e.stopPropagation(); onRisolvi(m.id); }}
              className="h-7 shrink-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg px-2"
            >
              <Check size={12} className="mr-1" /> Risolvi
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
};

const PraticaCard = ({ alert, onOpen }: { alert: AlertAutomatico; onOpen: () => void }) => (
  <button
    type="button"
    onClick={onOpen}
    className={cn(
      'group w-full text-left bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-orange-200 transition-all px-5 py-4 flex items-start gap-4',
    )}
  >
    <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center shrink-0">
      <Clock size={18} className="text-orange-500" />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-bold text-gray-900 truncate">{alert.titolo}</p>
      <p className="text-xs text-gray-400 font-medium truncate">{alert.indirizzo}{alert.citta && `, ${alert.citta}`}</p>
      <p className="text-xs text-orange-700 mt-1">{alert.messaggio}</p>
    </div>
    <ChevronRight size={16} className="text-gray-300 group-hover:text-orange-500 shrink-0 mt-1 transition-colors" />
  </button>
);

export default Alerts;
