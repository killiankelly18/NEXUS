// src/workspace/uploaders.ts
import type {
  PageEmbedding,
  AuthorityRow,
  KeywordRow,
} from "./WorkspaceContext";

/** Simple CSV parser (first row = header). Handles quotes & commas. */
export function parseCSV(text: string): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return rows;

  const headers = splitCsvLine(lines[0]);
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => (row[h] = cells[idx] ?? ""));
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'; // escaped quote
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

/** Parse embedding string like "[0.12, -0.03, ...]" into number[] */
export function parseEmbedding(raw?: string): number[] | null {
  if (!raw) return null;
  try {
    const cleaned = raw.trim().replace(/^\[/, "").replace(/\]$/, "");
    const values = cleaned.split(",").map((v) => Number(v.trim()));
    return values.length > 10 && values.every((n) => Number.isFinite(n))
      ? values
      : null;
  } catch {
    return null;
  }
}

/** Map a CSV row to a URL string (supports several common column names) */
export function pickUrl(row: Record<string, string>): string {
  return (
    row.Address ||
    row.URL ||
    row.Url ||
    row.url ||
    row.Page ||
    row.page ||
    ""
  ).trim();
}

/** ----- Shapers for each upload type ----- */

/** 1) Site pages with precomputed embeddings */
export function rowsToPageEmbeddings(
  rows: Record<string, string>[]
): PageEmbedding[] {
  const out: PageEmbedding[] = [];
  for (const r of rows) {
    const url = pickUrl(r);
    const emb =
      parseEmbedding(r["Extract semantic embeddings from page"]) ||
      parseEmbedding(r["Extract semantic embeddings"]) ||
      parseEmbedding(r["Embeddings"]) ||
      parseEmbedding(r["embedding"]) ||
      parseEmbedding(r["embeddings"]);
    if (url && emb) out.push({ url, embedding: emb, meta: r });
  }
  return out;
}

/** 2) Authority data (DR / Clicks) */
export function rowsToAuthority(
  rows: Record<string, string>[]
): AuthorityRow[] {
  return rows
    .map((r) => {
      const url = pickUrl(r);
      const dr = Number(r.DR || r["Domain Rating"] || r.dr || "");
      const clicks = Number(r.Clicks || r.clicks || "");
      return {
        url,
        dr: Number.isFinite(dr) ? dr : undefined,
        clicks: Number.isFinite(clicks) ? clicks : undefined,
        ...r,
      };
    })
    .filter((r) => !!r.url);
}

/** 3) Keywords / queries */
export function rowsToKeywords(rows: Record<string, string>[]): KeywordRow[] {
  return rows
    .map((r) => {
      const keyword =
        r.Keyword ||
        r.keyword ||
        r.Query ||
        r.query ||
        r.Phrase ||
        r.phrase ||
        "";
      return keyword ? ({ keyword, ...r } as KeywordRow) : null;
    })
    .filter(Boolean) as KeywordRow[];
}

/** File -> text helper */
export async function fileToText(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onerror = () => rej(new Error("Failed to read file"));
    reader.onload = () => res(String(reader.result || ""));
    reader.readAsText(f);
  });
}
