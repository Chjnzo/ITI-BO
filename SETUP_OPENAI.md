# Setup OpenAI API Key per Tab Valutazioni

Questa guida spiega come configurare l'API Key di OpenAI nel progetto Supabase.

## Step 1: Ottenere l'API Key da OpenAI

Se non l'hai già, crea un'API Key su [https://platform.openai.com/account/api-keys](https://platform.openai.com/account/api-keys)

La key sarà simile a: `sk-proj-xxxxxxxxxxxxxxxxxxxxxxxx`

## Step 2: Configurare il Secret in Supabase

Hai due opzioni:

### Opzione A: Via Dashboard Supabase (Consigliato)

1. Vai su [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Seleziona il tuo progetto (`xzdazmzjltxsxyqokxdh`)
3. Naviga a **Settings → Edge Functions → Secrets**
4. Clicca **Create a new secret**
5. Compila così:
   - **Name:** `OPENAI_API_KEY`
   - **Value:** `sk-proj-...` (incolla la tua API Key)
6. Clicca **Create secret**

### Opzione B: Via Supabase CLI

Se usi Supabase CLI in locale:

```bash
supabase secrets set OPENAI_API_KEY="sk-proj-xxxxx"
supabase secrets push
```

## Step 3: Verificare che Funzioni

Una volta configurata la secret:

1. Nella pagina Properties, vai al tab **Valutazioni**
2. Clicca **Nuova Valutazione**
3. Compila il form con i dati di un immobile
4. Clicca **Genera Valutazione**

L'Edge Function `generate-evaluation` userà automaticamente la secret OPENAI_API_KEY per chiamare OpenAI GPT-4o-mini.

## Cosa Succede Dietro le Quinte

1. **Frontend:** Quando clicchi "Genera Valutazione", il form manda una richiesta all'Edge Function `/functions/v1/generate-evaluation`

2. **Edge Function:** La function riceve i dati:
   - indirizzo
   - citta
   - metri_quadri
   - tipologia
   - condizioni (stato conservativo)
   - comfort (dotazioni)

3. **OpenAI:** La function chiama OpenAI GPT-4o-mini con un prompt strutturato per ottenere:
   - Descrizione della zona (trasporti, servizi, punti di forza)
   - Razionale della valutazione
   - Stima prezzo minimo e massimo
   - Trend storico dei prezzi al m² (2018-2026)

4. **Database:** I risultati vengono salvati nella tabella `valutazioni` con:
   - `stima_min` e `stima_max` (range di prezzo stimato)
   - `motivazione_ai` (razionale della valutazione)
   - `trend_mercato_locale` (dati JSONB con andamento prezzi)
   - `stato: 'Bozza'` (per eventuali edizioni future)

## Costi OpenAI

GPT-4o-mini è il modello più economico di OpenAI:
- ~$0.02 per valutazione (stimato)
- Perfetto per volume medio di valutazioni

Se vuoi monitorare i costi:
1. Vai su [https://platform.openai.com/account/billing/overview](https://platform.openai.com/account/billing/overview)
2. Imposta un limite di spesa mensile

## Troubleshooting

### "OPENAI_API_KEY not set"
La secret non è configurata in Supabase. Ripeti Step 2.

### "OpenAI error: 401"
L'API Key è scaduta o non valida. Genera una nuova key su OpenAI Platform.

### "OpenAI error: 429"
Rate limit raggiunto. Aspetta qualche minuto prima di generare altre valutazioni.

### "Errore: Could not parse JSON"
L'Edge Function ha ricevuto una risposta non valida da OpenAI. Verifica:
- Formato dei dati inviati
- Che il prompt sia corretto

## File Rilevanti

- **Edge Function:** `/supabase/functions/generate-evaluation/index.ts`
  - Contiene la logica di integrazione con OpenAI
  - Usa GPT-4o-mini come modello

- **Frontend Component:** `/src/components/properties/ValuationForm.tsx`
  - Form per inserire i dati dell'immobile
  - Chiama l'Edge Function
  - Mostra i risultati della valutazione

- **Page:** `/src/pages/Properties.tsx`
  - Tab "Valutazioni" per gestire tutte le valutazioni
  - Lista di valutazioni generate
  - Modal per visualizzare i dettagli

## Prossimi Passi Opzionali

1. **Export PDF:** Aggiungere generazione di PDF della valutazione
2. **Linked Leads:** Collegare valutazioni a lead specifici
3. **AI Improvements:** Raffinare il prompt di OpenAI per risultati più accurati
4. **Price Tracking:** Tracciare come variano le valutazioni nel tempo
