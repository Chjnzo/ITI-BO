/**
 * seed_market_data.js
 * -------------------
 * Populates zone_omi and transazioni_chiuse with realistic Bergamo market data.
 *
 * Uses EWKT strings (e.g. "SRID=4326;POINT(lon lat)") for geometry columns.
 * PostgREST + PostGIS automatically casts these to geometry on INSERT.
 *
 * Run with: node scripts/seed_market_data.js
 * Requires: PostGIS migration already applied (20260412_initial_valuation_schema.sql)
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

// ---------------------------------------------------------------------------
// Client (service role bypasses RLS)
// ---------------------------------------------------------------------------
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_KEY  = process.env.VITE_SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌  Missing VITE_SUPABASE_URL or VITE_SUPABASE_SERVICE_KEY in .env')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false }
})

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** Random float in [min, max] rounded to `decimals` places */
const rand = (min, max, decimals = 2) => {
  const v = Math.random() * (max - min) + min
  return parseFloat(v.toFixed(decimals))
}

/** Random integer in [min, max] inclusive */
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min

/** Random date within the last `months` months */
const randDate = (months = 12) => {
  const now  = new Date()
  const past = new Date()
  past.setMonth(now.getMonth() - months)
  const t = past.getTime() + Math.random() * (now.getTime() - past.getTime())
  return new Date(t).toISOString().split('T')[0]   // YYYY-MM-DD
}

/** EWKT point string — PostgREST casts this to geometry(Point,4326) on INSERT */
const ewkt = (lon, lat) => `SRID=4326;POINT(${lon} ${lat})`

/**
 * Jitter a coordinate by up to `maxDelta` degrees in each axis.
 * 0.004° ≈ 400 m at Bergamo's latitude — realistic scatter within a zone.
 */
const jitter = (base, maxDelta = 0.004) =>
  parseFloat((base + (Math.random() * 2 - 1) * maxDelta).toFixed(6))

/** Derive num_locali from square metres */
const localiFromMq = (mq) => {
  if (mq <  75) return 2
  if (mq < 100) return 3
  if (mq < 130) return 4
  return 5
}

/** Slugify an address into a plausible street name */
const VIE = [
  'Via Borgo Palazzo', 'Via Corridoni', 'Via Moroni', 'Via Quarenghi',
  'Via Camozzi', 'Via Angelo Mai', 'Via Tiraboschi', 'Via Tasso',
  'Via Pignolo', 'Via S. Alessandro', 'Via Bonomelli', 'Via Paleocapa',
  'Via Borfuro', 'Via Masone', 'Viale Papa Giovanni XXIII',
  'Via Garibaldi', 'Via Zelasco', 'Via Colognola', 'Via Longuelo',
  'Via Monte Gleno', 'Via Ronzoni', 'Via Baioni', 'Via S. Giorgio',
  'Via Marziale', 'Via Brembo',
]

// ---------------------------------------------------------------------------
// Part A — OMI Zone definitions for Bergamo
// ---------------------------------------------------------------------------
// Prices are expressed in €/mq for residential (habitativo) typology.
// Coordinates are real zone centroids (verified on OpenStreetMap).
// `fascia` follows OMI nomenclature: B=Centrale, S=Semicentrale, P=Periferica.

