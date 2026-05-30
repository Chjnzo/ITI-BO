import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CHANGE_THRESHOLD = 0.03; // 3% price change threshold
const STALENESS_DAYS = 180;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ZoneOmiRow {
  id: string;
  codice_zona: string;
  comune: string;
  provincia: string;
  fascia: string;
  zona: string;
  prezzo_mq_min: number;
  prezzo_mq_max: number;
  updated_at: string;
}

interface SyncResult {
  success: boolean;
  updated: number;
  unchanged: number;
  not_found: number;
  errors: string[];
  source_url?: string;
}

interface CsvRow {
  comune: string;
  fascia: string;
  zona: string;
  tipologia: string;
  val_min: number;
  val_max: number;
}

// ---------------------------------------------------------------------------
// CSV parsing utilities
// ---------------------------------------------------------------------------

/**
 * Finds column index by trying multiple header name variants (case-insensitive).
 */
function findColIndex(headers: string[], candidates: string[]): number {
  const normalised = headers.map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  for (const candidate of candidates) {
    const idx = normalised.indexOf(candidate.toLowerCase().replace(/\s+/g, "_"));
    if (idx !== -1) return idx;
  }
  return -1;
}

/**
 * Parses a semicolon-delimited OMI CSV string.
 * Returns only residential ("abitazioni civili") rows for province BG.
 */
function parseCsv(raw: string): CsvRow[] {
  // Normalise line endings
  const lines = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  // Find the header line — some OMI files have metadata rows before the header
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    if (lower.includes("comune") && lower.includes("fascia")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) throw new Error("CSV header not found (expected columns: Comune, Fascia)");

  const headers = lines[headerIdx].split(";");

  // Column detection — handle different OMI release spellings
  const iComune = findColIndex(headers, ["comune"]);
  const iFascia = findColIndex(headers, ["fascia"]);
  const iZona = findColIndex(headers, ["zona", "descr_zona", "descrizione_zona"]);
  const iTipologia = findColIndex(headers, ["tipologia", "descr_tipologia", "tipo_immobile"]);
  const iValMin = findColIndex(headers, ["val_min", "valore_min", "prezzo_min", "min"]);
  const iValMax = findColIndex(headers, ["val_max", "valore_max", "prezzo_max", "max"]);
  const iProvCode = findColIndex(headers, ["cod_prov", "cod_provincia", "codice_provincia"]);

  if (iComune === -1) throw new Error("Column 'Comune' not found in CSV");
  if (iFascia === -1) throw new Error("Column 'Fascia' not found in CSV");
  if (iValMin === -1) throw new Error("Column 'Val_min' not found in CSV");
  if (iValMax === -1) throw new Error("Column 'Val_max' not found in CSV");

  const rows: CsvRow[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = line.split(";");

    // Filter by province BG when the column is present
    if (iProvCode !== -1) {
      const prov = (cols[iProvCode] ?? "").trim().toUpperCase();
      if (prov !== "BG") continue;
    }

    const tipologia = iTipologia !== -1 ? (cols[iTipologia] ?? "").trim().toLowerCase() : "";
    if (iTipologia !== -1 && !tipologia.includes("abitazioni civili")) continue;

    const valMinRaw = (cols[iValMin] ?? "").trim().replace(",", ".");
    const valMaxRaw = (cols[iValMax] ?? "").trim().replace(",", ".");
    const valMin = parseFloat(valMinRaw);
    const valMax = parseFloat(valMaxRaw);

    if (isNaN(valMin) || isNaN(valMax)) continue;

    rows.push({
      comune: (cols[iComune] ?? "").trim(),
      fascia: (cols[iFascia] ?? "").trim(),
      zona: iZona !== -1 ? (cols[iZona] ?? "").trim() : "",
      tipologia,
      val_min: valMin,
      val_max: valMax,
    });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Freshness check (no CSV provided)
// ---------------------------------------------------------------------------

async function checkFreshness(supabase: ReturnType<typeof createClient>) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - STALENESS_DAYS);

  const { count, error } = await supabase
    .from("zone_omi")
    .select("id", { count: "exact", head: true })
    .lt("updated_at", cutoff.toISOString());

  if (error) throw new Error(`Freshness check failed: ${error.message}`);

  const { count: total } = await supabase
    .from("zone_omi")
    .select("id", { count: "exact", head: true });

  return {
    status: "no_source_provided",
    stale_zones: count ?? 0,
    total_zones: total ?? 0,
    staleness_threshold_days: STALENESS_DAYS,
    message:
      count && count > 0
        ? `${count} zone(s) have not been updated in over ${STALENESS_DAYS} days.`
        : "All zones are up to date.",
  };
}

// ---------------------------------------------------------------------------
// Sync logic
// ---------------------------------------------------------------------------

