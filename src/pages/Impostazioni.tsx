import { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ShieldCheck, Home, KeyRound, UserCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAgentRoles, type AgentRoleRow } from '@/hooks/useAgentRoles';
import { useCurrentProfile } from '@/hooks/useCurrentProfile';
import { useAlertRegole } from '@/hooks/useAlertRegole';
import ProfileSettingsSheet from '@/components/ProfileSettingsSheet';
import type { AlertRegola } from '@/types';

interface AgentProfile {
  id: string;
  nome_completo: string | null;
  colore_calendario: string | null;
  avatar_url: string | null;
}

const RUOLI: AgentRoleRow['ruolo'][] = ['Admin', 'Agente', 'Segreteria'];
const DESTINATARI: AlertRegola['destinatario'][] = ['tutti', 'agente_responsabile'];
const DESTINATARIO_LABEL: Record<AlertRegola['destinatario'], string> = {
  tutti: 'Tutti gli agenti',
  agente_responsabile: 'Solo agente responsabile',
};

const Impostazioni = () => {
  const { data: agenti, isLoading: agentiLoading, aggiornaRuolo } = useAgentRoles();
  const { data: currentProfile } = useCurrentProfile();
  const { data: regole, isLoading: regoleLoading, aggiornaRegola } = useAlertRegole();

  const [myProfile, setMyProfile] = useState<AgentProfile | null>(null);
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);

  useEffect(() => {
    let aborted = false;
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user || aborted) return;
      const { data } = await supabase
        .from('profili_agenti')
        .select('id, nome_completo, colore_calendario, avatar_url')
        .eq('id', user.id)
        .single();
      if (!aborted) setMyProfile(data as AgentProfile | null);
    });
    return () => { aborted = true; };
  }, []);

  const handleChange = (agente: AgentRoleRow, nuovoRuolo: AgentRoleRow['ruolo']) => {
    if (agente.id === currentProfile?.id && agente.ruolo === 'Admin' && nuovoRuolo !== 'Admin') {
      const confermato = window.confirm(
        'Stai per rimuovere il tuo stesso ruolo di Admin. Se procedi perderai l\'accesso a questa pagina. Continuare?',
      );
      if (!confermato) return;
    }
    aggiornaRuolo({ id: agente.id, ruolo: nuovoRuolo });
  };

  return (
    <AdminLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-[#1a1a1a]">Impostazioni</h1>
        <p className="text-gray-500 mt-1">Assegna il ruolo (Admin / Agente / Segreteria) a ciascun agente registrato.</p>
      </div>

      <div className="max-w-2xl mb-12 bg-white rounded-[2rem] border border-gray-100 shadow-sm px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <UserCircle2 size={18} className="text-[#94b0ab] shrink-0" />
          <div className="min-w-0">
            <span className="font-medium text-gray-800 truncate block">{myProfile?.nome_completo ?? 'Il tuo profilo'}</span>
            <span className="text-xs text-gray-400">Nome, colore calendario e immagine profilo</span>
          </div>
        </div>
        <Button type="button" variant="outline" onClick={() => setProfileSheetOpen(true)} disabled={!myProfile} className="shrink-0">
          Modifica profilo
        </Button>
      </div>

      {agentiLoading ? (
        <p className="text-sm text-gray-400 italic">Caricamento...</p>
      ) : (
        <div className="max-w-2xl bg-white rounded-[2rem] border border-gray-100 shadow-sm divide-y divide-gray-100">
          {(agenti ?? []).map((agente) => (
            <div key={agente.id} className="flex items-center justify-between gap-4 px-6 py-4">
              <div className="flex items-center gap-2 min-w-0">
                {agente.ruolo === 'Admin' && <ShieldCheck size={16} className="text-[#94b0ab] shrink-0" />}
                <span className="font-medium text-gray-800 truncate">{agente.nome_completo ?? 'Senza nome'}</span>
              </div>
              <Select value={agente.ruolo} onValueChange={(value) => handleChange(agente, value as AgentRoleRow['ruolo'])}>
                <SelectTrigger className="w-40 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RUOLI.map((ruolo) => (
                    <SelectItem key={ruolo} value={ruolo}>{ruolo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      )}

      <div className="mt-12 mb-8">
        <h2 className="text-2xl font-extrabold text-[#1a1a1a]">Regole di alert automatico</h2>
        <p className="text-gray-500 mt-1">
          Per ogni fase, dopo quanti giorni fermo segnalare un alert di stagnazione e a chi mostrarlo.
        </p>
      </div>

      {regoleLoading ? (
        <p className="text-sm text-gray-400 italic">Caricamento...</p>
      ) : (
        <div className="max-w-3xl space-y-6">
          <RegoleGroup
            titolo="Pipeline immobili"
            icon={Home}
            regole={(regole ?? []).filter((r) => r.entita_tipo === 'immobile')}
            onSave={aggiornaRegola}
          />
          <RegoleGroup
            titolo="Pipeline proprietari"
            icon={KeyRound}
            regole={(regole ?? []).filter((r) => r.entita_tipo === 'proprietario')}
            onSave={aggiornaRegola}
          />
        </div>
      )}

      {myProfile && (
        <ProfileSettingsSheet
          open={profileSheetOpen}
          onClose={() => setProfileSheetOpen(false)}
          profile={myProfile}
          userId={myProfile.id}
          onSaved={(updated) => setMyProfile(updated)}
        />
      )}
    </AdminLayout>
  );
};

const RegoleGroup = ({
  titolo,
  icon: Icon,
  regole,
  onSave,
}: {
  titolo: string;
  icon: typeof Home;
  regole: AlertRegola[];
  onSave: (args: { id: string; giorni_soglia: number; destinatario: AlertRegola['destinatario']; attiva: boolean }) => void;
}) => (
  <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
    <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100 bg-gray-50/50">
      <Icon size={16} className="text-[#94b0ab]" />
      <span className="font-bold text-sm text-gray-700">{titolo}</span>
    </div>
    <div className="divide-y divide-gray-100">
      {regole.map((regola) => (
        <RegolaRow key={regola.id} regola={regola} onSave={onSave} />
      ))}
    </div>
  </div>
);

const RegolaRow = ({
  regola,
  onSave,
}: {
  regola: AlertRegola;
  onSave: (args: { id: string; giorni_soglia: number; destinatario: AlertRegola['destinatario']; attiva: boolean }) => void;
}) => {
  // Stato locale solo per il campo numerico (serve un commit su blur, non ad
  // ogni tasto premuto — altrimenti un giorni_soglia parziale es. "" durante
  // la digitazione genererebbe update non validi). Select/Switch mutano
  // subito, stesso pattern del Select ruolo sopra.
  const [giorniInput, setGiorniInput] = useState(String(regola.giorni_soglia));

  const commitGiorni = () => {
    const parsed = parseInt(giorniInput, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setGiorniInput(String(regola.giorni_soglia));
      return;
    }
    if (parsed !== regola.giorni_soglia) {
      onSave({ id: regola.id, giorni_soglia: parsed, destinatario: regola.destinatario, attiva: regola.attiva });
    }
  };

  return (
    <div className="flex items-center justify-between gap-4 px-6 py-3">
      <span className={regola.attiva ? 'font-medium text-gray-800' : 'font-medium text-gray-400'}>{regola.fase}</span>
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            min={1}
            value={giorniInput}
            onChange={(e) => setGiorniInput(e.target.value)}
            onBlur={commitGiorni}
            disabled={!regola.attiva}
            className="w-16 h-9 text-center"
          />
          <span className="text-xs text-gray-400">giorni</span>
        </div>
        <Select
          value={regola.destinatario}
          onValueChange={(value) =>
            onSave({ id: regola.id, giorni_soglia: regola.giorni_soglia, destinatario: value as AlertRegola['destinatario'], attiva: regola.attiva })
          }
          disabled={!regola.attiva}
        >
          <SelectTrigger className="w-48 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DESTINATARI.map((d) => (
              <SelectItem key={d} value={d}>{DESTINATARIO_LABEL[d]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Switch
          checked={regola.attiva}
          onCheckedChange={(checked) =>
            onSave({ id: regola.id, giorni_soglia: regola.giorni_soglia, destinatario: regola.destinatario, attiva: checked })
          }
        />
      </div>
    </div>
  );
};

export default Impostazioni;
