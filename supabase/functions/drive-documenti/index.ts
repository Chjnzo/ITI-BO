// Proxy autorizzato tra il frontend e il Web App Apps Script che gestisce
// i documenti su Google Drive (vedi specifica-progetto-iti-bo-v1.md §4 e
// google-apps-script/README.md). Nessuna libreria/SDK Google qui: solo un
// fetch verso l'URL /exec del Web App con un token condiviso, mai esposto
// al frontend.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FASI_VALIDE = ["In Vendita", "Venduto", "Archivio"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ success: false, error: "No auth header" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const driveWebappUrl = Deno.env.get("DRIVE_WEBAPP_URL");
  const driveSharedToken = Deno.env.get("DRIVE_SHARED_TOKEN");

  if (!driveWebappUrl || !driveSharedToken) {
    return json({ success: false, error: "DRIVE_WEBAPP_URL o DRIVE_SHARED_TOKEN non configurati." }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Verifica che il chiamante sia un utente autenticato reale del gestionale
  // (non solo che l'header sia presente) — stesso livello di controllo delle
  // policy RLS "authenticated" già in uso sulle altre tabelle interne.
  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    return json({ success: false, error: "Utente non autenticato." }, 401);
  }

  const callAppsScript = async (payload: Record<string, unknown>) => {
    const res = await fetch(driveWebappUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, token: driveSharedToken }),
    });
    return await res.json() as { ok: boolean; error?: string; [key: string]: unknown };
  };

  try {
    const body = await req.json();

    if (body.action === "upload") {
      const { documentoId, immobileId, immobileTitolo, immobileIndirizzo, fase, documento, fileName, mimeType, fileBase64 } = body;
      for (const [chiave, valore] of Object.entries({ documentoId, immobileId, immobileTitolo, immobileIndirizzo, fase, documento, fileName, mimeType, fileBase64 })) {
        if (!valore) return json({ success: false, error: `Campo obbligatorio mancante: ${chiave}` }, 400);
      }
      if (!FASI_VALIDE.includes(fase)) {
        return json({ success: false, error: `Fase non valida: ${fase}` }, 400);
      }

      const driveResult = await callAppsScript({
        action: "upload",
        immobileId,
        immobileTitolo,
        immobileIndirizzo,
        fase,
        documento,
        fileName,
        mimeType,
        fileBase64,
      });

      if (!driveResult.ok) {
        return json({ success: false, error: driveResult.error ?? "Errore Apps Script sconosciuto." }, 502);
      }

      const { error: updateError } = await supabase
        .from("immobile_documenti")
        .update({ drive_file_id: driveResult.fileId })
        .eq("id", documentoId);
      if (updateError) {
        return json({ success: false, error: `File caricato su Drive ma aggiornamento DB fallito: ${updateError.message}` }, 500);
      }

      return json({ success: true, fileId: driveResult.fileId, fileName: driveResult.fileName });
    }

    if (body.action === "getDownload") {
      const { documentoId } = body;
      if (!documentoId) return json({ success: false, error: "Campo obbligatorio mancante: documentoId" }, 400);

      const { data: doc, error: docError } = await supabase
        .from("immobile_documenti")
        .select("drive_file_id")
        .eq("id", documentoId)
        .single();
      if (docError || !doc?.drive_file_id) {
        return json({ success: false, error: "Nessun file caricato per questo documento." }, 404);
      }

      const driveResult = await callAppsScript({ action: "getDownload", fileId: doc.drive_file_id });
      if (!driveResult.ok) {
        return json({ success: false, error: driveResult.error ?? "Errore Apps Script sconosciuto." }, 502);
      }

      return json({
        success: true,
        fileName: driveResult.fileName,
        mimeType: driveResult.mimeType,
        fileBase64: driveResult.fileBase64,
      });
    }

    return json({ success: false, error: `Azione sconosciuta: ${body.action}` }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ success: false, error: message }, 500);
  }
});
