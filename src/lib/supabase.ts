import { supabase as client } from '../integrations/supabase/client';

/**
 * Client Supabase centralizzato.
 * Utilizzare sempre questa istanza per garantire che le API Key siano incluse negli header.
 */
export const supabase = client;