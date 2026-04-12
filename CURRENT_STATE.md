# CURRENT_STATE.md
> Analysis Date: 2026-04-12 | Project: Il Tuo Immobiliare – Real Estate Valuation MVP v1.0

---

## ✅ EXISTING ASSETS

### Database Tables (Supabase, schema managed via dashboard)

| Table | Key Fields | Status |
|---|---|---|
| `valutazioni` | `indirizzo`, `citta`, `tipologia`, `superficie_mq`, `stato` (Bozza/Completata), `stima_min`, `stima_max`, `motivazione_ai`, `trend_mercato_locale` (JSONB), `slug`, `lead_id`, `agente_id`, `note_tecniche` | ✅ Full schema present |
| `immobili` | `titolo`, `prezzo`, `mq`, `locali`, `citta`, `zona`, `indirizzo`, `piano`, `bagni`, `classe_energetica`, `stato_immobile`, `caratteristiche[]`, `copertina_url`, `immagini_urls[]`, `slug`, `in_evidenza` | ✅ Full schema present |
| `leads` | `nome`, `cognome`, `email`, `telefono`, `stato`, `tipo_cliente`, `assegnato_a`, `budget`, `tipologia_ricerca`, `immobile_id` | ✅ Present |
| `profili_agenti` | `nome_completo` + agent identity fields | ✅ Present |
| `open_houses` | `data_evento`, `immobile_id` | ✅ Present |
| `prenotazioni_oh` | Bookings for open house events | ✅ Present |
| `zone` | Area master data | ✅ Referenced in code |
| `lead_immobili` | Junction: leads ↔ immobili with `stato_interesse` | ✅ Present |
| `lead_zone_ricercate` | Junction: leads ↔ zone | ✅ Present |
| `lead_notes` | Timestamped notes on leads | ✅ Present |

**Missing tables:** `transazioni_chiuse`, OMI zone price data — not found anywhere in codebase.

---

### Edge Functions (`supabase/functions/`)

#### `generate-evaluation/index.ts`
- Calls OpenAI GPT-4o-mini with property data (address, sqm, typology, condition, comfort list)
- Returns: `descrizione_zona`, `razionale_valutazione`, `stima_min`, `stima_max`, `trend_prezzi[]` (year + price/sqm from 2018 to current)
- Uses Supabase secret `OPENAI_API_KEY` (no hardcoded keys)
- Strips markdown fences from AI JSON response
- CORS enabled for all origins

#### `generate-pdf/index.ts`
- Accepts `slug`, fetches valuation from DB using SERVICE_ROLE_KEY (RLS bypass for public sharing)
- Generates A4 PDF using `pdf-lib@1.17.1`
- Layout: teal header, 2-column specs, price range, AI analysis section, amenities badges, footer
- Returns `pdf_base64`

---

### Frontend Pages & Components

#### Valuation Module
| File | Route | Description |
|---|---|---|
| `src/pages/Valutazioni.tsx` | `/valutazioni` | Protected list view — table with Lead, Indirizzo, MQ, Stima, Stato, Data columns; "Nuova Valutazione" CTA |
| `src/pages/ValuazioneReport.tsx` | `/report/:slug` | **Public** (no auth guard) — hero card, price range, Recharts trend LineChart, amenities, AI analysis section, PDF download button |
| `src/components/valutazioni/ValuationWizard.tsx` | (modal) | 4-step wizard: Lead → Immobile data → Comfort/amenities → Stima & AI generation |

**ValuationWizard steps in detail:**
1. Lead selection (optional, searchable combobox with `ilike`)
2. Property data: address, city, sqm, typology, condition, rooms, bathrooms, year, energy class
3. Comfort toggles: box auto, parking, cantina, giardino, ascensore + technical notes
4. AI generation CTA → displays `stima_min`/`stima_max` → manual override toggle → save

**Post-save automation:** Sets lead `stato_venditore = "Valutazione fatta"` + inserts auto-note in `lead_notes`.

#### Property Module
| File | Route | Description |
|---|---|---|
| `src/pages/Properties.tsx` | `/immobili` | Paginated table (10/page), tab filter (In Vendita/Venduti), search, inline actions |
| `src/components/properties/PropertyWizard.tsx` | (modal) | 5-step wizard: Main data → Specs → Photos (WebP compressed) → Location → Review |
| `src/components/properties/AttendeesSheet.tsx` | (sheet) | Open house attendee management |

#### Other Modules
| File | Route | Description |
|---|---|---|
| `src/pages/Dashboard.tsx` | `/` | KPI cards, weekly chart, task widget, mobile FAB |
| `src/pages/Leads.tsx` | `/leads` | Kanban + list, lead modal with tabs (info, wishlist, task, note) |
| `src/pages/Tasks.tsx` | `/tasks` | List + board with filters |
| `src/pages/Agenda.tsx` | `/agenda` | Calendar via `react-big-calendar` |
| `src/components/layout/AdminLayout.tsx` | (shell) | Sidebar + mobile header |

---

