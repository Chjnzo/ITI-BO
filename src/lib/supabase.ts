import { createClient, Session } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// DEBUG TEMPORANEO 2026-09-30: espone il client in console per riprodurre
// isolatamente la chiamata a drive-documenti fuori dal ciclo di vita React
// (investigazione preflight-CORS-ok-ma-POST-mai-inviato). Da rimuovere a
// investigazione conclusa.
if (typeof window !== 'undefined') {
  (window as unknown as { __supabase: typeof supabase }).__supabase = supabase;
}

export const setupSessionManagement = (callback: (session: Session | null) => void) => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    async (event, session) => {
      if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
        callback(null);
      } else if (event === 'TOKEN_REFRESHED') {
        if (session) {
          callback(session);
        } else {
          // Refresh token invalido/scaduto: pulisci la sessione locale e manda al login
          await supabase.auth.signOut({ scope: 'local' });
          callback(null);
        }
      } else if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
        callback(session);
      }
    }
  );
  return () => subscription.unsubscribe();
};
