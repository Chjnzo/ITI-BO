-- Aggiunge un flag "urgente" alle task, per evidenziarle in rosso in tutte le
-- viste (Tasks.tsx, Dashboard.tsx, tab task del lead in Leads.tsx).
alter table public.tasks
  add column urgente boolean not null default false;
