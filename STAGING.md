# Staging Environment — ITI-BO

## Progetti Supabase

| Ambiente | Project ID | URL |
|---|---|---|
| **Produzione** | `xzdazmzjltxsxyqokxdh` | `https://xzdazmzjltxsxyqokxdh.supabase.co` |
| **Staging** | `ipgvfyyxtdetysuegioe` | `https://ipgvfyyxtdetysuegioe.supabase.co` |

---

## Flusso obbligatorio per ogni modifica strutturale

```
1. Scrivi la migration SQL (supabase/migrations/<timestamp>_<nome>.sql)
2. Applicala PRIMA su staging:
       mcp apply_migration → project_id: ipgvfyyxtdetysuegioe
3. Verifica che funzioni (avvia dev:staging, testa manualmente le feature)
4. Solo dopo approvazione esplicita, applica la stessa migration su produzione:
       mcp apply_migration → project_id: xzdazmzjltxsxyqokxdh
```

**Regola d'oro:** nessuna migration tocca la produzione senza essere passata per staging.

---

## Avvio locale in modalità staging

```bash
npm run dev:staging
```

Carica `.env.staging` (escluso da git) con le chiavi del progetto staging.

---

## Edge Functions su staging

Le seguenti Edge Function sono deployate su staging ma **volutamente non operative** per i servizi esterni elencati — le chiavi non sono configurate per design, non per errore:

| Function | Dipendenza esterna | Stato su staging |
|---|---|---|
| `generate-evaluation` | OpenAI GPT-4o | Deploy OK, OPENAI_API_KEY non impostata |
| `notify-new-lead` | Resend (email) | Deploy OK, RESEND_API_KEY non impostata |
| `sync-zone-omi` | URL CSV OMI | Deploy OK, OMI_CSV_URL non impostata |

Le function senza dipendenze esterne funzionano normalmente:
- `generate-pdf` — genera PDF da dati già in DB
- `geocode-address` — usa Nominatim (pubblico, no chiave)
- `find-location-data` — legge DB staging via service role

Per abilitare le chiavi esterne su staging (es. per test AI), usare:
```
mcp set_secret → project_id: ipgvfyyxtdetysuegioe → name: OPENAI_API_KEY
```
Questa è una decisione consapevole da prendere esplicitamente.

---

## Dati di test

Il DB staging contiene dati palesemente fittizi inseriti dalla migration `seed_staging_data`:
- 5 immobili fittizi (slug: `*-test-*`, `*-staging-*`)
- 5 lead fittizi (email `*@staging-test.local`)
- Tipologie appuntamenti di default

**Non importare mai dati reali di clienti su staging.**

---

## Deploy su Cloudflare Pages (sito demo)

- **URL pubblico:** `https://iti-bo-staging.pages.dev`
- **Progetto Pages:** `iti-bo-staging`
- Supabase puntato: `ipgvfyyxtdetysuegioe` (staging)

### Re-deploy manuale (workflow attuale)

```bash
# 1. Build con env vars staging
VITE_SUPABASE_URL=https://ipgvfyyxtdetysuegioe.supabase.co \
VITE_SUPABASE_ANON_KEY=<chiave-anon-staging> \
npm run build

# 2. Upload su Cloudflare Pages
wrangler pages deploy dist --project-name iti-bo-staging --branch main --commit-dirty=true
```

Le VITE_ variables sono embed a build time nel JS — non servono come secret Pages runtime.
