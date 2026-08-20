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
}

export interface Lead {
  id: string;
  nome: string;
  cognome: string;
  email: string;
  telefono: string;
  stato: 'Nuovo' | 'Contattato' | 'Trattativa' | 'Chiuso' | 'Perso';
  tipo_cliente: 'Acquirente' | 'Venditore' | 'Ibrido';
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
  stato: 'Disponibile' | 'In Trattativa' | 'Venduto' | 'Bozza';
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
