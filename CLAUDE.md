# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Commands

```bash
npm run dev        # Start dev server (Vite)
npm run build      # Production build
npm run build:dev  # Dev-mode build (for debug/preview)
npm run lint       # ESLint check
npm run preview    # Preview production build
```

No test suite configured.

## Architecture

React 19 SPA — Vite + TypeScript + Tailwind + shadcn/ui. CRM for ITI Bologna real estate agency. All routing is client-side via `react-router-dom` v6.

### Entry points
- `src/App.tsx` — router, `ProtectedRoute` auth guard, all route declarations
- `src/main.tsx` — React root

### Routes

| Route | Page | Notes |
|---|---|---|
| `/` | `Dashboard.tsx` | KPI cards, weekly chart, task widget, mobile FAB |
| `/immobili` | `Properties.tsx` | Property listings + `PropertyWizard` for create/edit |
| `/leads` | `Leads.tsx` | Kanban + list, lead modal with tabs (info, wishlist, task, note) |
| `/tasks` | `Tasks.tsx` | List + board, filters by date/tipologia/stato/agente |
| `/agenda` | `Agenda.tsx` | Calendar via `react-big-calendar` |
| `/valutazioni` | `Valutazioni.tsx` | AI property valuations list + `ValuationWizard` |
| `/report/:slug` | `ValuazioneReport.tsx` | **Public** — no auth guard, shareable PDF-style report |

> `OpenHouses.tsx` exists but has no route in `App.tsx` — do not add it back without confirming.

### Key components

- `src/components/TaskModal.tsx` — task create modal; exports `TIPOLOGIA_CONFIG` (used by Dashboard + Tasks)
- `src/components/layout/AdminLayout.tsx` — sidebar + mobile header shell
- `src/components/properties/PropertyWizard.tsx` — multi-step immobili form
- `src/components/properties/AttendeesSheet.tsx` — open house attendees sheet (used inside property detail)
- `src/components/valutazioni/ValuationWizard.tsx` — 4-step valuation wizard (Lead → Immobile → Comfort → Stima & AI)
- `src/components/ProfileSettingsSheet.tsx` — agent profile settings panel

### Supabase

- **ALWAYS import from** `src/lib/supabase.ts`. The file `src/integrations/supabase/client.ts` is a duplicate — never use it.
- **ALWAYS use** `showSuccess()` / `showError()` from `src/utils/toast.ts`. Never call `toast` directly.
- MCP available: `mcp__claude_ai_Supabase__*`. Use `apply_migration` for DDL, `execute_sql` for queries.
- Project ID: `xzdazmzjltxsxyqokxdh`

### Database schema (key tables)

- `leads` — `nome`, `cognome`, `email`, `telefono`, `stato` (Nuovo/Contattato/Trattativa/Chiuso/Perso), `tipo_cliente` (Acquirente/Venditore), `assegnato_a`, `budget`, `tipologia_ricerca`, `immobile_id`
- `tasks` — `lead_id`, `agente_id`, `tipologia` (Chiamata/WhatsApp/Appuntamento), `stato` (Da fare/In corso/Completata), `data`, `ora`, `nota`
- `immobili` — `titolo`, `prezzo`, `stato`, `zona_id`, `slug`, `in_evidenza`
- `valutazioni` — `indirizzo`, `citta`, `tipologia`, `superficie_mq`, `stato` (Bozza/Completata), `stima_min`, `stima_max`, `motivazione_ai`, `trend_mercato_locale`, `slug`, `lead_id`
- `lead_immobili` — junction leads ↔ immobili with `stato_interesse`
- `lead_zone_ricercate` — junction leads ↔ zone
- `lead_notes` — timestamped notes on leads
- `open_houses` / `prenotazioni_oh` — events and bookings
- `zone` — area master data
- `profili_agenti` — agent profiles (separate from `auth.users`)

### RPC functions

- `upsert_lead(p_nome, p_cognome, p_email, p_telefono, p_messaggio?, p_immobile_id?, p_immobile_interesse?)` — called by ITI2.0 contact form; deduplicates by email/phone. SECURITY DEFINER.

### AI valuation

The `/valutazioni` module calls a Supabase Edge Function that uses OpenAI. The key is stored as Supabase secret `OPENAI_API_KEY` (see `SETUP_OPENAI.md`). Do not hardcode API keys anywhere.

### Styling

- Teal brand: `#94b0ab`
- Cards: `rounded-[2rem]` / `rounded-[2.5rem]`; buttons/inputs: `rounded-xl` / `rounded-2xl`
- UI primitives from `src/components/ui/` (shadcn/ui + Radix)
- Class merging: `cn()` from `src/lib/utils.ts`

### Related repo

`ITI2.0` (sibling directory) — public property website. Its `ContactForm.tsx` calls `upsert_lead` on this Supabase project.

## Security

### RLS policies

| Table | Operation | Allowed roles | Notes |
|---|---|---|---|
| `leads` | SELECT | `authenticated` | CRM agents only |
| `leads` | INSERT | `anon`, `authenticated` | Public contact form via `upsert_lead` SECURITY DEFINER RPC only |
| `leads` | UPDATE | `authenticated` | CRM agents only |
| `immobili` | SELECT | `anon`, `authenticated` | Public listing site reads |
| `immobili` | ALL | `authenticated` | CRM agents only for write ops |
| `open_houses` | SELECT | `anon`, `authenticated` | Public event listing |
| `open_houses` | INSERT/UPDATE/DELETE | `authenticated` | CRM agents only |
| `prenotazioni_oh` | SELECT | `anon`, `authenticated` | Public read for booking confirmation |
| `prenotazioni_oh` | INSERT | `anon`, `authenticated` | Public booking form |
| `prenotazioni_oh` | DELETE | `authenticated` | **Agents only** — never expose to anon |
| `tasks`, `valutazioni`, `lead_notes`, `lead_immobili`, `lead_zone_ricercate` | ALL | `authenticated` | Internal CRM only |
| `zone_omi` | SELECT | `anon`, `authenticated` | OMI data is public |
| `zone_omi` | ALL | `service_role` | Edge Functions / admin scripts only |
| `transazioni_chiuse` | SELECT/INSERT/UPDATE | `authenticated` | Agents + own-row write |
| `transazioni_chiuse` | ALL | `service_role` | Edge Functions retain full access |

### upsert_lead RPC hardening

- **SECURITY DEFINER** + `SET search_path TO 'public'` — prevents search_path injection
- **Email regex validation** — rejects malformed email before any DB write
- **24-hour duplicate guard** — if the same email was used to create a lead in the last 24 h, the call is silently ignored (prevents contact-form spam flooding `note_interne`)
- **Deduplication** — looks up existing lead by email OR phone; updates instead of inserting a second row
- The old unsafe overload `upsert_lead(p_nome, p_email, p_telefono, p_messaggio, ...)` (no cognome, plain INSERT, no dedup, no search_path) has been dropped

### ITI2.0 ContactForm — required client-side hardening (TODO)

The public contact form in the `ITI2.0` sibling repo should implement:
- **30-second submit cooldown** after a successful submission (disable button, show toast)
- **Email regex validation** before calling the RPC (fail fast on the client)
These are defence-in-depth measures; the DB-level guards above remain the authoritative enforcement layer.
