export interface User {
  id: string;
  email: string;
}

export interface Session {
  user: User;
  access_token: string;
  expires_at?: number;
}

export interface AgentProfile {
  id: string;
  user_id: string;
  nome_completo: string | null;
  colore_calendario: string | null;
  avatar_url: string | null;
  sidebar_collapsed?: boolean;
  ruolo?: 'Admin' | 'Agente' | 'Segreteria';
}

export interface Lead {
  id: string;
  nome: string;
  cognome: string;
  email: string;
  telefono: string;
  stato: 'Nuovo' | 'Contattato' | 'Trattativa' | 'Chiuso' | 'Perso';
  tipo_cliente: 'Acquirente' | 'Proprietario' | 'Ibrido';
  budget?: number;
  tipologia_ricerca?: string;
  immobile_id?: string;
  created_at: string;
  updated_at: string;
}

export interface Property {
  id: string;
  created_at?: string;
  titolo: string;
  prezzo?: number;
  mq?: number;
  locali?: string;
  bagni?: number;
  piano?: string;
  indirizzo: string;
  descrizione?: string;
  classe_energetica?: string;
  garage?: boolean;
  stato: 'Disponibile' | 'Venduto' | 'Bozza';
  copertina_url?: string;
  immagini_urls?: string[];
  slug?: string;
  stanze?: number;
  giardino?: boolean;
  balcone?: boolean;
  in_evidenza?: boolean;
  link_immobiliare?: string;
  spese_condominiali?: number;
  stato_immobile?: string;
  anno_costruzione?: number;
  caratteristiche?: string[];
  proprietario?: string;
  citta: string;
  is_deleted?: boolean;
  deleted_at?: string;
  visibile?: boolean;
  proprietario_id?: string;
  zona_venditore?: string;
  motivazione_vendita?: string;
  scadenza_esclusiva?: string;
  scheda_completa?: boolean;
  venduto?: boolean;
  zona_omi_id?: string;
  tipologia?: string;
}

export type FasePipeline = 'In Vendita' | 'Venduto' | 'Archivio';

export type FaseProprietario = 'Contatto' | 'Incontro/Sopralluogo' | 'Rivalutazione' | 'Presa in carico';

export interface Proprietario {
  id: string;
  agente_id?: string | null;
  nome: string;
  cognome?: string | null;
  email?: string | null;
  telefono?: string | null;
  professione?: string | null;
  note_interne?: string | null;
  is_deleted: boolean;
  deleted_at?: string | null;
  _version: number;
  created_at: string;
}

export interface ProprietarioPratica {
  id: string;
  proprietario_id: string;
  via: string;
  tipologia?: string | null;
  citta?: string | null;
  fase: FaseProprietario;
  zona_venditore?: string | null;
  motivazione_vendita?: string | null;
  scadenza_esclusiva?: string | null;
  valutazione_stimata?: number | null;
  immobile_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ImmobilePipelineStato {
  id: string;
  immobile_id: string;
  fase: FasePipeline;
  updated_at: string;
}

export interface DocumentoCatalogo {
  id: string;
  fase: FasePipeline;
  documento: string;
  ordine: number;
}

export interface ImmobileDocumento {
  id: string;
  immobile_id: string;
  fase: FasePipeline;
  documento: string;
  stato: 'Da fare' | 'Fatto';
  responsabile_id?: string;
  completato_at?: string;
  created_at: string;
  drive_file_id?: string | null;
}

export interface ProprietarioPraticaDocumento {
  id: string;
  pratica_id: string;
  fase: FaseProprietario;
  documento: string;
  stato: 'Da fare' | 'Fatto';
  completato_at?: string | null;
  created_at: string;
}

export interface ImmobileAlert {
  id: string;
  immobile_id: string;
  messaggio: string;
  creato_da?: string | null;
  risolto: boolean;
  created_at: string;
  risolto_at?: string | null;
}

export type AlertEntitaTipo = 'immobile' | 'proprietario';
export type AlertDestinatario = 'agente_responsabile' | 'tutti';

export interface AlertRegola {
  id: string;
  entita_tipo: AlertEntitaTipo;
  fase: FasePipeline | FaseProprietario;
  giorni_soglia: number;
  destinatario: AlertDestinatario;
  attiva: boolean;
  created_at: string;
  updated_at: string;
}

export interface LeadRicerca {
  id: string;
  lead_id: string;
  budget?: number;
  zone_ricercate?: string[];
  tipologia_ricerca?: string[];
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  lead_id: string;
  agente_id: string;
  tipologia: 'Chiamata' | 'WhatsApp' | 'Appuntamento';
  stato: 'Da fare' | 'In corso' | 'Completata';
  data: string;
  ora?: string;
  nota?: string;
}

export interface ImmobileUnita {
  id: string;
  immobile_id: string;
  tipologia: string;
  superficie_mq: number;
  piano: string;
  bagni: number;
  camere: number;
  terrazzo: boolean;
  prezzo: number | null;
  stato: 'Disponibile' | 'Riservato' | 'Venduto';
  created_at: string;
}

export interface Valutazione {
  id: string;
  indirizzo: string;
  citta: string;
  tipologia?: string;
  superficie_mq: number;
  stima_min: number;
  stima_max: number;
  motivazione_ai?: string;
  trend_mercato_locale?: string;
  stato: 'Bozza' | 'Completata';
  slug?: string;
  lead_id?: string;
  created_at: string;
}
