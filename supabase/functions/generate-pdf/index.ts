import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { PDFDocument, PDFPage, PDFFont, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Palette ──────────────────────────────────────────────────────────────────
const C = {
  teal:      rgb(0.580, 0.690, 0.671),  // #94b0ab
  tealDark:  rgb(0.431, 0.549, 0.529),  // #6e8c87
  tealLight: rgb(0.749, 0.820, 0.808),  // #bfd1ce
  white:     rgb(1, 1, 1),
  dark:      rgb(0.102, 0.102, 0.102),
  gray:      rgb(0.502, 0.502, 0.502),
  lightGray: rgb(0.922, 0.922, 0.922),
  midGray:   rgb(0.710, 0.710, 0.710),
  rose:      rgb(0.800, 0.200, 0.200),
  green:     rgb(0.180, 0.620, 0.380),
};

const W = 595;   // A4 width (pt)
const H = 842;   // A4 height (pt)
const ML = 50;   // margin left
const MR = 545;  // margin right
const CW = 495;  // content width

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmtEuro = (n: number | null): string =>
  n == null
    ? "—"
    : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

// Wrap text by character count (safe for standard fonts)
const wrapText = (text: string, charsPerLine: number): string[] => {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const test = cur ? `${cur} ${word}` : word;
    if (test.length <= charsPerLine) {
      cur = test;
    } else {
      if (cur) lines.push(cur);
      cur = word.length > charsPerLine ? word : word;
    }
  }
  if (cur) lines.push(cur);
  return lines;
};

// ── Page components ───────────────────────────────────────────────────────────

function drawFooter(page: PDFPage, font: PDFFont, fontBold: PDFFont) {
  page.drawRectangle({ x: 0, y: 0, width: W, height: 28, color: C.lightGray });
  page.drawText("REPORT IMMOBILIARE", { x: ML, y: 9, size: 7, font, color: C.gray });
  page.drawText("IL TUO IMMOBILIARE", { x: MR - 95, y: 9, size: 7, font: fontBold, color: C.teal });
}

