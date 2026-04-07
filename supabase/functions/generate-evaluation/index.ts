import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const { indirizzo, citta, metri_quadri, tipologia, condizioni, comfort } =
      await req.json();

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY not set" }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const comfortLine = Array.isArray(comfort) && comfort.length > 0
      ? `Dotazioni: ${comfort.join(", ")}.`
      : "";

    const userPrompt = `Immobile: ${tipologia ?? "appartamento"}, ${metri_quadri} mq, ${condizioni ?? "buono"}.
Indirizzo: ${indirizzo}, ${citta ?? "Bergamo"}.
${comfortLine}`.trim();

    const currentYear = new Date().getFullYear();

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              `Sei un esperto valutatore immobiliare per l'agenzia "Il Tuo Immobiliare" di Ranica (BG). Analizza i dati forniti e restituisci SOLO un oggetto JSON valido con queste chiavi:\n- "descrizione_zona": paragrafo sui punti di forza della zona, trasporti, servizi\n- "razionale_valutazione": testo professionale che giustifica il range di prezzo\n- "stima_min": numero intero (prezzo minimo consigliato in €, basato su metratura, stato e zona)\n- "stima_max": numero intero (prezzo massimo consigliato in €)\n- "trend_prezzi": array di oggetti {anno, prezzo_mq} dal 2018 all'anno ${currentYear}, rappresentando l'andamento realistico del prezzo al m² nella zona dell'immobile. Usa dati plausibili per la provincia di Bergamo / zona specificata.\nNon usare formattazione markdown fuori dal JSON.`,
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
        temperature: 0.7,
      }),
    });

    if (!openaiRes.ok) {
      const errBody = await openaiRes.text();
      return new Response(JSON.stringify({ error: `OpenAI error: ${errBody}` }), {
        status: 502,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const openaiData = await openaiRes.json();
    const rawContent = openaiData.choices?.[0]?.message?.content ?? "{}";

    // Strip potential markdown code fences before parsing
    const cleaned = rawContent.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const result = JSON.parse(cleaned);

    return new Response(JSON.stringify(result), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