### Infrastructure & Config
- Supabase project ID: `xzdazmzjltxsxyqokxdh`
- Storage bucket: `immobili` (property images as WebP)
- Auth: Supabase Auth + `ProtectedRoute` HOC in `App.tsx`
- Supabase client: `src/lib/supabase.ts` (canonical)
- RPC: `upsert_lead(...)` — deduplicates by email/phone, SECURITY DEFINER
- Build: Vite + React 19 + TypeScript + Tailwind + shadcn/ui

---

## ❌ MISSING FEATURES

### Database / Backend
- **`transazioni_chiuse` table** — no table found for closed transaction comparables; AI currently generates synthetic `trend_prezzi` via GPT rather than real OMI/market data
- **OMI zone table** — no actual OMI (Osservatorio del Mercato Immobiliare) price-per-zone data loaded; valuation relies entirely on AI inference
- **SQL migration files** — `supabase/migrations/` directory does not exist; schema is unversioned (dashboard-only)
- **Geocoding integration** — OpenStreetMap Nominatim is referenced in the MVP spec but not implemented in any Edge Function or frontend component
- **Rate limiting / quota management** — no OpenAI cost tracking, metering, or per-agent quota enforcement beyond Supabase dashboard alerts
- **Error boundaries** — no React error boundary components around AI generation or Edge Function calls

### Frontend
- **Valuation edit flow** — no evidence of edit-mode for existing valuations (PropertyWizard has edit mode; ValuationWizard appears create-only)
- **Valuation search/filter** — list page has no search bar or status filter (unlike Properties page which has both)
- **Lead ↔ Valuation deep link** — no UI in Leads module to navigate directly to a lead's associated valuations
- **Mobile optimization for ValuazioneReport** — public report page layout not verified for mobile breakpoints
- **`OpenHouses.tsx`** — component exists but has no route in `App.tsx` (intentionally excluded per CLAUDE.md)

---

## 🔧 REFACTORING NEEDED

### Duplicate / Deprecated Files
- **`src/components/properties/ValuationForm.tsx`** — untracked file (appears in `git status`), likely a deprecated alternate to `ValuationWizard.tsx`; needs review and removal or promotion
- **`src/integrations/supabase/client.ts`** — duplicate Supabase client; CLAUDE.md explicitly forbids its use; should be deleted to prevent accidental imports

### Schema Alignment
- **`trend_mercato_locale` column** — stored as JSONB; the Edge Function returns `trend_prezzi[]` (array of `{anno, prezzo_mq}`); verify column name consistency between what the function returns and what the report page reads
- **Lead automation (fire-and-forget)** — CRM update after valuation save uses fire-and-forget pattern with no error handling; a failed update silently drops the status change and auto-note

### Edge Functions
- **`generate-pdf` uses SERVICE_ROLE_KEY** — intentional for public slug access (bypasses RLS), but the key must be verified as a Supabase secret, not hardcoded
- **`generate-evaluation` CORS** — currently `Access-Control-Allow-Origin: *`; should be scoped to production domain in production config
- **No input validation in Edge Functions** — both functions trust all input fields; missing Zod/manual validation for required fields before calling OpenAI or pdf-lib

### Frontend
- **`ValuationWizard.tsx` local state** — manages 25+ form fields via individual `useState` calls; a `useReducer` or form library (React Hook Form) would reduce re-render surface and simplify validation logic
- **`ValuazioneReport.tsx` PDF download** — uses inline async handler; should be extracted to a hook to allow loading state and retry logic

---

## 📝 IMPLEMENTATION NOTES

### What Is Working End-to-End
The full valuation flow is functionally complete:
> User fills ValuationWizard → AI generates estimate via Edge Function → Record saved to `valutazioni` → Slug auto-generated → Public report at `/report/:slug` renders with chart + PDF download

### Architecture Strengths
- **Public report sharing** via slug is correctly implemented with no auth requirement on `ValuazioneReport.tsx`
- **Brand consistency** maintained across all components (teal `#94b0ab`, `rounded-[2rem]` cards, shadcn/ui primitives)
- **Image pipeline** is production-ready: client-side WebP compression → Supabase Storage → public URL stored in DB
- **CRM automation** on valuation save is a meaningful UX feature (auto-updates lead status + creates note)

### Architecture Constraints
- **No SSR / Next.js** — this is a pure React SPA (Vite), not Next.js as the MVP spec mentions; all routing is client-side; public `/report/:slug` page is not server-rendered and will not be indexed by search engines
- **No migrations directory** — schema changes require manual coordination via Supabase dashboard; high risk of drift between environments
- **No test suite** — `npm test` is not configured; no unit or integration tests exist

### AI Valuation Quality
- GPT-4o-mini generates both the price estimate AND the synthetic market trend data (`trend_prezzi`); this means trend charts show AI-generated historical prices, not real transaction data
- Estimated cost: ~$0.02 per valuation (per `SETUP_OPENAI.md`)
- No OMI data integration means valuations are entirely AI-inferred — suitable for MVP, insufficient for professional-grade appraisals

### Security Surface
- `generate-pdf` Edge Function uses SERVICE_ROLE_KEY — correct for bypassing RLS on public slugs, but must remain as a Supabase secret only
- `upsert_lead` RPC is SECURITY DEFINER — intentionally broad for the public-facing contact form; ensure input sanitization at call sites
- No CAPTCHA or rate limiting on public report or PDF generation endpoints
