"use client";

import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import AdminLayout from '@/components/layout/AdminLayout';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Clock, FileWarning, Check, BellOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAlerts, type AlertAutomatico, type AlertManuale } from '@/hooks/useAlerts';

const Alerts = () => {
  const navigate = useNavigate();
  const { manuali, automatici, isLoading, risolviAlert } = useAlerts();

  const apriImmobile = (immobileId: string) => {
    navigate('/immobili', { state: { openImmobileId: immobileId } });
  };

  const apriAutomatico = (alert: AlertAutomatico) => {
    if (alert.entita === 'immobile') {
      navigate('/immobili', { state: { openImmobileId: alert.entitaId } });
    } else {
      navigate('/proprietari', { state: { openPraticaId: alert.entitaId } });
    }
  };

  const totale = manuali.length + automatici.length;

  return (
    <AdminLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-[#1a1a1a]">Alert</h1>
        <p className="text-gray-500 mt-1">
          Promemoria manuali su immobili e segnalazioni automatiche (fasi ferme, documenti non generati) su immobili e pratiche proprietari.
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
        <div className="space-y-8 max-w-3xl">
          {manuali.length > 0 && (
            <section>
              <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">
                Alert manuali ({manuali.length})
              </h2>
              <div className="space-y-2">
                {manuali.map((alert) => (
                  <ManualeCard
                    key={alert.id}
                    alert={alert}
                    onOpen={() => apriImmobile(alert.immobile_id)}
                    onRisolvi={() => risolviAlert(alert.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {automatici.length > 0 && (
            <section>
              <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">
                Alert automatici ({automatici.length})
              </h2>
              <div className="space-y-2">
                {automatici.map((alert) => (
                  <AutomaticoCard key={alert.id} alert={alert} onOpen={() => apriAutomatico(alert)} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </AdminLayout>
  );
};

const ManualeCard = ({ alert, onOpen, onRisolvi }: { alert: AlertManuale; onOpen: () => void; onRisolvi: () => void }) => (
  <div className="flex items-center gap-3 bg-white border-l-4 border-amber-400 rounded-2xl px-4 py-3 shadow-sm hover:shadow-md transition-shadow">
    <AlertTriangle size={18} className="text-amber-500 shrink-0" />
    <button type="button" onClick={onOpen} className="flex-1 min-w-0 text-left">
      <p className="text-sm font-semibold text-gray-800 truncate">
        {alert.immobile ? `${alert.immobile.titolo} — ${alert.immobile.indirizzo}, ${alert.immobile.citta}` : 'Immobile'}
      </p>
      <p className="text-sm text-gray-600">{alert.messaggio}</p>
      <p className="text-xs text-gray-400 mt-0.5">{format(parseISO(alert.created_at), "d MMM yyyy 'alle' HH:mm", { locale: it })}</p>
    </button>
    <Button type="button" variant="ghost" size="sm" className="shrink-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={onRisolvi}>
      <Check size={16} className="mr-1" /> Risolvi
    </Button>
  </div>
);

const AutomaticoCard = ({ alert, onOpen }: { alert: AlertAutomatico; onOpen: () => void }) => {
  const Icon = alert.tipo === 'stagnazione' ? Clock : FileWarning;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'flex items-center gap-3 bg-white border-l-4 rounded-2xl px-4 py-3 shadow-sm hover:shadow-md transition-shadow w-full text-left',
        alert.tipo === 'stagnazione' ? 'border-orange-400' : 'border-sky-400',
      )}
    >
      <Icon size={18} className={cn('shrink-0', alert.tipo === 'stagnazione' ? 'text-orange-500' : 'text-sky-500')} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">
          {alert.titolo} — {alert.indirizzo}, {alert.citta}
        </p>
        <p className="text-sm text-gray-600">{alert.messaggio}</p>
      </div>
    </button>
  );
};

export default Alerts;
