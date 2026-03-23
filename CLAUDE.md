# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start dev server (Vite)
npm run build      # Production build
npm run lint       # ESLint check
npm run preview    # Preview production build
```

No test suite is configured.

## Architecture

Single-page React 19 app built with Vite + TypeScript. All routing is client-side via `react-router-dom` v6. The app is a CRM for a real estate agency (ITI Bologna).

### Entry points
- `src/App.tsx` — router, auth guard (`ProtectedRoute`), route declarations
- `src/main.tsx` — React root mount

### Pages (`src/pages/`)
| Route | Page | Description |
|---|---|---|
| `/` | `Dashboard.tsx` | KPI cards, weekly bar chart, "Task di oggi" widget, mobile FAB |
| `/immobili` | `Properties.tsx` | Property listings with wizard for create/edit |
| `/leads` | `Leads.tsx` | CRM leads — kanban + list view, full lead modal with tabs (info, wishlist, task, notes) |
| `/tasks` | `Tasks.tsx` | Task management — list + board view, filters (date, tipologia, stato, agente) |
| `/agenda` | `Agenda.tsx` | Calendar via `react-big-calendar` |
| `/open-houses` | `OpenHouses.tsx` | Open house event management |

### Key components
- `src/components/TaskModal.tsx` — modal for creating tasks; exports `TIPOLOGIA_CONFIG` (used by Dashboard and Tasks to render tipologia icons/colors)
- `src/components/layout/AdminLayout.tsx` — sidebar + mobile header shell wrapping all pages
- `src/components/properties/PropertyWizard.tsx` — multi-step form for immobili
- `src/components/properties/OpenHouseManager.tsx` — open house CRUD inside property detail

### Supabase
- Client: `src/lib/supabase.ts` (single export `supabase`). Credentials are hardcoded (anon key, safe to commit).
- There is also `src/integrations/supabase/client.ts` — a duplicate client; prefer `src/lib/supabase.ts`.
- Toast helpers: `src/utils/toast.ts` — always use `showSuccess()` / `showError()` from here, never call `toast` directly.
- The Supabase MCP is available (`mcp__claude_ai_Supabase__*`) — use `apply_migration` for DDL, `execute_sql` for queries. Project ID: `xzdazmzjltxsxyqokxdh`.

### Database schema (key tables)
- `leads` — CRM contacts. Key fields: `nome`, `cognome`, `email`, `telefono`, `stato` (Nuovo/Contattato/Trattativa/Chiuso/Perso), `tipo_cliente` (Acquirente/Venditore), `assegnato_a`, `note_interne`, `budget`, `tipologia_ricerca`, `immobile_id` (primo contatto)
- `tasks` — activities linked to leads: `lead_id`, `agente_id`, `tipologia` (Chiamata/WhatsApp/Appuntamento), `stato` (Da fare/In corso/Completata), `data`, `ora`, `nota`
- `immobili` — property listings: `titolo`, `prezzo`, `stato`, `zona_id`, `slug`, `in_evidenza`
- `lead_immobili` — junction: leads ↔ immobili with `stato_interesse`
- `lead_zone_ricercate` — junction: leads ↔ zone
- `lead_notes` — timestamped notes on leads
- `open_houses` / `prenotazioni_oh` — events and their bookings
- `zone` — area/zone master data
- `profili_agenti` — agent profiles (separate from `auth.users`; a `profiles` table may also exist)

### RPC functions
- `upsert_lead(p_nome, p_cognome, p_email, p_telefono, p_messaggio?, p_immobile_id?, p_immobile_interesse?)` — used by the public ITI2.0 website contact form; deduplicates by email/phone, links property interest in `lead_immobili`. SECURITY DEFINER to bypass RLS.

### Styling conventions
- Tailwind CSS with a teal brand color `#94b0ab` used throughout.
- Rounded corners: cards use `rounded-[2rem]` or `rounded-[2.5rem]`; buttons/inputs use `rounded-xl` or `rounded-2xl`.
- All UI primitives come from `src/components/ui/` (shadcn/ui based on Radix).
- `cn()` from `src/lib/utils.ts` for conditional class merging.

### Related repo
`ITI2.0` (sibling directory) is the public-facing property website that calls the `upsert_lead` RPC. `ContactForm.tsx` in that repo sends leads into this Supabase project.
