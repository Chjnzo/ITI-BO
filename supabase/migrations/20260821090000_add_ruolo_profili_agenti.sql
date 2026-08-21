-- Introduce un campo ruolo su profili_agenti (Admin/Agente/Segreteria), spec §3.4.
-- Solo schema/dati: nessun enforcement RLS in questa fase, is_admin resta invariato
-- (ancora usato da src/pages/Dashboard.tsx per il filtro client-side).
alter table public.profili_agenti
  add column ruolo text not null default 'Agente'
  check (ruolo in ('Admin', 'Agente', 'Segreteria'));

update public.profili_agenti set ruolo = 'Admin' where is_admin = true;