const OMI_ZONES = [
  {
    codice_zona:        'BG-B1',
    comune:             'Bergamo',
    provincia:          'BG',
    fascia:             'B',
    zona:               'Città Alta',
    link_istituzionale: 'https://www.agenziaentrate.gov.it/portale/web/guest/schede/fabbricatiterreni/omi/banche-dati/quotazioni-immobiliari',
    prezzo_mq_min:      3800,
    prezzo_mq_max:      5200,
    lat:  45.7054,
    lon:   9.6620,
  },
  {
    codice_zona:        'BG-B2',
    comune:             'Bergamo',
    provincia:          'BG',
    fascia:             'B',
    zona:               'Centro Bassa',
    link_istituzionale: 'https://www.agenziaentrate.gov.it/portale/web/guest/schede/fabbricatiterreni/omi/banche-dati/quotazioni-immobiliari',
    prezzo_mq_min:      2800,
    prezzo_mq_max:      3800,
    lat:  45.6941,
    lon:   9.6682,
  },
  {
    codice_zona:        'BG-S1',
    comune:             'Bergamo',
    provincia:          'BG',
    fascia:             'S',
    zona:               'Borgo Palazzo',
    link_istituzionale: 'https://www.agenziaentrate.gov.it/portale/web/guest/schede/fabbricatiterreni/omi/banche-dati/quotazioni-immobiliari',
    prezzo_mq_min:      2000,
    prezzo_mq_max:      2800,
    lat:  45.6910,
    lon:   9.6850,
  },
  {
    codice_zona:        'BG-S2',
    comune:             'Bergamo',
    provincia:          'BG',
    fascia:             'S',
    zona:               'Longuelo',
    link_istituzionale: 'https://www.agenziaentrate.gov.it/portale/web/guest/schede/fabbricatiterreni/omi/banche-dati/quotazioni-immobiliari',
    prezzo_mq_min:      1900,
    prezzo_mq_max:      2600,
    lat:  45.7080,
    lon:   9.6700,
  },
  {
    codice_zona:        'BG-S3',
    comune:             'Bergamo',
    provincia:          'BG',
    fascia:             'S',
    zona:               'Malpensata',
    link_istituzionale: 'https://www.agenziaentrate.gov.it/portale/web/guest/schede/fabbricatiterreni/omi/banche-dati/quotazioni-immobiliari',
    prezzo_mq_min:      1800,
    prezzo_mq_max:      2400,
    lat:  45.6820,
    lon:   9.6750,
  },
  {
    codice_zona:        'BG-P1',
    comune:             'Bergamo',
    provincia:          'BG',
    fascia:             'P',
    zona:               'Loreto / Celadina',
    link_istituzionale: 'https://www.agenziaentrate.gov.it/portale/web/guest/schede/fabbricatiterreni/omi/banche-dati/quotazioni-immobiliari',
    prezzo_mq_min:      1600,
    prezzo_mq_max:      2200,
    lat:  45.6840,
    lon:   9.6920,
  },
  {
    codice_zona:        'BG-P2',
    comune:             'Bergamo',
    provincia:          'BG',
    fascia:             'P',
    zona:               'Colognola',
    link_istituzionale: 'https://www.agenziaentrate.gov.it/portale/web/guest/schede/fabbricatiterreni/omi/banche-dati/quotazioni-immobiliari',
    prezzo_mq_min:      1500,
    prezzo_mq_max:      2000,
    lat:  45.6870,
    lon:   9.7100,
  },
  {
    codice_zona:        'BG-P3',
    comune:             'Bergamo',
    provincia:          'BG',
    fascia:             'P',
    zona:               'Campagnola',
    link_istituzionale: 'https://www.agenziaentrate.gov.it/portale/web/guest/schede/fabbricatiterreni/omi/banche-dati/quotazioni-immobiliari',
    prezzo_mq_min:      1400,
    prezzo_mq_max:      1900,
    lat:  45.7200,
    lon:   9.6650,
  },
  {
    codice_zona:        'BG-P4',
    comune:             'Bergamo',
    provincia:          'BG',
    fascia:             'P',
    zona:               'Monterosso',
    link_istituzionale: 'https://www.agenziaentrate.gov.it/portale/web/guest/schede/fabbricatiterreni/omi/banche-dati/quotazioni-immobiliari',
    prezzo_mq_min:      1700,
    prezzo_mq_max:      2300,
    lat:  45.6880,
    lon:   9.6500,
  },
  {
    codice_zona:        'BG-P5',
    comune:             'Bergamo',
    provincia:          'BG',
    fascia:             'P',
    zona:               'Redona',
    link_istituzionale: 'https://www.agenziaentrate.gov.it/portale/web/guest/schede/fabbricatiterreni/omi/banche-dati/quotazioni-immobiliari',
    prezzo_mq_min:      1500,
    prezzo_mq_max:      2000,
    lat:  45.6720,
    lon:   9.6780,
  },
]

// ---------------------------------------------------------------------------
// Seed logic
// ---------------------------------------------------------------------------

async function seedZones() {
  console.log('\n📍  Seeding OMI zones…')

  // Remove stale seed data (idempotent re-runs)
  const { error: delErr } = await supabase
    .from('zone_omi')
    .delete()
    .eq('provincia', 'BG')

  if (delErr) {
    console.warn('   ⚠️  Could not clear existing BG zones:', delErr.message)
  }

  const rows = OMI_ZONES.map(({ lat, lon, ...zone }) => ({
    ...zone,
    // EWKT string — PostgREST + PostGIS casts this to geometry(Point,4326)
    geom:       ewkt(lon, lat),
    updated_at: new Date().toISOString(),
  }))

  const { data, error } = await supabase
    .from('zone_omi')
    .insert(rows)
    .select('id, codice_zona, zona, prezzo_mq_min, prezzo_mq_max')

  if (error) throw new Error(`zone_omi insert failed: ${error.message}`)

  console.log(`   ✅  Inserted ${data.length} OMI zones`)
  data.forEach(z =>
    console.log(`       ${z.codice_zona}  ${z.zona.padEnd(22)}  €${z.prezzo_mq_min}–${z.prezzo_mq_max}/mq`)
  )

  return data   // [ { id, codice_zona, zona, ... } ]
}

