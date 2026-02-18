import { createClient } from '@supabase/supabase-js';

// Utilizziamo le credenziali dirette del progetto per garantire la connettività
// ed evitare problemi con le variabili d'ambiente mancanti nel bundle.
const SUPABASE_URL = "https://xzdazmzjltxsxyqokxdh.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6ZGF6bXpqbHR4c3h5cW9reGRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3ODI5MjEsImV4cCI6MjA4NjM1ODkyMX0.lqaAMzXcoPmvULj_vRM9RReb_UjnhC_GIo87opiRX70";

/**
 * Client Supabase configurato manualmente.
 * Questa istanza è il punto unico di accesso per tutte le operazioni sul database
 * e assicura che gli header 'apikey' siano sempre inclusi nelle richieste.
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);