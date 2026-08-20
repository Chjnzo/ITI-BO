/**
 * collaudo-rls.mjs
 * -----------------
 * Collaudo RLS di sola lettura: verifica, usando il client anon pubblico (mai la
 * service role key), che le policy SELECT si comportino come documentato in
 * CLAUDE.md — tabelle pubbliche leggibili da anon, tabelle interne no.
 *
 * Esegue query SELECT contro la produzione reale, senza scrivere nulla: sicuro da
 * lanciare in qualsiasi momento.
 *
 * TODO: le asserzioni INSERT/UPDATE/DELETE (per verificare anche le policy di
 * scrittura per ruolo) richiedono uno stack locale isolato — vedi
 * docs/riferimento/ambiente_locale.md. Non vanno eseguite contro produzione.
 *
 * Run with: node scripts/collaudo-rls.mjs
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('❌  Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false }
})

// Tabelle che CLAUDE.md documenta come leggibili da anon (SELECT pubblico)
const PUBLIC_READABLE_TABLES = ['immobili', 'open_houses', 'prenotazioni_oh', 'zone_omi']

// Tabelle che CLAUDE.md documenta come interne — anon non deve vedere righe
const INTERNAL_ONLY_TABLES = [
  'leads', 'tasks', 'valutazioni', 'lead_notes', 'lead_immobili', 'lead_zone_ricercate',
]

let failures = 0

const checkPublicReadable = async (table) => {
  const { error } = await supabase.from(table).select('id').limit(1)
  if (error) {
    console.error(`❌  ${table}: atteso leggibile da anon, ma errore: ${error.message}`)
    failures++
  } else {
    console.log(`✅  ${table}: leggibile da anon come atteso`)
  }
}

const checkInternalOnly = async (table) => {
  const { data, error } = await supabase.from(table).select('id').limit(1)
  if (!error && data && data.length > 0) {
    console.error(`❌  ${table}: atteso vuoto/bloccato per anon, ma ha restituito righe`)
    failures++
  } else {
    console.log(`✅  ${table}: bloccato/vuoto per anon come atteso`)
  }
}

for (const table of PUBLIC_READABLE_TABLES) {
  await checkPublicReadable(table)
}
for (const table of INTERNAL_ONLY_TABLES) {
  await checkInternalOnly(table)
}

if (failures > 0) {
  console.error(`\n${failures} controllo/i RLS falliti.`)
  process.exit(1)
}
console.log('\nTutti i controlli RLS di sola lettura sono passati.')
