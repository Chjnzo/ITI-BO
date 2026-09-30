// Proxy autorizzato tra frontend e Web App Apps Script (Google Drive).
// Supporta due entità: 'immobile' (default per retrocompat) e 'contatto'
// (proprietari — cartella + upload documenti checklist Presa in carico).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FASI_VALIDE_IMMOBILE = ["In Vendita", "Venduto"];
const FASI_VALIDE_CONTATTO = ["Incontro/Sopralluogo", "Rivalutazione", "Presa in carico"];

type Entita = "immobile" | "contatto";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ success: false, error: "No auth header" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const driveWebappUrl = Deno.env.get("DRIVE_WEBAPP_URL");
  const driveSharedToken = Deno.env.get("DRIVE_SHARED_TOKEN");

  if (!driveWebappUrl || !driveSharedToken) {
    console.error("drive-documenti: DRIVE_WEBAPP_URL o DRIVE_SHARED_TOKEN non configurati.");
    return json({ success: false, error: "DRIVE_WEBAPP_URL o DRIVE_SHARED_TOKEN non configurati." }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

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
    const rawText = await res.text();
    console.log(`drive-documenti: Apps Script HTTP ${res.status} action=${payload.action} raw=${rawText.slice(0, 500)}`);
    try {
      return JSON.parse(rawText) as { ok: boolean; error?: string; [key: string]: unknown };
    } catch (parseErr) {
      console.error(`drive-documenti: risposta Apps Script non JSON (HTTP ${res.status}): ${rawText.slice(0, 500)}`);
      throw new Error(`Apps Script ha risposto con contenuto non valido (HTTP ${res.status}).`);
    }
  };

  try {
    const body = await req.json();
    const entita: Entita = (body.entita === "contatto" ? "contatto" : "immobile");

    // ── createFolder ────────────────────────────────────────────────────
    if (body.action === "createFolder") {
      if (entita === "immobile") {
        const { immobileId } = body;
        if (!immobileId) return json({ success: false, error: "Campo obbligatorio mancante: immobileId" }, 400);

        const { data: immobile, error: immobileError } = await supabase
          .from("immobili")
          .select("id, titolo, drive_folder_id")
          .eq("id", immobileId)
          .single();
        if (immobileError || !immobile) return json({ success: false, error: `Immobile non trovato: ${immobileId}` }, 404);

        const driveResult = await callAppsScript({
          action: "createFolder",
          immobileTitolo: immobile.titolo || `Immobile ${immobileId.slice(0, 8)}`,
          existingFolderId: immobile.drive_folder_id ?? undefined,
        });
        if (!driveResult.ok) {
          console.error(`drive-documenti: createFolder immobile fallita: ${driveResult.error}`);
          return json({ success: false, error: driveResult.error ?? "Errore Apps Script." }, 502);
        }

        const { error: updateError } = await supabase
          .from("immobili")
          .update({ drive_folder_id: driveResult.folderId, drive_folder_url: driveResult.folderUrl })
          .eq("id", immobileId);
        if (updateError) return json({ success: false, error: `Cartella creata ma persist DB fallita: ${updateError.message}` }, 500);

        return json({ success: true, folderId: driveResult.folderId, folderUrl: driveResult.folderUrl });
      }

      // entita = 'contatto': cartella Drive per proprietario/pratica.
      const { contattoId } = body;
      if (!contattoId) return json({ success: false, error: "Campo obbligatorio mancante: contattoId" }, 400);

      const { data: contatto, error: contattoError } = await supabase
        .from("contatti")
        .select("id, drive_folder_id, proprietari(nome, cognome)")
        .eq("id", contattoId)
        .single();
      if (contattoError || !contatto) {
        console.error(`drive-documenti: contatto non trovato ${contattoId}: ${contattoError?.message}`);
        return json({ success: false, error: `Contatto non trovato: ${contattoId}` }, 404);
      }

      const prop = (contatto as { proprietari?: { nome: string; cognome: string | null } | null }).proprietari;
      const titolo = prop ? `Contatto - ${prop.nome} ${prop.cognome ?? ""}`.trim() : `Contatto ${contattoId.slice(0, 8)}`;

      const driveResult = await callAppsScript({
        action: "createFolder",
        immobileTitolo: titolo,
        existingFolderId: (contatto as { drive_folder_id?: string | null }).drive_folder_id ?? undefined,
      });
      if (!driveResult.ok) {
        console.error(`drive-documenti: createFolder contatto fallita (contattoId=${contattoId}): ${driveResult.error}`);
        return json({ success: false, error: driveResult.error ?? "Errore Apps Script." }, 502);
      }

      const { error: updateError } = await supabase
        .from("contatti")
        .update({ drive_folder_id: driveResult.folderId, drive_folder_url: driveResult.folderUrl })
        .eq("id", contattoId);
      if (updateError) return json({ success: false, error: `Cartella creata ma persist DB fallita: ${updateError.message}` }, 500);

      return json({ success: true, folderId: driveResult.folderId, folderUrl: driveResult.folderUrl });
    }

    // ── upload ────────────────────────────────────────────────────────
    if (body.action === "upload") {
      const { documentoId, fase, documento, fileName, mimeType, fileBase64 } = body;
      for (const [chiave, valore] of Object.entries({ documentoId, fase, documento, fileName, mimeType, fileBase64 })) {
        if (!valore) return json({ success: false, error: `Campo obbligatorio mancante: ${chiave}` }, 400);
      }

      if (entita === "immobile") {
        const { immobileId, immobileTitolo, immobileIndirizzo } = body;
        if (!immobileId || !immobileTitolo || !immobileIndirizzo) {
          return json({ success: false, error: "Campi immobile mancanti." }, 400);
        }
        if (!FASI_VALIDE_IMMOBILE.includes(fase)) return json({ success: false, error: `Fase non valida: ${fase}` }, 400);

        const { data: immobileForFolder } = await supabase
          .from("immobili")
          .select("drive_folder_id, drive_folder_url")
          .eq("id", immobileId)
          .maybeSingle();

        const driveResult = await callAppsScript({
          action: "upload",
          immobileId,
          immobileTitolo,
          immobileIndirizzo,
          driveFolderId: immobileForFolder?.drive_folder_id ?? undefined,
          fase,
          documento,
          fileName,
          mimeType,
          fileBase64,
        });
        if (!driveResult.ok) {
          console.error(`drive-documenti: upload immobile fallito: ${driveResult.error}`);
          return json({ success: false, error: driveResult.error ?? "Errore Apps Script." }, 502);
        }

        const { error: updateError } = await supabase
          .from("immobile_documenti")
          .update({ drive_file_id: driveResult.fileId })
          .eq("id", documentoId);
        if (updateError) return json({ success: false, error: `File caricato ma DB fallita: ${updateError.message}` }, 500);

        if (driveResult.folderId && !immobileForFolder?.drive_folder_id) {
          await supabase
            .from("immobili")
            .update({ drive_folder_id: driveResult.folderId, drive_folder_url: driveResult.folderUrl })
            .eq("id", immobileId);
        }

        return json({ success: true, fileId: driveResult.fileId, fileName: driveResult.fileName });
      }

      // entita = 'contatto': upload allegato checklist proprietario.
      const { contattoId, contattoTitolo } = body;
      if (!contattoId || !contattoTitolo) return json({ success: false, error: "Campi contatto mancanti." }, 400);
      if (!FASI_VALIDE_CONTATTO.includes(fase)) return json({ success: false, error: `Fase non valida: ${fase}` }, 400);

      const { data: contattoForFolder } = await supabase
        .from("contatti")
        .select("drive_folder_id, drive_folder_url")
        .eq("id", contattoId)
        .maybeSingle();

      const driveResult = await callAppsScript({
        action: "upload",
        immobileId: contattoId,
        immobileTitolo: contattoTitolo,
        immobileIndirizzo: "contatto",
        driveFolderId: contattoForFolder?.drive_folder_id ?? undefined,
        fase,
        documento,
        fileName,
        mimeType,
        fileBase64,
      });
      if (!driveResult.ok) {
        console.error(`drive-documenti: upload contatto fallito (contattoId=${contattoId}): ${driveResult.error}`);
        return json({ success: false, error: driveResult.error ?? "Errore Apps Script." }, 502);
      }

      const { error: updateError } = await supabase
        .from("proprietari_pratica_documenti")
        .update({ drive_file_id: driveResult.fileId })
        .eq("id", documentoId);
      if (updateError) return json({ success: false, error: `File caricato ma DB fallita: ${updateError.message}` }, 500);

      if (driveResult.folderId && !contattoForFolder?.drive_folder_id) {
        await supabase
          .from("contatti")
          .update({ drive_folder_id: driveResult.folderId, drive_folder_url: driveResult.folderUrl })
          .eq("id", contattoId);
      }

      return json({ success: true, fileId: driveResult.fileId, fileName: driveResult.fileName });
    }

    // ── getDownload ──────────────────────────────────────────────────
    if (body.action === "getDownload") {
      const { documentoId } = body;
      if (!documentoId) return json({ success: false, error: "Campo obbligatorio mancante: documentoId" }, 400);

      const tabella = entita === "contatto" ? "proprietari_pratica_documenti" : "immobile_documenti";
      const { data: doc, error: docError } = await supabase
        .from(tabella)
        .select("drive_file_id")
        .eq("id", documentoId)
        .single();
      if (docError || !doc?.drive_file_id) return json({ success: false, error: "Nessun file caricato." }, 404);

      const driveResult = await callAppsScript({ action: "getDownload", fileId: doc.drive_file_id });
      if (!driveResult.ok) {
        console.error(`drive-documenti: getDownload fallito: ${driveResult.error}`);
        return json({ success: false, error: driveResult.error ?? "Errore Apps Script." }, 502);
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
    console.error(`drive-documenti: eccezione non gestita: ${message}`);
    return json({ success: false, error: message }, 500);
  }
});