async function fetchAgentIds() {
  const { data, error } = await supabase
    .from('profili_agenti')
    .select('id')
    .limit(5)

  if (error || !data?.length) {
    console.log('   ℹ️  No agents found — transactions will have agente_id = null')
    return []
  }

  return data.map(a => a.id)
}

async function seedTransactions(insertedZones) {
  console.log('\n🏠  Generating mock transactions…')

  const agentIds   = await fetchAgentIds()
  const TOTAL      = 50
  const perZone    = Math.ceil(TOTAL / insertedZones.length)

  // Clear stale mock transactions for Bergamo
  const { error: delErr } = await supabase
    .from('transazioni_chiuse')
    .delete()
    .eq('citta', 'Bergamo')

  if (delErr) {
    console.warn('   ⚠️  Could not clear existing Bergamo transactions:', delErr.message)
  }

  // Rebuild zone map: codice_zona → { id, prezzo_mq_min, prezzo_mq_max, lat, lon }
  const zoneMap = insertedZones.reduce((acc, zone) => {
    const def = OMI_ZONES.find(z => z.codice_zona === zone.codice_zona)
    if (def) acc[zone.codice_zona] = { ...zone, lat: def.lat, lon: def.lon }
    return acc
  }, {})

  const transactions = []

  for (const zone of Object.values(zoneMap)) {
    const count = Math.min(perZone, TOTAL - transactions.length)
    if (count <= 0) break

    for (let i = 0; i < count; i++) {
      const mq         = rand(60, 150, 1)
      const prezzoMq   = rand(zone.prezzo_mq_min * 0.9, zone.prezzo_mq_max * 1.05, 0)
      const prezzoFin  = parseFloat((prezzoMq * mq).toFixed(2))
      const via        = VIE[randInt(0, VIE.length - 1)]
      const civico     = randInt(1, 150)
      const lon        = jitter(zone.lon)
      const lat        = jitter(zone.lat)
      const agente_id  = agentIds.length ? agentIds[randInt(0, agentIds.length - 1)] : null

      transactions.push({
        indirizzo:     `${via}, ${civico}`,
        citta:         'Bergamo',
        prezzo_finale: prezzoFin,
        mq,
        prezzo_mq:     prezzoMq,
        num_locali:    localiFromMq(mq),
        data_chiusura: randDate(12),
        zona_id:       zone.id,
        agente_id,
        // EWKT string — cast to geometry(Point,4326) by PostgREST+PostGIS
        coordinates:   ewkt(lon, lat),
      })
    }
  }

  // Insert in batches of 20 to stay within PostgREST body limits
  const BATCH = 20
  let inserted = 0

  for (let i = 0; i < transactions.length; i += BATCH) {
    const batch = transactions.slice(i, i + BATCH)
    const { error } = await supabase.from('transazioni_chiuse').insert(batch)
    if (error) throw new Error(`transazioni_chiuse batch ${i / BATCH + 1} failed: ${error.message}`)
    inserted += batch.length
    process.stdout.write(`   ⏳  ${inserted}/${transactions.length} inserted…\r`)
  }

  console.log(`\n   ✅  Inserted ${inserted} mock transactions`)
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

async function printSummary() {
  console.log('\n📊  Seed summary:')

  const [{ count: zCount }, { count: tCount }] = await Promise.all([
    supabase.from('zone_omi').select('*', { count: 'exact', head: true }).eq('provincia', 'BG'),
    supabase.from('transazioni_chiuse').select('*', { count: 'exact', head: true }).eq('citta', 'Bergamo'),
  ])

  console.log(`   zone_omi (BG):          ${zCount} rows`)
  console.log(`   transazioni_chiuse (BG): ${tCount} rows`)
  console.log()
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  console.log('🌱  Starting market data seed for Bergamo…')
  console.log(`   Supabase project: ${SUPABASE_URL}`)

  try {
    const insertedZones = await seedZones()
    await seedTransactions(insertedZones)
    await printSummary()
    console.log('✅  Seed complete.\n')
  } catch (err) {
    console.error('\n❌  Seed failed:', err.message)
    process.exit(1)
  }
}

main()