async function syncZones(
  supabase: ReturnType<typeof createClient>,
  csvRows: CsvRow[],
  sourceUrl: string | undefined
): Promise<SyncResult> {
  const result: SyncResult = {
    success: true,
    updated: 0,
    unchanged: 0,
    not_found: 0,
    errors: [],
    source_url: sourceUrl,
  };

  // Load all existing zone_omi rows once
  const { data: existingZones, error: fetchError } = await supabase
    .from("zone_omi")
    .select("id, comune, fascia, prezzo_mq_min, prezzo_mq_max, updated_at");

  if (fetchError) throw new Error(`Failed to fetch zone_omi: ${fetchError.message}`);

  const zoneMap = new Map<string, ZoneOmiRow>();
  for (const z of existingZones ?? []) {
    // Key: normalised comune + "|" + normalised fascia
    const key = `${z.comune.trim().toLowerCase()}|${z.fascia.trim().toLowerCase()}`;
    zoneMap.set(key, z as ZoneOmiRow);
  }

  const now = new Date().toISOString();

  for (const row of csvRows) {
    const key = `${row.comune.trim().toLowerCase()}|${row.fascia.trim().toLowerCase()}`;
    const existing = zoneMap.get(key);

    if (!existing) {
      result.not_found++;
      continue;
    }

    const currentMin = existing.prezzo_mq_min;
    const currentMax = existing.prezzo_mq_max;

    const changeMin = currentMin > 0 ? Math.abs(row.val_min - currentMin) / currentMin : 1;
    const changeMax = currentMax > 0 ? Math.abs(row.val_max - currentMax) / currentMax : 1;

    if (changeMin > CHANGE_THRESHOLD || changeMax > CHANGE_THRESHOLD) {
      // Meaningful price change — update values + timestamp
      const { error: updateError } = await supabase
        .from("zone_omi")
        .update({
          prezzo_mq_min: row.val_min,
          prezzo_mq_max: row.val_max,
          updated_at: now,
        })
        .eq("id", existing.id);

      if (updateError) {
        result.errors.push(`Update failed for ${row.comune}/${row.fascia}: ${updateError.message}`);
      } else {
        result.updated++;
      }
    } else {
      // Price unchanged beyond threshold — just refresh the timestamp
      const { error: touchError } = await supabase
        .from("zone_omi")
        .update({ updated_at: now })
        .eq("id", existing.id);

      if (touchError) {
        result.errors.push(`Touch failed for ${row.comune}/${row.fascia}: ${touchError.message}`);
      } else {
        result.unchanged++;
      }
    }
  }

  if (result.errors.length > 0) {
    result.success = false;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Log run
// ---------------------------------------------------------------------------

async function logRun(
  supabase: ReturnType<typeof createClient>,
  status: string,
  syncResult: Partial<SyncResult> & { error_message?: string; details?: unknown }
) {
  await supabase.from("zone_omi_sync_log").insert({
    status,
    zones_updated: syncResult.updated ?? 0,
    zones_unchanged: syncResult.unchanged ?? 0,
    zones_not_found: syncResult.not_found ?? 0,
    source_url: syncResult.source_url ?? null,
    error_message: syncResult.error_message ?? null,
    details: syncResult.details ?? null,
  });
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // Supabase admin client — prefer APP_SUPABASE_URL (custom secret) over auto-injected SUPABASE_URL
  const supabaseUrl = (Deno.env.get("APP_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL"))!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    let sourceUrl: string | undefined;
    let csvData: string | undefined;

    // Parse request body (POST only)
    if (req.method === "POST") {
      const contentType = req.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const body = await req.json().catch(() => ({}));
        sourceUrl = body.source_url;
        csvData = body.csv_data;
      }
    }

    // Fall back to env var URL if nothing in body
    if (!csvData && !sourceUrl) {
      sourceUrl = Deno.env.get("OMI_CSV_URL");
    }

    // No source at all — return freshness status
    if (!csvData && !sourceUrl) {
      const freshness = await checkFreshness(supabase);
      await logRun(supabase, "freshness_check", { details: freshness });
      return new Response(JSON.stringify(freshness), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Fetch CSV from URL if needed
    if (!csvData && sourceUrl) {
      const fetchResp = await fetch(sourceUrl);
      if (!fetchResp.ok) {
        const msg = `Failed to fetch CSV from ${sourceUrl}: HTTP ${fetchResp.status}`;
        await logRun(supabase, "error", { error_message: msg, source_url: sourceUrl });
        return new Response(JSON.stringify({ success: false, error: msg }), {
          status: 502,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
      csvData = await fetchResp.text();
    }

    // Parse CSV
    let rows: CsvRow[];
    try {
      rows = parseCsv(csvData!);
    } catch (parseErr) {
      const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      await logRun(supabase, "error", {
        error_message: `CSV parse error: ${msg}`,
        source_url: sourceUrl,
      });
      return new Response(JSON.stringify({ success: false, error: `CSV parse error: ${msg}` }), {
        status: 422,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    if (rows.length === 0) {
      const msg = "CSV parsed successfully but no matching rows found (BG province, abitazioni civili)";
      await logRun(supabase, "warning", {
        error_message: msg,
        source_url: sourceUrl,
        details: { rows_parsed: 0 },
      });
      return new Response(
        JSON.stringify({ success: true, updated: 0, unchanged: 0, not_found: 0, errors: [], warning: msg }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Sync
    const syncResult = await syncZones(supabase, rows, sourceUrl);

    await logRun(supabase, syncResult.success ? "success" : "partial_error", {
      ...syncResult,
      details: {
        rows_parsed: rows.length,
        errors: syncResult.errors.length > 0 ? syncResult.errors : undefined,
      },
    });

    return new Response(JSON.stringify(syncResult), {
      status: syncResult.success ? 200 : 207,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sync-zone-omi] Unhandled error:", msg);

    try {
      const supabaseFallback = createClient(
        (Deno.env.get("APP_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL"))!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      await logRun(supabaseFallback, "error", { error_message: msg });
    } catch (_logErr) {
      // Swallow logging failure
    }

    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
