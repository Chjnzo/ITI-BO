import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Wrap text at maxWidth chars, return array of lines
const wrapText = (text: string, maxWidth: number): string[] => {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + (current ? " " : "") + word).length <= maxWidth) {
      current += (current ? " " : "") + word;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
};

const fmtEuro = (n: number | null): string =>
  n == null ? "—" : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const { slug } = await req.json();
    if (!slug) {
      return new Response(JSON.stringify({ error: "slug required" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Fetch valuation using service role key (bypasses RLS)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, serviceKey);

    const { data: val, error: fetchErr } = await db
      .from("valutazioni")
      .select("*, leads(nome, cognome)")
      .eq("slug", slug)
      .single();

    if (fetchErr || !val) {
      return new Response(JSON.stringify({ error: "Valutazione non trovata" }), {
        status: 404,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ── Build PDF ──────────────────────────────────────────────────────────────

    const doc = await PDFDocument.create();
    const page = doc.addPage([595, 842]); // A4 portrait
    const { width, height } = page.getSize();

    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
    const font = await doc.embedFont(StandardFonts.Helvetica);

    const teal = rgb(0.58, 0.69, 0.67);       // #94b0ab
    const dark = rgb(0.1, 0.1, 0.1);
    const gray = rgb(0.5, 0.5, 0.5);
    const lightGray = rgb(0.92, 0.93, 0.94);

    let y = height - 50;
    const marginL = 50;
    const marginR = width - 50;

    // ── Header stripe ─────────────────────────────────────────────────────────
    page.drawRectangle({ x: 0, y: height - 65, width, height: 65, color: teal });
    page.drawText("Il Tuo Immobiliare", {
      x: marginL, y: height - 30,
      size: 14, font: fontBold, color: rgb(1, 1, 1),
    });
    page.drawText("Valutazione Immobiliare", {
      x: marginL, y: height - 50,
      size: 9, font, color: rgb(0.9, 0.95, 0.94),
    });

    y = height - 90;

    // ── Address ───────────────────────────────────────────────────────────────
    page.drawText(val.indirizzo ?? "", {
      x: marginL, y,
      size: 20, font: fontBold, color: dark,
    });
    y -= 18;
    page.drawText(val.citta ?? "", {
      x: marginL, y,
      size: 10, font, color: gray,
    });
    y -= 20;

    // ── Divider ───────────────────────────────────────────────────────────────
    page.drawLine({ start: { x: marginL, y }, end: { x: marginR, y }, thickness: 0.5, color: lightGray });
    y -= 15;

    // ── Key specs grid (2 columns) ────────────────────────────────────────────
    const specs: [string, string][] = [
      ["Superficie", `${val.superficie_mq} m²`],
      ["Tipologia", val.tipologia ?? "—"],
      ["N° Locali", val.num_locali ? `${val.num_locali}` : "—"],
      ["Stato conservativo", val.stato_conservativo ?? "—"],
      ["Piano", val.piano != null ? `${val.piano}` : "—"],
      ["Anno costruzione", val.anno_costruzione ? `${val.anno_costruzione}` : "—"],
    ];

    const colW = (marginR - marginL) / 2;
    for (let i = 0; i < specs.length; i++) {
      const col = i % 2;
      const xOff = marginL + col * colW;
      if (col === 0 && i > 0) y -= 22;
      page.drawText(specs[i][0].toUpperCase(), { x: xOff, y, size: 7, font, color: gray });
      page.drawText(specs[i][1], { x: xOff, y: y - 11, size: 10, font: fontBold, color: dark });
    }
    y -= 30;

    // ── Divider ───────────────────────────────────────────────────────────────
    page.drawLine({ start: { x: marginL, y }, end: { x: marginR, y }, thickness: 0.5, color: lightGray });
    y -= 20;

    // ── Price range ───────────────────────────────────────────────────────────
    if (val.stima_min || val.stima_max) {
      page.drawText("STIMA DI VALORE", { x: marginL, y, size: 8, font, color: gray });
      y -= 16;
      const priceText = val.stima_min && val.stima_max
        ? `${fmtEuro(val.stima_min)} – ${fmtEuro(val.stima_max)}`
        : fmtEuro(val.stima_min ?? val.stima_max);
      page.drawText(priceText, { x: marginL, y, size: 22, font: fontBold, color: teal });
      y -= 30;

      page.drawLine({ start: { x: marginL, y }, end: { x: marginR, y }, thickness: 0.5, color: lightGray });
      y -= 20;
    }

    // ── AI Motivazione ────────────────────────────────────────────────────────
    if (val.motivazione_ai) {
      page.drawText("ANALISI AI", { x: marginL, y, size: 8, font, color: gray });
      y -= 14;

      const lines = val.motivazione_ai
        .split("\n")
        .flatMap((para: string) => para.trim() ? wrapText(para.trim(), 90) : [""])
        .slice(0, 30); // cap at 30 lines to avoid overflow

      for (const line of lines) {
        if (y < 80) break;
        page.drawText(line, { x: marginL, y, size: 9, font, color: dark, lineHeight: 13 });
        y -= 13;
      }
      y -= 10;
    }

    // ── Comfort badges (text) ─────────────────────────────────────────────────
    const comfortItems: string[] = [];
    if (val.ha_box) comfortItems.push("Box auto");
    if (val.ha_posto_auto) comfortItems.push("Posto auto");
    if (val.ha_cantina) comfortItems.push("Cantina");
    if (val.ha_giardino) comfortItems.push("Giardino");
    if (val.ascensore) comfortItems.push("Ascensore");

    if (comfortItems.length > 0 && y > 100) {
      page.drawLine({ start: { x: marginL, y }, end: { x: marginR, y }, thickness: 0.5, color: lightGray });
      y -= 15;
      page.drawText("DOTAZIONI", { x: marginL, y, size: 8, font, color: gray });
      y -= 13;
      page.drawText(comfortItems.join("  ·  "), { x: marginL, y, size: 9, font, color: dark });
      y -= 20;
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    page.drawRectangle({ x: 0, y: 0, width, height: 35, color: lightGray });
    const dateStr = new Date(val.created_at).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
    const leadName = val.leads ? ` · ${val.leads.nome} ${val.leads.cognome}` : "";
    page.drawText(`Generato il ${dateStr}${leadName} · Il Tuo Immobiliare`, {
      x: marginL, y: 12, size: 7, font, color: gray,
    });

    // ── Serialize ─────────────────────────────────────────────────────────────
    const pdfBytes = await doc.save();
    const pdf_base64 = btoa(String.fromCharCode(...pdfBytes));

    return new Response(JSON.stringify({ pdf_base64 }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
