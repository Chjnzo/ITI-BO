export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
  sentryDsn: import.meta.env.VITE_SENTRY_DSN as string | undefined,
};

export function validateEnv(): void {
  const required: Array<keyof typeof env> = ['supabaseUrl', 'supabaseAnonKey'];
  const missing = required.filter(k => !env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}. Check .env.example`);
  }
}
