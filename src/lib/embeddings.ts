// src/lib/embeddings.ts
// Client-Side Version: Uses Gemini API Key directly (No Proxy)

import {
  DEFAULT_ALIASES,
  getValue,
  normalizeHeaderForCsv,
  CsvRow,
} from "./csv";

export type GetPageEmbeddingOptions = {
  aliases?: typeof DEFAULT_ALIASES;
  preferPrecomputed?: boolean;
  fallbackSize?: number;
};

/* --- Utilities --- */

export function parseEmbeddingCell(raw?: string | null): number[] | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  try {
    const arr = JSON.parse(s);
    if (Array.isArray(arr)) {
      const nums = arr.map((v) => Number(v)).filter((v) => Number.isFinite(v));
      return nums.length ? nums : null;
    }
  } catch {
    /* ignore */
  }
  const cleaned = s.replace(/^[\[\(\{]+|[\]\)\}]+$/g, "").trim();
  const parts =
    cleaned.indexOf(",") !== -1 ? cleaned.split(",") : cleaned.split(/\s+/g);
  const nums = parts.map((p) => Number(p)).filter((v) => Number.isFinite(v));
  return nums.length ? nums : null;
}

function joinText(parts: Array<string | undefined>): string {
  return parts
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTextFields(row: CsvRow, aliases = DEFAULT_ALIASES): string {
  const candidateKeys = [
    "title",
    "meta",
    "metadescription",
    "description",
    "h1",
    "content",
    "body",
    "text",
  ];
  const chunks: string[] = [];
  const url = getValue(row, "URL", aliases);
  if (url) chunks.push(url);
  for (const key of candidateKeys) {
    const norm = normalizeHeaderForCsv(key);
    if (row[norm]) chunks.push(row[norm]);
  }
  if (chunks.length === 0) {
    const all = Object.values(row)
      .filter((v) => typeof v === "string")
      .slice(0, 10);
    return joinText(all as string[]);
  }
  return joinText(chunks);
}

/* --- Core Embedding Functions --- */

export type Embedder = (texts: string[]) => Promise<number[][]>;
const MODEL = "text-embedding-004";
const CACHE_MAX = 50_000;
const cache = new Map<string, number[]>();

function put(k: string, v: number[]) {
  if (cache.size >= CACHE_MAX) {
    const n = Math.floor(CACHE_MAX * 0.1);
    const it = cache.keys();
    for (let i = 0; i < n; i++) cache.delete(it.next().value);
  }
  cache.set(k, v);
}

// 1. Single Text Embedding (Client-Side)
export async function generateEmbedding(
  text: string,
  apiKey?: string
): Promise<number[]> {
  // Use the global key if not provided specifically
  if (!apiKey) {
    // Fallback or error if strictly needed.
    // For this function signature, we might need to rely on the caller passing it or a global context.
    // In the simple client-side version, we usually expect the caller (getPageEmbedding) to have access or we fail.
    // Ideally, we'd use the batch embedder below.
    console.warn("generateEmbedding called without API key");
    return [];
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent?key=${encodeURIComponent(
    apiKey
  )}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: `models/${MODEL}`,
        content: { parts: [{ text: text.slice(0, 9000) }] }, // Safety slice
      }),
    });
    if (!res.ok) throw new Error(`Embedding HTTP ${res.status}`);
    const data = await res.json();
    return data?.embedding?.values || [];
  } catch (e) {
    console.error("Single embedding failed", e);
    return [];
  }
}

// 2. Page Embedding Wrapper
export async function getPageEmbedding(
  row: CsvRow,
  options: GetPageEmbeddingOptions & { apiKey?: string } = {}
): Promise<number[]> {
  const {
    aliases = DEFAULT_ALIASES,
    preferPrecomputed = true,
    apiKey,
  } = options;

  if (preferPrecomputed) {
    const pre = getValue(row, "Embeddings", aliases);
    const parsed = parseEmbeddingCell(pre);
    if (parsed && parsed.length > 0) return parsed;
  }

  if (!apiKey) return []; // Cannot generate without key
  const text = extractTextFields(row, aliases);
  return await generateEmbedding(text, apiKey);
}

// 3. Batch Embedder (The one used by Clustering Tab)
export function makeGeminiEmbedder(apiKey: string): Embedder {
  if (!apiKey) {
    return async () => {
      throw new Error("Missing Gemini API key.");
    };
  }

  // Batch size for Gemini API
  const BATCH = 100;

  return async (texts: string[]) => {
    const clean = texts.map((t) => String(t || "").trim()).filter(Boolean);
    const uniq = Array.from(new Set(clean));
    const result = new Map<string, number[]>();
    const toFetch: string[] = [];

    // Check cache
    for (const t of uniq) {
      const hit = cache.get(t);
      if (hit) result.set(t, hit);
      else toFetch.push(t);
    }

    // Fetch in batches
    for (let i = 0; i < toFetch.length; i += BATCH) {
      const slice = toFetch.slice(i, i + BATCH);

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchEmbedContents?key=${encodeURIComponent(
        apiKey
      )}`;

      const body = {
        requests: slice.map((text) => ({
          model: `models/${MODEL}`,
          content: { parts: [{ text }] },
        })),
      };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        console.error(`Batch embed failed: ${res.status} ${msg}`);
        continue; // Skip this batch on error
      }

      const json = await res.json();
      const embeddings = json?.embeddings || [];

      for (let k = 0; k < slice.length; k++) {
        const vals = embeddings[k]?.values;
        if (vals) {
          result.set(slice[k], vals);
          put(slice[k], vals);
        }
      }
    }

    return clean.map((t) => result.get(t)!).filter(Boolean);
  };
}
