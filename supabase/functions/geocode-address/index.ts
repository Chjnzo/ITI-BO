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
    const { address } = await req.json();

    if (!address || typeof address !== "string" || address.trim() === "") {
      return new Response(
        JSON.stringify({ error: "Il campo 'address' è obbligatorio.", success: false }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const locationIqKey = Deno.env.get("LOCATIONIQ_API_KEY");
    if (!locationIqKey) {
      return new Response(
        JSON.stringify({ error: "LOCATIONIQ_API_KEY non configurata.", success: false }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Nominatim pubblico blocca con 403 le richieste dagli IP delle Edge
    // Function Supabase (ban a livello di IP/datacenter — verificato
    // 2026-09-29). LocationIQ ha lo stesso formato di risposta di Nominatim.
    const params = new URLSearchParams({
      key: locationIqKey,
      format: "json",
      limit: "1",
      addressdetails: "1",
      q: address.trim(),
    });

    const geocodeUrl = `https://us1.locationiq.com/v1/search?${params.toString()}`;

    const geocodeRes = await fetch(geocodeUrl, {
      headers: { "Accept-Language": "it" },
    });

    if (!geocodeRes.ok) {
      return new Response(
        JSON.stringify({ error: "Servizio di geocoding non disponibile.", success: false }),
        { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const results = await geocodeRes.json();

    if (!Array.isArray(results) || results.length === 0) {
      return new Response(
        JSON.stringify({ error: "Nessun risultato trovato per l'indirizzo fornito.", success: false }),
        { status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const { lat, lon, display_name } = results[0];

    return new Response(
      JSON.stringify({
        lat: parseFloat(lat),
        lng: parseFloat(lon),
        display_name,
        success: true,
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto";
    return new Response(
      JSON.stringify({ error: message, success: false }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
