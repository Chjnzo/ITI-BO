import { supabase } from '@/lib/supabase';

type AuditChanges = Record<string, unknown>;

export const logAudit = async (
  leadId: string,
  changes: AuditChanges,
  author = 'Sistema',
): Promise<void> => {
  const entries = Object.entries(changes)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join('; ');
  if (!entries) return;

  await supabase.from('lead_notes').insert({
    lead_id: leadId,
    testo: `[Audit] ${entries}`,
    autore: author,
  });
};
