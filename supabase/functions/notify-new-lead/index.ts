import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LeadPayload {
  nome?: string;
  cognome?: string;
  telefono?: string;
  email?: string;
  messaggio?: string;
  immobile_interesse?: string;
  // Campi valutazione
  indirizzo?: string;
  tipologia?: string;
  superficie_mq?: number;
  piano?: string;
  ascensore?: boolean;
  giardino?: boolean;
  garage?: boolean;
  // Campi aggiuntivi generici
  [key: string]: unknown;
}

const KNOWN_FIELDS: Record<string, string> = {
  nome: "Nome",
  cognome: "Cognome",
  telefono: "Telefono",
  email: "Email",
  messaggio: "Messaggio",
  immobile_interesse: "Immobile di interesse",
  indirizzo: "Indirizzo",
  tipologia: "Tipologia",
  superficie_mq: "Superficie (mq)",
  piano: "Piano",
  ascensore: "Ascensore",
  giardino: "Giardino",
  garage: "Garage",
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sì" : "No";
  return String(value);
}

function buildHtmlBody(data: LeadPayload): string {
  const nome = [data.nome, data.cognome].filter(Boolean).join(" ") || "Sconosciuto";

  const rows = Object.entries(KNOWN_FIELDS)
    .filter(([key]) => data[key] !== undefined && data[key] !== null && data[key] !== "")
    .map(([key, label]) => `
      <tr>
        <td style="padding:8px 12px;font-weight:600;color:#555;background:#f9fafb;border-bottom:1px solid #e5e7eb;width:160px;vertical-align:top">${label}</td>
        <td style="padding:8px 12px;color:#111;border-bottom:1px solid #e5e7eb">${formatValue(data[key])}</td>
      </tr>`
    ).join("");

  // Any extra fields not in KNOWN_FIELDS
  const extraRows = Object.entries(data)
    .filter(([key]) => !(key in KNOWN_FIELDS))
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([key, v]) => `
      <tr>
        <td style="padding:8px 12px;font-weight:600;color:#555;background:#f9fafb;border-bottom:1px solid #e5e7eb;width:160px;vertical-align:top">${key}</td>
        <td style="padding:8px 12px;color:#111;border-bottom:1px solid #e5e7eb">${formatValue(v)}</td>
      </tr>`
    ).join("");

  return `<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
        <!-- Header -->
        <tr>
          <td style="background:#94b0ab;padding:24px 32px">
            <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.75)">IL TUO IMMOBILIARE</p>
            <h1 style="margin:6px 0 0;font-size:22px;color:#ffffff">Nuovo lead dal sito</h1>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:24px 32px">
            <p style="margin:0 0 20px;font-size:15px;color:#374151">
              È arrivata una nuova richiesta da <strong>${nome}</strong>. Ecco i dettagli:
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;font-size:14px">
              ${rows}${extraRows}
            </table>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center">
              Notifica automatica — ITI Gestionale · iltuoimmobiliare.it
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  let data: LeadPayload;
  try {
    data = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY not set");
    return new Response(JSON.stringify({ error: "Server configuration error" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const nome = [data.nome, data.cognome].filter(Boolean).join(" ") || "Sconosciuto";
  const subject = `Nuovo lead dal sito — ${nome}`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "noreply@iltuoimmobiliare.it",
      to: ["info@iltuoimmobiliare.it", "marcoferrari.wk@gmail.com"],
      subject,
      html: buildHtmlBody(data),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Resend error:", err);
    return new Response(JSON.stringify({ error: "Failed to send email", detail: err }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const result = await res.json();
  return new Response(JSON.stringify({ ok: true, id: result.id }), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
