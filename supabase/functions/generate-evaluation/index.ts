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

  let omiBlock = "Prezzi OMI zona: non disponibili.";
  if (params.zona_omi) {
    omiBlock = `Prezzi OMI zona (${params.zona_omi.codice_zona} – ${params.zona_omi.fascia}):
- Minimo: €${params.zona_omi.prezzo_mq_min}/mq
- Medio: €${params.zona_omi.prezzo_mq_medio}/mq
- Massimo: €${params.zona_omi.prezzo_mq_max}/mq`;
  }

  let comparabiliBlock = "Transazioni comparabili: nessuna disponibile nella zona.";
  if (params.comparabili.length > 0) {
    const rows = params.comparabili
      .map((c) =>
        `  - ${c.indirizzo} (${Math.round(c.distanza_metri)}m): ${c.mq}mq, €${c.prezzo_mq}/mq, chiuso il ${c.data_chiusura}`
      )
      .join("\n");
    comparabiliBlock = `Transazioni comparabili nelle vicinanze (raggio 1.5km):\n${rows}`;
  }

  return `Immobile da valutare:
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
    // 1. Geocode via Nominatim (inline)
    // -----------------------------------------------------------------------
    const address = `${indirizzo.trim()}, ${citta.trim()}`;
    console.log("Geocoding:", address);

    const nominatimParams = new URLSearchParams({ format: "json", limit: "1", addressdetails: "1", q: address });
    const nominatimRes = await fetch(`https://nominatim.openstreetmap.org/search?${nominatimParams}`, {
      headers: {
        "User-Agent": "IlTuoImmobiliare-App/1.0 (info@iltuoimmobiliare.it)",
        "Accept-Language": "it",
      },
    });

    if (!nominatimRes.ok) {
      console.error("Nominatim HTTP error:", nominatimRes.status);
      return json({ error: "Nominatim non disponibile.", success: false }, 502);
    }

    const nominatimResults = await nominatimRes.json();
    console.log("Nominatim results count:", nominatimResults?.length ?? 0);

    if (!Array.isArray(nominatimResults) || nominatimResults.length === 0) {
      return json({ error: "Nessun risultato geocoding per l'indirizzo fornito.", success: false }, 422);
    }

    const lat = parseFloat(nominatimResults[0].lat);
    const lng = parseFloat(nominatimResults[0].lon);
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

    // -----------------------------------------------------------------------
    // 4. Build prompt and call OpenAI
    // -----------------------------------------------------------------------
    const currentYear = new Date().getFullYear();

    const systemPrompt = `Sei un esperto valutatore immobiliare certificato per il mercato italiano, specializzato nella provincia di Bergamo.
Analizza i dati forniti (caratteristiche immobile, prezzi OMI ufficiali, transazioni reali comparabili) e restituisci ESCLUSIVAMENTE un oggetto JSON valido con queste chiavi:

- "stima_min": intero — prezzo minimo consigliato in €
- "stima_max": intero — prezzo massimo consigliato in €
- "stima_breakdown": oggetto con i fattori correttivi applicati al prezzo/mq base. Esempio:
  {
    "prezzo_mq_base": 2200,
    "fattori": [
      { "nome": "Piano alto senza ascensore", "delta_percentuale": -8, "nota": "Penalizza l'accessibilità" },
      { "nome": "Giardino privato", "delta_percentuale": 5, "nota": "Plus raro nella zona" }
    ],
    "prezzo_mq_finale": 2074,
    "stima_calcolata": 124440
  }
- "motivazione_ai": testo professionale in italiano (3-5 paragrafi) che giustifica la stima, descrive la zona, cita i comparabili utilizzati e l'andamento del mercato.
- "trend_mercato_locale": array di oggetti {anno, prezzo_mq} dal 2018 al ${currentYear}, con valori realistici per la zona indicata.

Regole sui fattori correttivi:
- Piano terra (senza giardino): -5%
- Piano alto (>3) con ascensore: +5%
- Piano alto senza ascensore: -8%
- Giardino privato: +5%/+8%
- Box auto: +3%
- Stato "da ristrutturare": -15%/−20%
- Stato "ottimo/ristrutturato": +10%/+15%
- Classe energetica A/B: +5%
- Classe energetica G: -5%

Non usare markdown. Rispondi solo con il JSON.`;

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
