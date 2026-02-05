// src/lib/csv.ts
// Robust CSV reader with quoted-field handling, header normalization, aliasing, and required checks.

export type CsvRow = Record<string, string>;
export type CsvReadResult = { headers: string[]; rows: CsvRow[] };
export type AliasMap = Record<string, string[]>;

export type ReadCsvOptions = {
  required?: string[]; // canonical keys required after aliasing
  aliases?: AliasMap; // canonicalKey -> [alias1, alias2, ...]
};

// Default alias set per your constraints
export const DEFAULT_ALIASES: AliasMap = {
  // URLs
  URL: ["Address", "URL", "url", "Page", "page"],

  // Embeddings
  Embeddings: [
    "Extract semantic embeddings from page",
    "Extract semantic embeddings",
    "embeddings",
    "embedding",
    "Embeddings",
  ],

  // Authority (optional)
  Authority: ["DR", "Domain Rating", "Clicks"],

  // Keywords (optional)
  Keywords: ["Keyword", "keyword", "Query", "Top Keywords"],
};

/**
 * Normalize a header to a comparable token:
 * - strip BOM
 * - trim
 * - collapse internal whitespace
 * - lowercase
 * - remove most punctuation except alphanumerics and spaces
 */
function normalizeHeader(raw: string): string {
  if (!raw) return "";
  // strip BOM if present
  const s = raw.replace(/^\uFEFF/, "");
  return s
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, ""); // keep letters/numbers/spaces
}

/** Build a reverse lookup from normalized alias -> canonical */
function buildAliasLookup(aliases?: AliasMap): Record<string, string> {
  const map: Record<string, string> = {};
  const src = aliases ?? DEFAULT_ALIASES;
  for (const [canonical, list] of Object.entries(src)) {
    // include canonical itself
    map[normalizeHeader(canonical)] = canonical;
    for (const a of list) map[normalizeHeader(a)] = canonical;
  }
  return map;
}

/** Auto-detect delimiter among common candidates using first non-empty line */
function detectDelimiter(line: string): string {
  const candidates = [",", "\t", ";", "|"];
  let best = ",";
  let bestCount = -1;
  for (const d of candidates) {
    const count = (line.match(new RegExp(`\\${d}`, "g")) || []).length;
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

/** Parse CSV text with quoted-field handling and CRLF tolerance */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let i = 0;
  const n = text.length;
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    rows.push(row);
    row = [];
  };

  while (i < n) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        // Lookahead for escaped quote
        if (i + 1 < n && text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        field += ch;
        i++;
        continue;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (ch === "," || ch === "\t" || ch === ";" || ch === "|") {
        // NOTE: we will re-split later using detected delimiter; keep as is here
        field += ch;
        i++;
        continue;
      }
      if (ch === "\r") {
        // normalize CRLF
        i++;
        if (i < n && text[i] === "\n") i++;
        // end of record after we split by delimiter; mark newline
        field += "\n";
        continue;
      }
      if (ch === "\n") {
        field += "\n";
        i++;
        continue;
      }
      field += ch;
      i++;
    }
  }
  // finalize last field/row via a second pass split
  // First, split by physical lines (we preserved newlines inside quotes as literal \n)
  const physicalLines = (field ? text + "" : text).split(/\r?\n/); // fallback to simple line split
  // If our state-machine didn't construct rows (because we chose a simpler finalization),
  // do a fresh robust pass line by line with delimiter detection:

  // Detect delimiter from header line (first non-empty)
  const headerLine = physicalLines.find((l) => l.trim().length > 0) ?? "";
  const delimiter = detectDelimiter(headerLine);

  const out: string[][] = [];
  for (const line of physicalLines) {
    // skip empty trailing line
    if (line === "" && out.length > 0) continue;
    out.push(splitLine(line, delimiter));
  }
  return out;
}

/** Split a single CSV line by delimiter with quote handling */
function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let i = 0;
  const n = line.length;
  let field = "";
  let inQuotes = false;

  while (i < n) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < n && line[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        field += ch;
        i++;
        continue;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (ch === delimiter) {
        out.push(field);
        field = "";
        i++;
        continue;
      }
      field += ch;
      i++;
    }
  }
  out.push(field);
  return out;
}

