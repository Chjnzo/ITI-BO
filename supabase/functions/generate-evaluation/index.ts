import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ZonaOmi {
  id: string;
  codice_zona: string;
  comune: string;
  provincia: string;
  fascia: string;
  zona: string;
  prezzo_mq_min: number;
  prezzo_mq_max: number;
  prezzo_mq_medio: number;
}

interface Comparabile {
  id: string;
  indirizzo: string;
  prezzo_finale: number;
  mq: number;
  prezzo_mq: number;
  num_locali: number;
  data_chiusura: string;
  distanza_metri: number;
}

interface AiResult {
  stima_min: number;
  stima_max: number;
  stima_breakdown: Record<string, unknown>;
  motivazione_ai: string;
  trend_mercato_locale: Array<{ anno: number; prezzo_mq: number }>;
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildPrompt(params: {
  indirizzo: string;
  citta: string;
  superficie_mq: number;
  tipologia: string;
  stato_conservativo: string;
  piano: string | null;
  ascensore: boolean | null;
  ha_giardino: boolean | null;
  ha_box: boolean | null;
  ha_posto_auto: boolean | null;
  ha_cantina: boolean | null;
  num_locali: number | null;
  num_bagni: number | null;
  anno_costruzione: number | null;
  classe_energetica: string | null;
  zona_omi: ZonaOmi | null;
  comparabili: Comparabile[];
}): string {
  const features: string[] = [];
  if (params.piano) features.push(`Piano: ${params.piano}`);
  if (params.ascensore != null) features.push(params.ascensore ? "Con ascensore" : "Senza ascensore");
  if (params.ha_giardino) features.push("Con giardino");
  if (params.ha_box) features.push("Con box auto");
  if (params.ha_posto_auto) features.push("Con posto auto");
  if (params.ha_cantina) features.push("Con cantina");
  if (params.num_locali) features.push(`${params.num_locali} locali`);
  if (params.num_bagni) features.push(`${params.num_bagni} bagni`);
  if (params.anno_costruzione) features.push(`Anno costruzione: ${params.anno_costruzione}`);
  if (params.classe_energetica) features.push(`Classe energetica: ${params.classe_energetica}`);

  let omiBlock = `[MODALITÀ ANALISI DI MERCATO GENERALE — DATI OMI NON DISPONIBILI]
Nessun dato OMI ufficiale è disponibile per questa zona. NON inventare codici di zona OMI (es. "BG-C1", "BG-R2") né range di prezzo specifici. Basa la stima esclusivamente sulle tendenze generali del comune di ${params.citta} e sulle caratteristiche dell'immobile.`;
  if (params.zona_omi) {
    omiBlock = `Dati OMI ufficiali (Agenzia delle Entrate):
- Codice zona: ${params.zona_omi.codice_zona}
- Fascia: ${params.zona_omi.fascia}
- Zona descrizione: ${params.zona_omi.zona}
- Comune: ${params.zona_omi.comune} (${params.zona_omi.provincia})
- Range prezzi/mq: €${params.zona_omi.prezzo_mq_min} – €${params.zona_omi.prezzo_mq_max} (medio: €${params.zona_omi.prezzo_mq_medio}/mq)
IMPORTANTE: Cita esplicitamente il codice zona OMI "${params.zona_omi.codice_zona}" nella motivazione.`;
  }

  let comparabiliBlock = `[ZERO TRANSAZIONI COMPARABILI DISPONIBILI]
Non sono disponibili dati di compravendita recenti nel raggio di 1.5km. NON inventare indirizzi, vie o prezzi di transazione. Nella motivazione scrivi ESATTAMENTE: "Dati di compravendita locali non disponibili per questo micro-settore; la stima è basata su modelli statistici OMI e benchmark qualitativi de Il Tuo Immobiliare."
NON scrivere frasi come "in via X sono stati registrati valori di Y €/mq" se via X non compare nell'elenco comparabili sopra.`;
  if (params.comparabili.length > 0) {
    const rows = params.comparabili
      .map((c) =>
        `  - ${c.indirizzo} (${Math.round(c.distanza_metri)}m di distanza): ${c.mq}mq, prezzo totale €${c.prezzo_finale.toLocaleString("it-IT")}, €${c.prezzo_mq}/mq, ${c.num_locali} locali, rogitato il ${c.data_chiusura}`
      )
      .join("\n");
    comparabiliBlock = `Transazioni comparabili nelle vicinanze (raggio 1.5km, ${params.comparabili.length} rilevate):\n${rows}`;
  }

  const dataMode = params.zona_omi && params.comparabili.length > 0
    ? "MODALITÀ COMPLETA (dati OMI + comparabili disponibili)"
    : params.zona_omi
    ? "MODALITÀ PARZIALE (solo dati OMI, nessun comparabile)"
    : params.comparabili.length > 0
    ? "MODALITÀ PARZIALE (solo comparabili, nessun dato OMI)"
    : "MODALITÀ ANALISI GENERALE (né OMI né comparabili — applica politica Verità o Silenzio)";

  return `[${dataMode}]

Immobile da valutare:
- Tipo: ${params.tipologia}
- Indirizzo: ${params.indirizzo}, ${params.citta}
- Superficie: ${params.superficie_mq} mq
- Stato conservativo: ${params.stato_conservativo}
${features.length > 0 ? `- Caratteristiche: ${features.join(", ")}` : ""}

${omiBlock}

${comparabiliBlock}`;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "No auth header", success: false }), {
      status: 401,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });

  try {
    const {
      valutazione_id,
      indirizzo,
      citta,
      superficie_mq,
      tipologia,
      stato_conservativo,
      piano = null,
      ascensore = null,
      ha_giardino = null,
      ha_box = null,
      ha_posto_auto = null,
      ha_cantina = null,
      num_locali = null,
      num_bagni = null,
      anno_costruzione = null,
      classe_energetica = null,
    } = await req.json();

    console.log("Starting evaluation for:", valutazione_id, "| indirizzo:", indirizzo, "| citta:", citta, "| mq:", superficie_mq, "| tipologia:", tipologia);

    if (!valutazione_id || !indirizzo || !citta || !superficie_mq || !tipologia) {
      return json({ error: "Campi obbligatori mancanti: valutazione_id, indirizzo, citta, superficie_mq, tipologia.", success: false }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    console.log("Env check — SUPABASE_URL:", supabaseUrl ? "ok" : "MISSING", "| SERVICE_KEY:", serviceKey ? "ok" : "MISSING", "| OPENAI_KEY:", openaiKey ? "ok" : "MISSING");

    if (!openaiKey) {
      return json({ error: "OPENAI_API_KEY non configurata.", success: false }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // -----------------------------------------------------------------------
    // 1. Geocode via Nominatim (inline, with fallback)
    // -----------------------------------------------------------------------

    // Build a list of query candidates to try in order.
    // Some users type neighborhoods/frazioni as the city (e.g. "Redona, Bergamo").
    // We extract the last comma-separated token as the "main city" for the fallback.
    const cittaRaw = citta.trim();
    const cittaTokens = cittaRaw.split(",").map((s: string) => s.trim()).filter(Boolean);
    // "main" city = last token (e.g. "Bergamo" from "Redona, Bergamo")
    const cittaMain = cittaTokens[cittaTokens.length - 1];

    const geocodeQueries: string[] = [];
    // Attempt 1: full address + full city
    geocodeQueries.push(`${indirizzo.trim()}, ${cittaRaw}`);
    // Attempt 2: full address + main city only (drops neighborhood prefix)
    if (cittaMain !== cittaRaw) {
      geocodeQueries.push(`${indirizzo.trim()}, ${cittaMain}`);
    }
    // Attempt 3: street only + main city (drops civic number, helps with malformed numbers)
    const indirizzoStreet = indirizzo.trim().replace(/\s+\d+[A-Za-z]?\s*$/, "").trim();
    if (indirizzoStreet !== indirizzo.trim()) {
      geocodeQueries.push(`${indirizzoStreet}, ${cittaMain}`);
    }

    const nominatimFetch = async (q: string): Promise<{ lat: number; lng: number } | null> => {
      const params = new URLSearchParams({ format: "json", limit: "1", addressdetails: "1", q });
      const url = `https://nominatim.openstreetmap.org/search?${params}`;
      console.log("Nominatim URL:", url);
      const res = await fetch(url, {
        headers: {
          "User-Agent": "IlTuoImmobiliare-App/1.0 (info@iltuoimmobiliare.it)",
          "Accept-Language": "it",
        },
      });
      if (!res.ok) {
        console.error("Nominatim HTTP error:", res.status);
        return null;
      }
      const results = await res.json();
      console.log(`Nominatim results for "${q}":`, results?.length ?? 0);
      if (!Array.isArray(results) || results.length === 0) return null;
      return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
    };

    let geoCoords: { lat: number; lng: number } | null = null;
    for (const q of geocodeQueries) {
      geoCoords = await nominatimFetch(q);
      if (geoCoords) break;
    }

    if (!geoCoords) {
      return json({
        error: `Nessun risultato geocoding per: "${indirizzo}, ${cittaRaw}". Controlla l'indirizzo.`,
        success: false,
      }, 422);
    }

    const { lat, lng } = geoCoords;
    console.log("Geocoded coords:", lat, lng);

    // -----------------------------------------------------------------------
    // 2. Nearest OMI zone (inline RPC)
    // -----------------------------------------------------------------------
    console.log("Calling nearest_zona_omi RPC — p_lon:", lng, "p_lat:", lat, "p_comune:", citta);

    const { data: zonaId, error: rpcError } = await supabase.rpc("nearest_zona_omi", {
      p_lon: lng,
      p_lat: lat,
      p_comune: citta ?? null,
    });

    if (rpcError) {
      console.error("nearest_zona_omi error:", rpcError.message);
      return json({ error: `Errore RPC nearest_zona_omi: ${rpcError.message}`, success: false }, 500);
    }

    console.log("nearest_zona_omi returned zonaId:", zonaId);

    let zona_omi: ZonaOmi | null = null;
    if (zonaId) {
      const { data: zonaData, error: zonaError } = await supabase
        .from("zone_omi")
        .select("id, codice_zona, comune, provincia, fascia, zona, prezzo_mq_min, prezzo_mq_max, prezzo_mq_medio")
        .eq("id", zonaId)
        .single();

      if (zonaError) {
        console.error("zone_omi fetch error:", zonaError.message);
      } else {
        zona_omi = zonaData as ZonaOmi;
        console.log("Zona OMI:", zona_omi?.codice_zona, "medio:", zona_omi?.prezzo_mq_medio);
      }
    }

    // -----------------------------------------------------------------------
    // 3. Comparabili vicini (inline RPC)
    // -----------------------------------------------------------------------
    console.log("Calling comparabili_vicini RPC");

    const { data: comparabiliRaw, error: compError } = await supabase.rpc("comparabili_vicini", {
      p_lon: lng,
      p_lat: lat,
      p_raggio_m: 1500,
      p_limit: 10,
    });

    if (compError) {
      console.error("comparabili_vicini error:", compError.message);
      // Non-fatal — proceed without comparabili
    }

    const comparabili: Comparabile[] = comparabiliRaw ?? [];
    console.log("Comparabili found:", comparabili.length);

    if (!zona_omi && comparabili.length === 0) {
      console.warn(`[MISSING_DATA_ALERT] No OMI or Comparables for: ${citta}, ${indirizzo}`);
    } else if (!zona_omi) {
      console.warn(`[MISSING_DATA_ALERT] No OMI zone for: ${citta}, ${indirizzo}`);
    } else if (comparabili.length === 0) {
      console.warn(`[MISSING_DATA_ALERT] No comparables for: ${citta}, ${indirizzo}`);
    }

    // -----------------------------------------------------------------------
    // 4. Build prompt and call OpenAI
    // -----------------------------------------------------------------------
    const currentYear = new Date().getFullYear();

    const systemPrompt = `Sei il Direttore Tecnico di "Il Tuo Immobiliare", agenzia immobiliare specializzata nella provincia di Bergamo. Il tuo tono è autorevole, analitico e radicato nella conoscenza del mercato locale bergamasco. Hai accesso a dati OMI ufficiali e a transazioni reali comparabili.

Analizza i dati forniti e restituisci ESCLUSIVAMENTE un oggetto JSON valido con queste chiavi:

- "stima_min": intero — prezzo minimo consigliato in €
- "stima_max": intero — prezzo massimo consigliato in €
- "stima_breakdown": oggetto con i fattori correttivi applicati al prezzo/mq base. Esempio:
  {
    "prezzo_mq_base": 2200,
    "fattori": [
      { "nome": "Piano alto senza ascensore", "delta_percentuale": -8, "nota": "Penalizza l'accessibilità, fattore critico per famiglie con bambini e over 60 nel mercato bergamasco" },
      { "nome": "Giardino privato", "delta_percentuale": 6, "nota": "Plus raro e molto ricercato nell'area, post-2020 la domanda di spazi esterni è aumentata del 35%" }
    ],
    "prezzo_mq_finale": 2074,
    "stima_calcolata": 124440
  }
- "motivazione_ai": testo professionale in italiano strutturato in ESATTAMENTE 3 paragrafi separati da \\n\\n:
  PARAGRAFO 1 — CONTESTO: Analisi approfondita della micro-zona e del trend di mercato locale. Se disponibile, cita il codice zona OMI e il range ufficiale prezzo/mq. NON scrivere frasi generiche come "la zona è ben servita": cita dati concreti (prezzi OMI, fascia, andamento storico). Se i comparabili sono presenti, riporta i valori medi di transazione reali.
  PARAGRAFO 2 — ANALISI TECNICA: Spiega PERCHÉ hai applicato ciascun fattore correttivo specifico, collegandolo alle preferenze degli acquirenti bergamaschi. Ad esempio: ascensore assente al piano alto impatta sulla fascia d'acquirenti anziani o famiglie; giardino privato è raro e valorizzato post-pandemia; stato conservativo "da ristrutturare" può aprire a investitori ma riduce la platea di acquirenti finali. Sii specifico e tecnico.
  PARAGRAFO 3 — CONCLUSIONE STRATEGICA: Consiglio operativo sul range di prezzo per attrarre acquirenti seri nel mercato attuale. Indica se il mercato locale è in fase espansiva, stabile o contrattiva. Se mancano comparabili, dichiaralo esplicitamente specificando che la stima si basa sui modelli statistici OMI e sugli standard valutativi de "Il Tuo Immobiliare".
- "trend_mercato_locale": array di oggetti {anno, prezzo_mq} dal 2018 al ${currentYear}, con valori realistici e coerenti per la zona OMI indicata.

Regole sui fattori correttivi — LEGGI CON ATTENZIONE:
A. Includi ESCLUSIVAMENTE i fattori che modificano effettivamente il prezzo (delta_percentuale != 0).
B. NON includere MAI un fattore con delta_percentuale uguale a 0.
C. NON includere un fattore se la caratteristica è assente o neutra per questo immobile.
   NON restituire MAI righe con "Non applicabile", "N/A", "Nessuno" o valori neutri. Se non hai nulla di rilevante da dire su un aspetto, semplicemente non includerlo nell'array. Esempi:
   - Se non c'è giardino → non includere "Giardino"
   - Se il piano è intermedio e non penalizzante → non includere un fattore piano
   - Se la classe energetica è C (nella media) → non includere un fattore energetico
D. Il campo "nome" deve essere SPECIFICO per questo immobile, mai generico. Esempi:
   - NON scrivere: "Ascensore"
   - SCRIVI invece: "Ascensore presente in edificio anni '70" oppure "Ascensore assente — penalizza l'accesso al piano 5"
   - NON scrivere: "Giardino privato di [dimensione]mq" se la dimensione NON è nei dati forniti
   - SCRIVI invece: "Presenza di area verde ad uso esclusivo" (termine qualitativo) quando la dimensione è sconosciuta
   - NON assumere MAI dimensioni, esposizioni o caratteristiche non esplicitamente fornite nel prompt
E. Il campo "nota" deve spiegare l'impatto concreto sul mercato bergamasco (acquirenti target, rarità, domanda post-pandemia, ecc.).
F. I range orientativi (usa il valore preciso più adatto al caso specifico):
   - Piano terra senza giardino: -5%
   - Piano alto (>3) con ascensore: +4% a +6%
   - Piano alto (>3) senza ascensore: -7% a -10%
   - Giardino privato: +5% a +10% (in base a dimensioni e esposizione)
   - Box auto: +3% a +4%
   - Posto auto scoperto: +1% a +2%
   - Cantina: +1%
   - Stato "da ristrutturare": -15% a -20%
   - Stato "ottimo" o "ristrutturato": +10% a +15%
   - Classe energetica A o B: +5%
   - Classe energetica G: -5%
   - Anno di costruzione ante 1960 senza ristrutturazione: -3% a -5%

REGOLE ASSOLUTE — POLITICA "VERITÀ O SILENZIO":
1. GROUNDING TOTALE: usa SOLO i dati forniti esplicitamente in questo prompt. Non aggiungere nulla che non sia presente nell'input.
2. ZERO ALLUCINAZIONI SU COMPARABILI: se la lista comparabili è vuota, NON inventare indirizzi di strade, prezzi/mq o descrizioni di transazioni. Usa la frase esatta: "Dati di compravendita locali non disponibili per questo micro-settore."
3. ZERO ALLUCINAZIONI SU OMI: se i dati OMI non sono presenti, NON inventare codici zona (es. "BG-C1"), né range di prezzo specifici. Entra in "Modalità Analisi di Mercato Generale" basata solo sulle tendenze comunali.
4. DIMENSIONI SCONOSCIUTE: se una caratteristica è presente (es. giardino = true) ma la dimensione non è fornita, usa SOLO termini qualitativi ("presenza di area verde") — MAI assumere dimensioni.
5. Non usare frasi generiche come "la zona è ben servita dai trasporti" senza dati a supporto.
6. Se i comparabili sono presenti, DEVI citare almeno uno specifico (via e prezzo/mq) nella motivazione.
7. Se i dati OMI sono presenti, DEVI citare il codice zona nella motivazione.
8. Non usare markdown. Rispondi solo con il JSON.
9. L'array "fattori" NON deve mai contenere oggetti con delta_percentuale = 0. Se non ci sono fattori rilevanti, restituisci un array vuoto.`;

    const userPrompt = buildPrompt({
      indirizzo, citta, superficie_mq, tipologia, stato_conservativo,
      piano, ascensore, ha_giardino, ha_box, ha_posto_auto, ha_cantina,
      num_locali, num_bagni, anno_costruzione, classe_energetica,
      zona_omi, comparabili,
    });

    console.log("Calling OpenAI...");

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error("OpenAI error:", openaiRes.status, errText);
      return json({ error: `OpenAI error: ${errText}`, success: false }, 502);
    }

    const openaiData = await openaiRes.json();
    const rawContent = openaiData.choices?.[0]?.message?.content ?? "{}";
    console.log("OpenAI raw response (first 500 chars):", rawContent.slice(0, 500));

    let aiResult: AiResult;
    try {
      aiResult = JSON.parse(rawContent);
    } catch (parseErr) {
      console.error("JSON parse failed. rawContent:", rawContent);
      return json({ error: "Risposta AI non valida (JSON malformato).", success: false }, 502);
    }

    const { stima_min, stima_max, stima_breakdown, motivazione_ai, trend_mercato_locale } = aiResult;

    // -----------------------------------------------------------------------
    // 5. Update valutazioni record
    // -----------------------------------------------------------------------
    const updatePayload: Record<string, unknown> = {
      latitudine: lat,
      longitudine: lng,
      stima_min,
      stima_max,
      stima_breakdown,
      motivazione_ai,
      trend_mercato_locale,
      stato: "Completata",
      updated_at: new Date().toISOString(),
    };

    if (zona_omi) {
      updatePayload.zona_omi_id = zona_omi.id;
      updatePayload.prezzo_mq_zona = zona_omi.prezzo_mq_medio;
    }

    console.log("Updating valutazione record:", valutazione_id);

    const { data: updatedValutazione, error: updateError } = await supabase
      .from("valutazioni")
      .update(updatePayload)
      .eq("id", valutazione_id)
      .select()
      .single();

    if (updateError) {
      console.error("Update error:", updateError.message);
      return json({ error: `Errore salvataggio valutazione: ${updateError.message}`, success: false }, 500);
    }

    // -----------------------------------------------------------------------
    // 6. Link comparabili
    // -----------------------------------------------------------------------
    if (comparabili.length > 0) {
      const rows = comparabili.map((c) => ({
        valutazione_id,
        transazione_id: c.id,
        distanza_metri: c.distanza_metri,
      }));

      const { error: compLinkError } = await supabase
        .from("valutazione_comparabili")
        .upsert(rows, { onConflict: "valutazione_id,transazione_id" });

      if (compLinkError) {
        console.error("Errore salvataggio comparabili:", compLinkError.message);
      }
    }

    console.log("Evaluation complete for:", valutazione_id);

    return json({
      success: true,
      valutazione: updatedValutazione,
      zona_omi,
      comparabili,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Unhandled error:", message);
    return json({ error: message, success: false }, 500);
  }
});
