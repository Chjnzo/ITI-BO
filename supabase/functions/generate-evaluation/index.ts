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

interface ComparabileAttivo {
  url: string;
  titolo?: string;
  prezzo?: number;
}

interface AiResult {
  stima_min: number;
  stima_max: number;
  stima_breakdown: Record<string, unknown>;
  motivazione_ai: string;
  trend_mercato_locale: Array<{ anno: number; prezzo_mq: number }>;
  descrizione_zona: string;
  stima_ristrutturato_min: number;
  stima_ristrutturato_max: number;
  costo_stima_lavori: number;
  tempo_mercato: string;
  identikit_compratore: string;
  narrativa_dotazioni: string;
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
  ha_terrazzo: boolean | null;
  terrazzo_mq: number | null;
  num_locali: number | null;
  num_camere: number | null;
  num_bagni: number | null;
  anno_costruzione: number | null;
  anno_ristrutturazione: number | null;
  classe_energetica: string | null;
  tipo_riscaldamento: string | null;
  note_tecniche: string | null;
  dotazioni_extra: string[];
  zona_omi: ZonaOmi | null;
  comparabili: Comparabile[];
  poi_summary: string | null;
  comparabili_attivi: ComparabileAttivo[];
}): string {
  const currentYear = new Date().getFullYear();
  const features: string[] = [];

  if (params.piano) features.push(`Piano: ${params.piano}`);
  if (params.ascensore != null) features.push(params.ascensore ? "Con ascensore" : "Senza ascensore");
  if (params.ha_terrazzo) features.push(params.terrazzo_mq ? `Terrazzo privato di ${params.terrazzo_mq} mq` : "Con terrazzo privato");
  if (params.ha_giardino) features.push("Con giardino");
  if (params.ha_box) features.push("Con box auto");
  if (params.ha_posto_auto) features.push("Con posto auto scoperto");
  if (params.ha_cantina) features.push("Con cantina");
  if (params.num_locali) features.push(`${params.num_locali} locali`);
  if (params.num_camere) features.push(`${params.num_camere} camere da letto`);
  if (params.num_bagni) features.push(`${params.num_bagni} bagni`);
  if (params.anno_costruzione) features.push(`Anno costruzione: ${params.anno_costruzione}`);
  if (params.anno_ristrutturazione) features.push(`Ultimo intervento di ristrutturazione: ${params.anno_ristrutturazione} (${currentYear - params.anno_ristrutturazione} anni fa)`);
  if (params.classe_energetica) features.push(`Classe energetica: ${params.classe_energetica}`);
  if (params.tipo_riscaldamento) features.push(`Riscaldamento: ${params.tipo_riscaldamento}`);
  if (params.dotazioni_extra.length > 0) features.push(`Dotazioni aggiuntive: ${params.dotazioni_extra.join(", ")}`);

  let omiBlock = `[MODALITÀ ANALISI DI MERCATO GENERALE — DATI OMI NON DISPONIBILI]
Nessun dato OMI ufficiale è disponibile per questa zona. NON inventare codici di zona OMI (es. "BG-C1", "BG-R2") né range di prezzo specifici. Basa la stima esclusivamente sulle tendenze generali del comune di ${params.citta} e sulle caratteristiche dell'immobile.`;
  if (params.zona_omi) {
    omiBlock = `Dati OMI ufficiali (Agenzia delle Entrate):
- Codice zona: ${params.zona_omi.codice_zona}
- Fascia: ${params.zona_omi.fascia}
- Zona descrizione: ${params.zona_omi.zona}
- Comune: ${params.zona_omi.comune} (${params.zona_omi.provincia})
- Range prezzi/mq: €${params.zona_omi.prezzo_mq_min} – €${params.zona_omi.prezzo_mq_max} (medio: €${params.zona_omi.prezzo_mq_medio}/mq)
IMPORTANTE: Cita esplicitamente il codice zona OMI "${params.zona_omi.codice_zona}" nella motivazione e nella descrizione_zona.`;
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

  let comparabiliAttiviBlock = "";
  if (params.comparabili_attivi.length > 0) {
    const rows = params.comparabili_attivi.map((c, i) => {
      let row = `  ${i + 1}. URL: ${c.url}`;
      if (c.titolo) row += ` — "${c.titolo}"`;
      if (c.prezzo) row += ` — prezzo richiesto: €${c.prezzo.toLocaleString("it-IT")}`;
      return row;
    }).join("\n");
    comparabiliAttiviBlock = `\nConcorrenza attiva sul mercato (annunci attuali forniti dall'agente):\n${rows}\nUsa questi prezzi di lista come riferimento per calibrare il posizionamento competitivo.`;
  }

  let poiBlock = "";
  if (params.poi_summary) {
    poiBlock = `\nServizi nelle vicinanze (raggio 500m — OpenStreetMap): ${params.poi_summary}`;
  }

  let noteTecnicheBlock = "";
  if (params.note_tecniche?.trim()) {
    noteTecnicheBlock = `\nNOTE DELL'AGENTE: ${params.note_tecniche.trim()}`;
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
${poiBlock}
${noteTecnicheBlock}
${omiBlock}

${comparabiliBlock}
${comparabiliAttiviBlock}`;
}

// ---------------------------------------------------------------------------
// Overpass API — POI entro 500m
// ---------------------------------------------------------------------------

async function fetchPoiSummary(lat: number, lng: number): Promise<string | null> {
  try {
    const query = `[out:json][timeout:10];(node["amenity"="school"](around:500,${lat},${lng});node["amenity"="bus_stop"](around:500,${lat},${lng});node["leisure"="park"](around:500,${lat},${lng});node["shop"="supermarket"](around:500,${lat},${lng}););out count;`;
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const json = await res.json() as { elements?: Array<{ tags?: { total?: string; amenity?: string; shop?: string; leisure?: string } }> };
    const tags = json?.elements?.[0]?.tags;
    if (!tags) return null;
    const total = parseInt(tags.total ?? "0", 10);
    if (total === 0) return null;

    const queryDetail = `[out:json][timeout:10];(node["amenity"="school"](around:500,${lat},${lng}););out count;`;
    const queryBus = `[out:json][timeout:10];(node["amenity"="bus_stop"](around:500,${lat},${lng}););out count;`;
    const queryPark = `[out:json][timeout:10];(node["leisure"="park"](around:500,${lat},${lng}););out count;`;
    const querySuper = `[out:json][timeout:10];(node["shop"="supermarket"](around:500,${lat},${lng}););out count;`;

    const fetchCount = async (q: string): Promise<number> => {
      try {
        const r = await fetch("https://overpass-api.de/api/interpreter", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `data=${encodeURIComponent(q)}`,
          signal: AbortSignal.timeout(8000),
        });
        const j = await r.json() as { elements?: Array<{ tags?: { total?: string } }> };
        return parseInt(j?.elements?.[0]?.tags?.total ?? "0", 10);
      } catch { return 0; }
    };

    const [schools, buses, parks, supers] = await Promise.all([
      fetchCount(queryDetail),
      fetchCount(queryBus),
      fetchCount(queryPark),
      fetchCount(querySuper),
    ]);

    const parts: string[] = [];
    if (schools > 0) parts.push(`${schools} ${schools === 1 ? "scuola" : "scuole"}`);
    if (buses > 0) parts.push(`${buses} ${buses === 1 ? "fermata bus" : "fermate bus"}`);
    if (parks > 0) parts.push(`${parks} ${parks === 1 ? "parco" : "parchi"}`);
    if (supers > 0) parts.push(`${supers} ${supers === 1 ? "supermercato" : "supermercati"}`);

    return parts.length > 0 ? parts.join(", ") + " entro 500m" : null;
  } catch (err) {
    console.warn("Overpass API error (non-critical):", err instanceof Error ? err.message : String(err));
    return null;
  }
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
      ha_terrazzo = null,
      terrazzo_mq = null,
      num_locali = null,
      num_camere = null,
      num_bagni = null,
      anno_costruzione = null,
      anno_ristrutturazione = null,
      classe_energetica = null,
      tipo_riscaldamento = null,
      note_tecniche = null,
      dotazioni_extra = [],
      comparabili_attivi = [],
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

    const cittaRaw = citta.trim();
    const cittaTokens = cittaRaw.split(",").map((s: string) => s.trim()).filter(Boolean);
    const cittaMain = cittaTokens[cittaTokens.length - 1];

    const geocodeQueries: string[] = [];
    geocodeQueries.push(`${indirizzo.trim()}, ${cittaRaw}`);
    if (cittaMain !== cittaRaw) {
      geocodeQueries.push(`${indirizzo.trim()}, ${cittaMain}`);
    }
    const indirizzoStreet = indirizzo.trim().replace(/\s+\d+[A-Za-z]?\s*$/, "").trim();
    if (indirizzoStreet !== indirizzo.trim()) {
      geocodeQueries.push(`${indirizzoStreet}, ${cittaMain}`);
    }

    const nominatimFetch = async (q: string): Promise<{ lat: number; lng: number; officialCity: string | null } | null> => {
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
      const r = results[0];
      // Extract the official municipality from Nominatim address details.
      // "city" covers capoluoghi; "town"/"village"/"municipality" covers smaller comuni.
      const addr = r.address ?? {};
      const officialCity: string | null = addr.city ?? addr.municipality ?? addr.town ?? addr.village ?? null;
      console.log(`Nominatim official city for "${q}": ${officialCity}`);
      return { lat: parseFloat(r.lat), lng: parseFloat(r.lon), officialCity };
    };

    let geoCoords: { lat: number; lng: number; officialCity: string | null } | null = null;
    for (const q of geocodeQueries) {
      geoCoords = await nominatimFetch(q);
      if (geoCoords) break;
    }

    // Fallback: se l'indirizzo completo non geocodifica, prova solo il comune.
    // Utile per piccoli comuni (es. Bagnatica) con scarsa copertura OSM a livello via.
    // nearest_zona_omi troverà comunque la zona OMI geograficamente più vicina.
    if (!geoCoords) {
      const cityFallbacks = Array.from(new Set([cittaRaw, cittaMain].filter(Boolean)));
      for (const q of cityFallbacks) {
        console.log(`Geocoding street-level failed, trying city fallback: "${q}"`);
        geoCoords = await nominatimFetch(q);
        if (geoCoords) break;
      }
    }

    if (!geoCoords) {
      return json({
        error: `Impossibile localizzare "${cittaRaw}". Verifica il nome del comune e riprova.`,
        success: false,
      }, 422);
    }

    const { lat, lng, officialCity } = geoCoords;
    // Use the official municipality from Nominatim (e.g. "Bergamo") rather than
    // what the user typed (e.g. "Redona") so nearest_zona_omi matches correctly.
    const cittaPerOmi = officialCity ?? cittaMain;
    console.log("Geocoded coords:", lat, lng, "| city for OMI lookup:", cittaPerOmi);

    // -----------------------------------------------------------------------
    // 2. POI da Overpass (parallelo con OMI lookup)
    // -----------------------------------------------------------------------
    const [poiResult, zonaIdResult, comparabiliRawResult] = await Promise.allSettled([
      fetchPoiSummary(lat, lng),
      supabase.rpc("nearest_zona_omi", { p_lon: lng, p_lat: lat, p_comune: cittaPerOmi }),
      supabase.rpc("comparabili_vicini", { p_lon: lng, p_lat: lat, p_raggio_m: 1500, p_limit: 10 }),
    ]);

    const poi_summary: string | null = poiResult.status === "fulfilled" ? poiResult.value : null;
    console.log("POI summary:", poi_summary);

    // -----------------------------------------------------------------------
    // 3. Nearest OMI zone
    // -----------------------------------------------------------------------
    console.log("nearest_zona_omi result:", zonaIdResult.status);
    let zona_omi: ZonaOmi | null = null;

    if (zonaIdResult.status === "fulfilled") {
      const { data: zonaId, error: rpcError } = zonaIdResult.value;
      if (rpcError) {
        console.error("nearest_zona_omi error:", rpcError.message);
      } else {
        console.log("nearest_zona_omi returned zonaId:", zonaId);
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
      }
    }

    // -----------------------------------------------------------------------
    // 4. Comparabili vicini
    // -----------------------------------------------------------------------
    let comparabili: Comparabile[] = [];
    if (comparabiliRawResult.status === "fulfilled") {
      const { data: comparabiliRaw, error: compError } = comparabiliRawResult.value;
      if (compError) console.error("comparabili_vicini error:", compError.message);
      comparabili = comparabiliRaw ?? [];
    }
    console.log("Comparabili found:", comparabili.length);

    if (!zona_omi && comparabili.length === 0) {
      console.warn(`[MISSING_DATA_ALERT] No OMI or Comparables for: ${citta}, ${indirizzo}`);
    } else if (!zona_omi) {
      console.warn(`[MISSING_DATA_ALERT] No OMI zone for: ${citta}, ${indirizzo}`);
    } else if (comparabili.length === 0) {
      console.warn(`[MISSING_DATA_ALERT] No comparables for: ${citta}, ${indirizzo}`);
    }

    // -----------------------------------------------------------------------
    // 5. Build prompt and call OpenAI
    // -----------------------------------------------------------------------
    const currentYear = new Date().getFullYear();
    const isGiaOttimo = ["Ottimo", "Nuova Costruzione"].includes(stato_conservativo ?? "");

    const systemPrompt = `Sei il Direttore Tecnico di "Il Tuo Immobiliare", agenzia immobiliare specializzata nella provincia di Bergamo. Il tuo tono è autorevole, analitico e radicato nella conoscenza del mercato locale bergamasco. Hai accesso a dati OMI ufficiali e a transazioni reali comparabili.

Analizza i dati forniti e restituisci ESCLUSIVAMENTE un oggetto JSON valido con queste chiavi:

- "stima_min": intero — prezzo minimo consigliato in €
- "stima_max": intero — prezzo massimo consigliato in €
- "stima_breakdown": oggetto con i fattori correttivi applicati al prezzo/mq base. Schema:
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
  PARAGRAFO 1 — CONTESTO: Analisi approfondita della micro-zona e del trend di mercato locale. Se disponibile, cita il codice zona OMI e il range ufficiale prezzo/mq. NON scrivere frasi generiche: cita dati concreti. Se i comparabili sono presenti, riporta i valori medi di transazione reali.
  PARAGRAFO 2 — ANALISI TECNICA: Spiega PERCHÉ hai applicato ciascun fattore correttivo specifico, collegandolo alle preferenze degli acquirenti bergamaschi. Sii specifico e tecnico. Se l'immobile è stato ristrutturato, cita l'anno e quantifica l'impatto sul valore.
  PARAGRAFO 3 — CONCLUSIONE STRATEGICA: Consiglio operativo sul range di prezzo per attrarre acquirenti seri nel mercato attuale. Indica se il mercato locale è in fase espansiva, stabile o contrattiva.
- "trend_mercato_locale": array di oggetti {anno, prezzo_mq} dal 2018 al ${currentYear}, con valori realistici e coerenti per la zona OMI indicata.
- "descrizione_zona": testo professionale in italiano strutturato in ESATTAMENTE 2 paragrafi separati da \\n\\n:
  PARAGRAFO 1 — CARATTERISTICHE DELLA ZONA: Descrizione geografica e vocazionale precisa della zona/quartiere. Usa il nome della zona OMI se disponibile. Se sono disponibili dati POI (servizi vicini), integrali nella descrizione.
  PARAGRAFO 2 — MERCATO IMMOBILIARE: Andamento del mercato specifico di questa zona. Se disponibili i dati OMI, cita obbligatoriamente il range ufficiale €/mq e il codice zona. Descrivi il trend degli ultimi anni.
- "stima_ristrutturato_min": intero — valore stimato DOPO un intervento di restyling/ristrutturazione in €. ${isGiaOttimo ? "L'immobile è già in stato ottimo, imposta uguale a stima_min." : "Calcola il valore potenziale ipotizzando un intervento di restyling completo."}
- "stima_ristrutturato_max": intero — come stima_ristrutturato_min ma valore massimo. ${isGiaOttimo ? "Imposta uguale a stima_max." : ""}
- "costo_stima_lavori": intero — costo indicativo dell'intervento in €. ${isGiaOttimo ? "Imposta 0 (immobile già ottimo)." : "Stima realistica basata su superficie e tipologia di intervento (restyling leggero vs ristrutturazione totale)."}
- "tempo_mercato": stringa — tempo stimato per vendere questo immobile in questa zona (es. "1-2 mesi", "2-4 mesi", "4-6 mesi", "6-12 mesi"). Basati su tipologia, zona OMI, stato e dati di mercato.
- "identikit_compratore": testo in italiano di 2-4 frasi — profilo demografico e comportamentale dell'acquirente tipo per questo immobile specifico (es. fascia d'età, nucleo familiare, motivazione d'acquisto, priorità nella scelta).
- "narrativa_dotazioni": testo in italiano di 2-3 frasi discorsive e persuasive che descrivono come le dotazioni presenti valorizzano concretamente la vita quotidiana in questo immobile. Sii specifico, evita frasi generiche.

REGOLA MATEMATICA OBBLIGATORIA per stima_breakdown:
prezzo_mq_finale = prezzo_mq_base × (1 + SOMMA_ALGEBRICA(tutti i delta_percentuale) / 100)
Somma TUTTI i delta_percentuale algebricamente PRIMA di moltiplicare. NON applicarli in cascata uno per uno.
Esempio CORRETTO: base=2200, fattori=[+10%, +5%, +5%] → somma=+20% → finale=2200×1.20=2640
Esempio SBAGLIATO: 2200×1.10×1.05×1.05=2668 (cascata — VIETATO)
stima_calcolata = prezzo_mq_finale × superficie_mq
stima_min = ROUND(stima_calcolata × 0.95, -3) (arrotondato al migliaio)
stima_max = ROUND(stima_calcolata × 1.05, -3) (arrotondato al migliaio)

REGOLA CONGRUENZA OBBLIGATORIA:
Ogni difetto o pregio citato esplicitamente in motivazione_ai DEVE avere un corrispondente entry in stima_breakdown.fattori con delta_percentuale non zero.
Ogni entry in stima_breakdown.fattori DEVE essere menzionato nella motivazione_ai.
Zero contraddizioni testo↔numeri. Se citi "mancanza ascensore" nel testo, deve esserci il fattore "Assenza ascensore" con delta negativo.

Regole sui fattori correttivi:
A. Includi ESCLUSIVAMENTE i fattori che modificano effettivamente il prezzo (delta_percentuale != 0).
B. NON includere MAI un fattore con delta_percentuale uguale a 0.
C. NON includere un fattore se la caratteristica è assente o neutra per questo immobile.
D. Il campo "nome" deve essere SPECIFICO per questo immobile, mai generico.
E. Il campo "nota" deve spiegare l'impatto concreto sul mercato bergamasco.
F. Range orientativi (usa il valore preciso più adatto al caso specifico):
   - Piano terra senza giardino: -5%
   - Piano alto (>3) con ascensore: +4% a +6%
   - Piano alto (>3) senza ascensore: -7% a -10%
   - Terrazzo privato: +3% a +5%
   - Balcone: +1% a +3%
   - Giardino privato: +5% a +10%
   - Box auto: +3% a +4%
   - Posto auto scoperto: +1% a +2%
   - Cantina: +1%
   - Stato "da ristrutturare": -15% a -20%
   - Stato "ottimo" o "ristrutturato": +10% a +15%
   - Ristrutturato negli ultimi 5 anni: +8% a +12%
   - Ristrutturato tra 6 e 15 anni fa: +3% a +6%
   - Classe energetica A o B: +5%
   - Classe energetica G: -5%
   - Anno di costruzione ante 1960 senza ristrutturazione: -3% a -5%
   - Riscaldamento autonomo vs centralizzato: +2% a +3%

REGOLE ASSOLUTE — POLITICA "VERITÀ O SILENZIO":
1. GROUNDING TOTALE: usa SOLO i dati forniti esplicitamente in questo prompt.
2. ZERO ALLUCINAZIONI SU COMPARABILI: se la lista comparabili è vuota, NON inventare indirizzi, prezzi/mq o descrizioni di transazioni.
3. ZERO ALLUCINAZIONI SU OMI: se i dati OMI non sono presenti, NON inventare codici zona né range di prezzo specifici.
4. DIMENSIONI SCONOSCIUTE: usa SOLO termini qualitativi per caratteristiche presenti ma senza dimensione fornita.
5. Non usare frasi generiche senza dati a supporto.
6. Se i comparabili sono presenti, DEVI citare almeno uno specifico nella motivazione.
7. Se i dati OMI sono presenti, DEVI citare il codice zona sia nella motivazione che nella descrizione_zona.
8. Non usare markdown. Rispondi solo con il JSON.
9. L'array "fattori" NON deve mai contenere oggetti con delta_percentuale = 0.`;

    const userPrompt = buildPrompt({
      indirizzo, citta, superficie_mq, tipologia, stato_conservativo,
      piano, ascensore, ha_giardino, ha_box, ha_posto_auto, ha_cantina,
      ha_terrazzo, terrazzo_mq,
      num_locali, num_camere, num_bagni,
      anno_costruzione, anno_ristrutturazione,
      classe_energetica, tipo_riscaldamento,
      note_tecniche, dotazioni_extra: dotazioni_extra ?? [],
      zona_omi, comparabili, poi_summary,
      comparabili_attivi: comparabili_attivi ?? [],
    });

    console.log("Calling OpenAI gpt-4o...");

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.3,
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

    const {
      stima_min, stima_max, stima_breakdown, motivazione_ai, trend_mercato_locale, descrizione_zona,
      stima_ristrutturato_min, stima_ristrutturato_max, costo_stima_lavori,
      tempo_mercato, identikit_compratore, narrativa_dotazioni,
    } = aiResult;

    // -----------------------------------------------------------------------
    // 6. Update valutazioni record
    // -----------------------------------------------------------------------
    const updatePayload: Record<string, unknown> = {
      latitudine: lat,
      longitudine: lng,
      stima_min,
      stima_max,
      stima_breakdown,
      motivazione_ai,
      trend_mercato_locale,
      descrizione_zona: descrizione_zona ?? null,
      stima_ristrutturato_min: stima_ristrutturato_min ?? null,
      stima_ristrutturato_max: stima_ristrutturato_max ?? null,
      costo_stima_lavori: costo_stima_lavori ?? null,
      tempo_mercato: tempo_mercato ?? null,
      identikit_compratore: identikit_compratore ?? null,
      narrativa_dotazioni: narrativa_dotazioni ?? null,
      poi_summary: poi_summary ?? null,
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
    // 7. Link comparabili
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