/** Convert array-of-arrays to objects, applying alias mapping and required checks */
function shapeRows(matrix: string[][]): { headers: string[]; rows: CsvRow[] } {
  if (!matrix.length) return { headers: [], rows: [] };

  // Find the first non-empty header row
  let headerRow = matrix[0];
  let headerIdx = 0;
  for (let r = 0; r < matrix.length; r++) {
    const nonEmpty = matrix[r].some((c) => String(c || "").trim() !== "");
    if (nonEmpty) {
      headerRow = matrix[r];
      headerIdx = r;
      break;
    }
  }

  const dataRows = matrix.slice(headerIdx + 1);

  // Normalize headers (keep original too)
  const rawHeaders = headerRow.map((h) =>
    (h ?? "").replace(/^\uFEFF/, "").trim()
  );
  const normHeaders = rawHeaders.map((h) => normalizeHeader(h));

  return {
    headers: normHeaders,
    rows: dataRows
      .filter((r) => r.some((c) => String(c || "").trim() !== ""))
      .map((r) => {
        const obj: CsvRow = {};
        for (let i = 0; i < normHeaders.length; i++) {
          const key = normHeaders[i] || `col_${i}`;
          obj[key] = r[i] ?? "";
        }
        return obj;
      }),
  };
}

/** Apply alias map to rows: adds canonical keys when found via aliases */
function applyAliases(
  headers: string[],
  rows: CsvRow[],
  aliases?: AliasMap
): { headers: string[]; rows: CsvRow[]; used: Record<string, string> } {
  const lookup = buildAliasLookup(aliases);
  const aliasToCanonical: Record<string, string> = {};

  // Build mapping for present headers
  for (const h of headers) {
    const canonical = lookup[h];
    if (canonical) aliasToCanonical[h] = canonical;
  }

  const augmentedRows: CsvRow[] = rows.map((row) => {
    const out: CsvRow = { ...row };
    // If a present header is an alias, create/overwrite its canonical key
    for (const [h, canonical] of Object.entries(aliasToCanonical)) {
      const val = row[h];
      if (val !== undefined && val !== "" && !(canonical in out)) {
        out[normalizeHeader(canonical)] = val;
      }
    }
    return out;
  });

  // Build final header set: include canonicals + any existing
  const headerSet = new Set(headers);
  for (const canonical of Object.values(aliasToCanonical)) {
    headerSet.add(normalizeHeader(canonical));
  }

  return {
    headers: Array.from(headerSet),
    rows: augmentedRows,
    used: aliasToCanonical,
  };
}

/** Ensure required canonical keys exist (post-aliasing) */
function enforceRequired(headers: string[], required?: string[]) {
  if (!required || !required.length) return;
  const set = new Set(headers);
  const missing = required
    .map((k) => normalizeHeader(k))
    .filter((k) => !set.has(k));
  if (missing.length) {
    throw new Error(`CSV is missing required columns: ${missing.join(", ")}`);
  }
}

/**
 * Read a CSV from a File (browser) or string and return normalized headers and rows.
 * - Applies aliasing (DEFAULT_ALIASES unless overridden)
 * - Returns keys normalized (normalizeHeader)
 * - Does NOT coerce types (everything is string here)
 */
export async function readCsv(
  fileOrText: File | string,
  options: ReadCsvOptions = {}
): Promise<{ headers: string[]; rows: CsvRow[] }> {
  let text: string;
  if (typeof fileOrText === "string") {
    text = fileOrText;
  } else {
    // Browser File
    text = await fileOrText.text();
  }

  // Fast path for blank
  if (!text || !text.trim()) return { headers: [], rows: [] };

  // Parse to matrix
  const matrix = parseCsv(text);

  // Shape to rows with normalized headers
  const shaped = shapeRows(matrix);

  // Apply aliases and required
  const { headers, rows } = applyAliases(
    shaped.headers,
    shaped.rows,
    options.aliases ?? DEFAULT_ALIASES
  );

  enforceRequired(headers, options.required);

  return { headers, rows };
}

/** Helper to fetch a value by canonical key or its aliases from a row */
export function getValue(
  row: CsvRow,
  canonicalKey: string,
  aliases?: AliasMap
): string | undefined {
  const lookup = buildAliasLookup(aliases ?? DEFAULT_ALIASES);
  const canonNorm = normalizeHeader(canonicalKey);
  // If canonical exists directly
  if (row[canonNorm] !== undefined) return row[canonNorm];

  // Try any alias that maps to this canonical
  for (const [normAlias, canonical] of Object.entries(lookup)) {
    if (canonical === canonicalKey && row[normAlias] !== undefined) {
      return row[normAlias];
    }
  }
  return undefined;
}

export { normalizeHeader as normalizeHeaderForCsv };