// Returns the Y coordinate to start content after the header band
function drawSectionHeader(page: PDFPage, fontBold: PDFFont, title: string): number {
  page.drawRectangle({ x: 0, y: H - 68, width: W, height: 68, color: C.teal });
  page.drawRectangle({ x: 0, y: H - 71, width: W, height: 3, color: C.tealDark });
  page.drawText(title, { x: ML, y: H - 44, size: 20, font: fontBold, color: C.white });
  // ITI brand top-right in header
  page.drawText("IL TUO IMMOBILIARE", { x: MR - 97, y: H - 26, size: 7.5, font: fontBold, color: C.white });
  return H - 95;
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { slug } = await req.json();
    if (!slug) {
      return new Response(JSON.stringify({ error: "slug required" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: val, error: fetchErr } = await db
      .from("valutazioni")
      .select("*, leads(nome, cognome), zone_omi(codice_zona, fascia, zona, prezzo_mq_min, prezzo_mq_max, prezzo_mq_medio)")
      .eq("slug", slug)
      .single();

    if (fetchErr || !val) {
      return new Response(JSON.stringify({ error: "Valutazione non trovata" }), {
        status: 404, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Parse JSON fields
    const trendData: { anno: number; prezzo_mq: number }[] = Array.isArray(val.trend_mercato_locale)
      ? val.trend_mercato_locale
      : (() => { try { return JSON.parse(val.trend_mercato_locale ?? "[]"); } catch { return []; } })();

    const breakdown = (() => {
      if (!val.stima_breakdown) return null;
      if (typeof val.stima_breakdown === "object") return val.stima_breakdown as { prezzo_mq_base: number; fattori: { nome: string; delta_percentuale: number; nota?: string }[]; prezzo_mq_finale: number };
      try { return JSON.parse(val.stima_breakdown); } catch { return null; }
    })();

    const doc = await PDFDocument.create();
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
    const font = await doc.embedFont(StandardFonts.Helvetica);

    const dateStr = new Date(val.created_at).toLocaleDateString("it-IT", {
      day: "2-digit", month: "2-digit", year: "numeric",
    });

    // ── Fetch Mapbox map image (if token + coordinates available) ─────────────
    let mapboxImageBytes: Uint8Array | null = null;
    const MAPBOX_TOKEN = Deno.env.get("MAPBOX_TOKEN");
    if (MAPBOX_TOKEN && val.latitudine && val.longitudine) {
      try {
        const mapUrl = `https://api.mapbox.com/styles/v1/mapbox/streets-v11/static/pin-s+94b0ab(${val.longitudine},${val.latitudine})/${val.longitudine},${val.latitudine},14,0/560x240@2x?access_token=${MAPBOX_TOKEN}`;
        const mapRes = await fetch(mapUrl, { signal: AbortSignal.timeout(10000) });
        if (mapRes.ok) {
          const buf = await mapRes.arrayBuffer();
          mapboxImageBytes = new Uint8Array(buf);
        }
      } catch (_) { /* silent fallback */ }
    }

    // =========================================================================
    // PAGE 1 — COVER
    // =========================================================================
    {
      const page = doc.addPage([W, H]);

      // Top right: ITI brand
      page.drawText("IL TUO", { x: MR - 68, y: H - 32, size: 14, font: fontBold, color: C.dark });
      page.drawText("IMMOBILIARE", { x: MR - 68, y: H - 50, size: 10, font: fontBold, color: C.teal });

      // Date — large, top left
      page.drawText(dateStr, { x: ML, y: H - 50, size: 26, font: fontBold, color: C.dark });

      // Big teal band (covering ~38% of page height)
      const bandBottom = H - 400;
      const bandHeight = 300;
      page.drawRectangle({ x: 0, y: bandBottom, width: W, height: bandHeight, color: C.teal });
      page.drawRectangle({ x: 0, y: bandBottom + bandHeight, width: W, height: 4, color: C.tealDark });
      page.drawRectangle({ x: 0, y: bandBottom - 2, width: W, height: 4, color: C.tealDark });

      // REPORT / IMMOBILIARE in band
      page.drawText("REPORT", { x: ML, y: bandBottom + bandHeight - 95, size: 78, font: fontBold, color: C.white });
      page.drawText("IMMOBILIARE", { x: ML, y: bandBottom + bandHeight - 195, size: 56, font: fontBold, color: C.white });

      // Property address below band
      const fullAddr = `${val.indirizzo}, ${val.citta}`.toUpperCase();
      const addrLines = wrapText(fullAddr, 58);
      let ay = bandBottom - 35;
      for (const line of addrLines.slice(0, 2)) {
        page.drawText(line, { x: ML, y: ay, size: 11, font: fontBold, color: C.dark });
        ay -= 16;
      }

      if (val.leads) {
        page.drawText(`Cliente: ${val.leads.nome} ${val.leads.cognome}`, {
          x: ML, y: ay - 4, size: 9, font, color: C.gray,
        });
      }

      // Separator line above footer contact block
      page.drawLine({ start: { x: ML, y: 120 }, end: { x: MR, y: 120 }, thickness: 0.5, color: C.midGray });

      // Three-column contact strip
      const col1 = ML;
      const col2 = ML + 170;
      const col3 = ML + 340;

      page.drawText("MATTEO ROGGERI", { x: col1, y: 100, size: 7.5, font: fontBold, color: C.dark });
      page.drawText("GABRIELE STURNIOLO", { x: col1, y: 88, size: 7.5, font: fontBold, color: C.dark });

      page.drawText("info@iltuoimmobiliare.it", { x: col2, y: 100, size: 7.5, font, color: C.gray });
      page.drawText("+39 375 822 7321", { x: col2, y: 88, size: 7.5, font, color: C.gray });

      page.drawText("Via Adelasio 18, Ranica (BG)", { x: col3, y: 100, size: 7.5, font, color: C.gray });
      page.drawText("www.iltuoimmobiliare.it", { x: col3, y: 88, size: 7.5, font, color: C.gray });
    }

    // =========================================================================
    // PAGE 2 — DESCRIZIONE DELL'IMMOBILE
    // =========================================================================
    {
      const page = doc.addPage([W, H]);
      drawFooter(page, font, fontBold);
      let y = drawSectionHeader(page, fontBold, "DESCRIZIONE DELL'IMMOBILE");

      // Address
      const addrFull = `UBICAZIONE: ${val.indirizzo.toUpperCase()}, ${val.citta.toUpperCase()}`;
      const addrLines = wrapText(addrFull, 72);
      for (const line of addrLines.slice(0, 2)) {
        page.drawText(line, { x: ML, y, size: 10, font: fontBold, color: C.dark });
        y -= 15;
      }
      y -= 10;

      // Narrativa dotazioni (AI-generated persuasive description)
      if (val.narrativa_dotazioni) {
        page.drawText("DESCRIZIONE", { x: ML, y, size: 7.5, font, color: C.gray });
        y -= 13;
        const narrativaLines = wrapText(val.narrativa_dotazioni as string, 88);
        for (const line of narrativaLines.slice(0, 10)) {
          if (y < 200) break;
          page.drawText(line, { x: ML, y, size: 9.5, font, color: C.dark });
          y -= 13;
        }
        y -= 12;
        page.drawLine({ start: { x: ML, y }, end: { x: MR, y }, thickness: 0.5, color: C.lightGray });
        y -= 14;
      }

      // Feature list
      const specs: string[] = [];
      if (val.num_locali) specs.push(`${val.num_locali} locali`);
      if (val.num_camere) specs.push(`${val.num_camere} camere da letto`);
      if (val.superficie_mq) specs.push(`${val.superficie_mq} mq`);
      if (val.piano != null) specs.push(val.piano === 0 ? "Piano terra" : `Piano ${val.piano}`);
      if (val.num_bagni) specs.push(`${val.num_bagni} ${val.num_bagni === 1 ? "bagno" : "bagni"}`);
      if (val.ascensore) specs.push("Ascensore");
      if (val.ha_box) specs.push("Box auto");
      if (val.ha_posto_auto) specs.push("Posto auto");
      if (val.ha_cantina) specs.push("Cantina");
      if (val.ha_giardino) specs.push("Giardino");
      if (val.tipo_riscaldamento) specs.push(`Riscaldamento ${val.tipo_riscaldamento.toLowerCase()}`);
      if (val.tipologia) specs.push(val.tipologia);
      if (val.stato_conservativo) specs.push(`Stato: ${val.stato_conservativo}`);
      if (val.classe_energetica) specs.push(`Classe energetica ${val.classe_energetica}`);
      if (val.anno_costruzione) specs.push(`Anno costruzione: ${val.anno_costruzione}`);

      for (const spec of specs) {
        if (y < 60) break;
        // Teal square bullet
        page.drawRectangle({ x: ML, y: y - 1, width: 5, height: 5, color: C.teal });
        page.drawText(spec, { x: ML + 14, y, size: 11, font: fontBold, color: C.dark });
        y -= 23;
      }

      // Notes
      if (val.note_tecniche && y > 100) {
        y -= 5;
        page.drawLine({ start: { x: ML, y }, end: { x: MR, y }, thickness: 0.5, color: C.lightGray });
        y -= 15;
        page.drawText("NOTE AGGIUNTIVE", { x: ML, y, size: 7.5, font, color: C.gray });
        y -= 14;
        const noteLines = wrapText(val.note_tecniche, 88);
        for (const line of noteLines.slice(0, 8)) {
          if (y < 60) break;
          page.drawText(line, { x: ML, y, size: 9, font, color: C.dark });
          y -= 13;
        }
      }
    }

    // =========================================================================
    // PAGE 3 — DESCRIZIONE DELLA ZONA
    // =========================================================================
    if (val.descrizione_zona || val.zone_omi || mapboxImageBytes || val.poi_summary) {
      const page = doc.addPage([W, H]);
      drawFooter(page, font, fontBold);
      let y = drawSectionHeader(page, fontBold, "DESCRIZIONE DELLA ZONA");

      // OMI data strip
      if (val.zone_omi) {
        const z = val.zone_omi;
        page.drawRectangle({ x: ML, y: y - 46, width: CW, height: 50, color: C.lightGray });
        page.drawText("ZONA OMI UFFICIALE", { x: ML + 10, y: y - 8, size: 7, font, color: C.gray });
        page.drawText(`${z.codice_zona}  |  ${z.fascia}  |  ${z.zona}`, {
          x: ML + 10, y: y - 22, size: 9, font: fontBold, color: C.dark,
        });
        page.drawText(
          `Range ufficiale: ${z.prezzo_mq_min.toLocaleString("it-IT")} - ${z.prezzo_mq_max.toLocaleString("it-IT")} Euro/mq   |   Medio: ${z.prezzo_mq_medio.toLocaleString("it-IT")} Euro/mq`,
          { x: ML + 10, y: y - 36, size: 8.5, font, color: C.teal },
        );
        y -= 62;
      }

      // Mapbox static map
      if (mapboxImageBytes) {
        try {
          const mapImage = await doc.embedPng(mapboxImageBytes);
          // Display at content width, 560x240 aspect ratio → height = CW * (240/560)
          const imgW = CW;
          const imgH = Math.round(imgW * (240 / 560));
          if (y - imgH > 50) {
            page.drawImage(mapImage, { x: ML, y: y - imgH, width: imgW, height: imgH });
            y -= imgH + 10;
          }
        } catch (_) { /* skip if embed fails */ }
      }

      // POI summary strip
      if (val.poi_summary) {
        page.drawText("PUNTI DI INTERESSE ENTRO 500m", { x: ML, y, size: 7.5, font, color: C.gray });
        y -= 13;
        page.drawText(val.poi_summary as string, { x: ML, y, size: 9, font, color: C.dark });
        y -= 20;
      }

      // Zone description paragraphs
      if (val.descrizione_zona) {
        if (val.zone_omi || mapboxImageBytes || val.poi_summary) {
          page.drawLine({ start: { x: ML, y }, end: { x: MR, y }, thickness: 0.5, color: C.lightGray });
          y -= 14;
        }
        const paras = val.descrizione_zona.split(/\n\n+/).map((p: string) => p.trim()).filter(Boolean);
        for (const para of paras) {
          if (y < 80) break;
          const lines = wrapText(para, 86);
          for (const line of lines) {
            if (y < 60) break;
            page.drawText(line, { x: ML, y, size: 9.5, font, color: C.dark });
            y -= 14;
          }
          y -= 10;
        }
      }
    }

    // =========================================================================
    // PAGE 4 — MERCATO LOCALE
    // =========================================================================
    {
      const page = doc.addPage([W, H]);
      drawFooter(page, font, fontBold);
      let y = drawSectionHeader(page, fontBold, `MERCATO ${val.citta.toUpperCase()}`);

      // Subheading
      if (val.zone_omi) {
        page.drawText(`ANDAMENTO DEL VALORE MEDIO IMMOBILIARE — ZONA ${val.zone_omi.codice_zona}`, {
          x: ML, y, size: 8.5, font: fontBold, color: C.dark,
        });
        y -= 18;
      } else {
        page.drawText(`ANDAMENTO DEL VALORE MEDIO IMMOBILIARE — ${val.citta.toUpperCase()}`, {
          x: ML, y, size: 8.5, font: fontBold, color: C.dark,
        });
        y -= 18;
      }

      // Line chart
      if (trendData.length >= 2) {
        const chartLeft = ML + 30;  // room for Y labels
        const chartBottom = y - 175;
        const chartW = CW - 50;
        const chartH = 150;

        const prices = trendData.map((d: { anno: number; prezzo_mq: number }) => d.prezzo_mq);
        const minP = Math.min(...prices);
        const maxP = Math.max(...prices);
        const pRange = maxP === minP ? 1 : maxP - minP;

        const toX = (i: number) => chartLeft + (i / (trendData.length - 1)) * chartW;
        const toY = (p: number) => chartBottom + ((p - minP) / pRange) * chartH;

        // Chart background
        page.drawRectangle({
          x: chartLeft - 2, y: chartBottom - 2,
          width: chartW + 4, height: chartH + 4,
          color: rgb(0.97, 0.97, 0.97),
        });

        // Horizontal grid lines (5 lines)
        for (let i = 0; i <= 4; i++) {
          const gy = chartBottom + (i / 4) * chartH;
          const gv = minP + (i / 4) * pRange;
          page.drawLine({
            start: { x: chartLeft, y: gy },
            end: { x: chartLeft + chartW, y: gy },
            thickness: i === 0 ? 0.8 : 0.3,
            color: i === 0 ? C.midGray : rgb(0.82, 0.82, 0.82),
          });
          // Y-axis label
          page.drawText(`${Math.round(gv / 100) * 100}`, {
            x: ML - 2, y: gy - 4, size: 6.5, font, color: C.gray,
          });
        }

        // Year labels + data points + connecting lines
        for (let i = 0; i < trendData.length; i++) {
          const px = toX(i);
          const py = toY(trendData[i].prezzo_mq);

          // Year label (every 2 years or all if few)
          if (trendData.length <= 8 || i % 2 === 0) {
            page.drawText(String(trendData[i].anno), {
              x: px - 10, y: chartBottom - 14, size: 6.5, font, color: C.gray,
            });
          }

          // Data point dot
          page.drawEllipse({ x: px, y: py, xScale: 3.5, yScale: 3.5, color: C.teal });

          // Line to next
          if (i < trendData.length - 1) {
            const nx = toX(i + 1);
            const ny = toY(trendData[i + 1].prezzo_mq);
            page.drawLine({ start: { x: px, y: py }, end: { x: nx, y: ny }, thickness: 2, color: C.teal });
          }
        }

        y = chartBottom - 30;
      }

      // Market commentary from motivazione_ai paragraph 1
      if (y > 80 && val.motivazione_ai) {
        const paras = (val.motivazione_ai as string).split(/\n\n+/).map((p: string) => p.trim()).filter(Boolean);
        if (paras.length > 0) {
          page.drawLine({ start: { x: ML, y }, end: { x: MR, y }, thickness: 0.5, color: C.lightGray });
          y -= 15;
          page.drawText("ANALISI DI CONTESTO", { x: ML, y, size: 7.5, font, color: C.gray });
          y -= 14;
          const lines = wrapText(paras[0], 90);
          for (const line of lines) {
            if (y < 60) break;
            page.drawText(line, { x: ML, y, size: 9, font, color: C.dark });
            y -= 13;
          }
        }
      }
    }

    // =========================================================================
    // PAGE 5 — LA NOSTRA VALUTAZIONE
    // =========================================================================
    {
      const page = doc.addPage([W, H]);
      drawFooter(page, font, fontBold);
      let y = drawSectionHeader(page, fontBold, "LA NOSTRA VALUTAZIONE");

      // Intro sentence
      const tipologia = val.tipologia ?? "immobile";
      const lead = val.leads;
      const priceRange = `${fmtEuro(val.stima_min)} e ${fmtEuro(val.stima_max)}`;
      const intro = `Valutazione Immobiliare: Dopo un'accurata analisi, la nostra agenzia "IL TUO IMMOBILIARE" ha stimato il valore di mercato di ${lead ? `questo ${tipologia} di ${lead.nome} ${lead.cognome}` : `questo ${tipologia}`} tra i ${priceRange}. La nostra valutazione si basa su:`;
      const introLines = wrapText(intro, 82);
      for (const line of introLines) {
        page.drawText(line, { x: ML, y, size: 9.5, font: fontBold, color: C.dark });
        y -= 14;
      }
      y -= 4;
      page.drawText("• Conoscenza approfondita del mercato immobiliare locale e della domanda/offerta nella zona.", {
        x: ML, y, size: 9, font, color: C.dark,
      });
      y -= 13;
      page.drawText("• Analisi delle transazioni recenti e del trend dei prezzi per immobili di caratteristiche simili.", {
        x: ML, y, size: 9, font, color: C.dark,
      });
      y -= 22;

      // Bar chart — Valore Minimo vs Valore Massimo
      if (val.stima_min && val.stima_max) {
        const barW = 105;
        const barGap = 90;
        const barMaxH = 130;
        const barBottom = y - barMaxH - 28;
        const totalW = 2 * barW + barGap;
        const startX = ML + (CW - totalW) / 2;

        const ratio = val.stima_min / val.stima_max;
        const minBarH = Math.round(ratio * barMaxH);

        // Chart title
        const ctitle = `Valutazione Immobiliare — ${val.indirizzo}`;
        const ctitleLines = wrapText(ctitle, 70);
        for (const line of ctitleLines.slice(0, 1)) {
          page.drawText(line, {
            x: ML + CW / 2 - (line.length * 3.5),
            y: barBottom + barMaxH + 22,
            size: 8, font, color: C.gray,
          });
        }

        // Min bar
        page.drawRectangle({ x: startX, y: barBottom, width: barW, height: minBarH, color: C.tealLight });
        page.drawText(fmtEuro(val.stima_min), {
          x: startX + barW / 2 - (fmtEuro(val.stima_min).length * 2.8),
          y: barBottom + minBarH + 5, size: 9, font: fontBold, color: C.teal,
        });
        page.drawText("Valore Minimo", {
          x: startX + barW / 2 - 35, y: barBottom - 13, size: 8, font, color: C.gray,
        });

        // Max bar
        const bar2X = startX + barW + barGap;
        page.drawRectangle({ x: bar2X, y: barBottom, width: barW, height: barMaxH, color: C.teal });
        page.drawText(fmtEuro(val.stima_max), {
          x: bar2X + barW / 2 - (fmtEuro(val.stima_max).length * 2.8),
          y: barBottom + barMaxH + 5, size: 9, font: fontBold, color: C.teal,
        });
        page.drawText("Valore Massimo", {
          x: bar2X + barW / 2 - 37, y: barBottom - 13, size: 8, font, color: C.gray,
        });

        y = barBottom - 32;
      }

      // ── Doppio scenario (Potenziale Non Espresso) ─────────────────────────
      const hasDoppioScenario =
        val.stima_ristrutturato_min &&
        val.stima_ristrutturato_max &&
        val.stima_min &&
        val.stima_ristrutturato_min > val.stima_min;

      if (hasDoppioScenario && y > 120) {
        y -= 4;
        page.drawLine({ start: { x: ML, y }, end: { x: MR, y }, thickness: 0.5, color: C.lightGray });
        y -= 14;
        page.drawText("POTENZIALE NON ESPRESSO", { x: ML, y, size: 7.5, font, color: C.gray });
        y -= 14;

        // Two-column layout
        const col1X = ML;
        const col2X = ML + CW / 2 + 10;
        const colW = CW / 2 - 20;

        // Left box — stato attuale
        page.drawRectangle({ x: col1X, y: y - 32, width: colW, height: 40, color: C.lightGray });
        page.drawText("Stato attuale", { x: col1X + 8, y: y - 6, size: 7.5, font, color: C.gray });
        page.drawText(`${fmtEuro(val.stima_min)} - ${fmtEuro(val.stima_max)}`, {
          x: col1X + 8, y: y - 20, size: 9, font: fontBold, color: C.dark,
        });

        // Right box — dopo restyling
        page.drawRectangle({ x: col2X, y: y - 32, width: colW, height: 40, color: rgb(0.90, 0.96, 0.93) });
        page.drawText("Dopo restyling", { x: col2X + 8, y: y - 6, size: 7.5, font, color: C.gray });
        page.drawText(`${fmtEuro(val.stima_ristrutturato_min)} - ${fmtEuro(val.stima_ristrutturato_max)}`, {
          x: col2X + 8, y: y - 20, size: 9, font: fontBold, color: C.green,
        });

        y -= 42;

        // Costo lavori
        if (val.costo_stima_lavori && val.costo_stima_lavori > 0) {
          page.drawText(`Costo indicativo lavori: ~${fmtEuro(val.costo_stima_lavori)}`, {
            x: ML, y, size: 8.5, font, color: C.gray,
          });
          y -= 16;
        }
      }

      // ── Tempo mercato ──────────────────────────────────────────────────────
      if (val.tempo_mercato && y > 80) {
        y -= 4;
        page.drawLine({ start: { x: ML, y }, end: { x: MR, y }, thickness: 0.5, color: C.lightGray });
        y -= 14;
        page.drawText("TEMPO STIMATO A MERCATO", { x: ML, y, size: 7.5, font, color: C.gray });
        y -= 13;
        page.drawRectangle({ x: ML, y: y - 10, width: 160, height: 22, color: C.tealLight });
        page.drawText(val.tempo_mercato as string, { x: ML + 10, y: y, size: 9, font: fontBold, color: C.tealDark });
        y -= 24;
      }

      // ── Identikit compratore ───────────────────────────────────────────────
      if (val.identikit_compratore && y > 80) {
        y -= 4;
        page.drawLine({ start: { x: ML, y }, end: { x: MR, y }, thickness: 0.5, color: C.lightGray });
        y -= 14;
        page.drawText("IDENTIKIT DEL COMPRATORE IDEALE", { x: ML, y, size: 7.5, font, color: C.gray });
        y -= 13;
        const identikitLines = wrapText(val.identikit_compratore as string, 90);
        for (const line of identikitLines.slice(0, 5)) {
          if (y < 60) break;
          page.drawText(line, { x: ML, y, size: 9, font, color: C.dark });
          y -= 13;
        }
      }

      // Breakdown factors
      if (breakdown?.fattori?.length > 0 && y > 120) {
        page.drawLine({ start: { x: ML, y }, end: { x: MR, y }, thickness: 0.5, color: C.lightGray });
        y -= 14;
        page.drawText("FATTORI DI CORREZIONE APPLICATI", { x: ML, y, size: 7.5, font, color: C.gray });
        y -= 13;

        if (breakdown.prezzo_mq_base) {
          page.drawText(`Prezzo/mq base OMI: ${breakdown.prezzo_mq_base.toLocaleString("it-IT")} Euro/mq`, {
            x: ML, y, size: 8.5, font, color: C.gray,
          });
          y -= 13;
        }

        for (const f of (breakdown.fattori ?? []).slice(0, 7)) {
          if (y < 60) break;
          const sign = f.delta_percentuale > 0 ? "+" : "";
          const pct = `${sign}${f.delta_percentuale}%`;
          const nameLines = wrapText(`• ${f.nome}`, 62);
          page.drawText(nameLines[0], { x: ML, y, size: 8.5, font, color: C.dark });
          page.drawText(pct, {
            x: MR - (pct.length * 5.5),
            y,
            size: 8.5, font: fontBold,
            color: f.delta_percentuale > 0 ? C.teal : C.rose,
          });
          y -= 13;
          if (f.nota && y > 60) {
            const notaLines = wrapText(f.nota, 80);
            page.drawText(notaLines[0], { x: ML + 10, y, size: 7.5, font, color: C.gray });
            y -= 11;
          }
        }

        if (breakdown.prezzo_mq_finale && y > 60) {
          y -= 4;
          page.drawRectangle({ x: ML, y: y - 10, width: CW, height: 22, color: rgb(0.90, 0.93, 0.93) });
          page.drawText(`Prezzo/mq finale: ${breakdown.prezzo_mq_finale.toLocaleString("it-IT")} Euro/mq`, {
            x: ML + 8, y: y, size: 8.5, font: fontBold, color: C.teal,
          });
          y -= 22;
        }
      }

      // AI paragraphs 2 & 3 (technical + conclusion) if space
      if (val.motivazione_ai && y > 80) {
        const paras = (val.motivazione_ai as string).split(/\n\n+/).map((p: string) => p.trim()).filter(Boolean);
        const labels = ["ANALISI TECNICA", "CONCLUSIONE STRATEGICA"];
        for (let i = 1; i < Math.min(paras.length, 3); i++) {
          if (y < 80) break;
          y -= 6;
          page.drawLine({ start: { x: ML, y }, end: { x: MR, y }, thickness: 0.5, color: C.lightGray });
          y -= 14;
          page.drawText(labels[i - 1] ?? "", { x: ML, y, size: 7.5, font, color: C.teal });
          y -= 13;
          const lines = wrapText(paras[i], 90);
          for (const line of lines) {
            if (y < 60) break;
            page.drawText(line, { x: ML, y, size: 9, font, color: C.dark });
            y -= 13;
          }
        }
      }
    }

    // =========================================================================
    // Serialize
    // =========================================================================
    const pdfBytes = await doc.save();

    // Safe base64 encoding (avoids stack overflow for large arrays)
    let binary = "";
    const bytes = new Uint8Array(pdfBytes);
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const pdf_base64 = btoa(binary);

    return new Response(JSON.stringify({ pdf_base64 }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
