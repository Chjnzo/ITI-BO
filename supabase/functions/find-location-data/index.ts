import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const { lat, lng, comune } = await req.json();

    if (typeof lat !== "number" || typeof lng !== "number") {
      return new Response(
        JSON.stringify({ error: "I campi 'lat' e 'lng' sono obbligatori e devono essere numerici.", success: false }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Find nearest OMI zone
    const { data: zonaId, error: rpcError } = await supabase.rpc("nearest_zona_omi", {
      p_lon: lng,
      p_lat: lat,
      p_comune: comune ?? null,
    });

    if (rpcError) {
      return new Response(
        JSON.stringify({ error: `Errore RPC nearest_zona_omi: ${rpcError.message}`, success: false }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // 2. Fetch zone details
    let zona_omi: Record<string, unknown> | null = null;
    if (zonaId) {
      const { data: zonaData, error: zonaError } = await supabase
        .from("zone_omi")
        .select("id, codice_zona, comune, provincia, fascia, zona, link_istituzionale, prezzo_mq_min, prezzo_mq_max, prezzo_mq_medio, updated_at")
        .eq("id", zonaId)
        .single();

      if (zonaError) {
        return new Response(
          JSON.stringify({ error: `Errore fetch zone_omi: ${zonaError.message}`, success: false }),
          { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }
      zona_omi = zonaData;
    }

    // 3. Find nearby comparable transactions
    const { data: comparabili, error: compError } = await supabase.rpc("comparabili_vicini", {
      p_lon: lng,
      p_lat: lat,
      p_raggio_m: 1500,
      p_limit: 10,
    });

    if (compError) {
      return new Response(
        JSON.stringify({ error: `Errore RPC comparabili_vicini: ${compError.message}`, success: false }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        zona_omi,
        comparabili: comparabili ?? [],
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
