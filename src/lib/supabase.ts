import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Mancano le variabili d'ambiente di Supabase. Assicurati di aver collegato l'integrazione.");
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');