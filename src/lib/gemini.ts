/**
 * Gemini helpers for the "Original Setup" (Client-Side).
 * Calls generativelanguage.googleapis.com directly using the User's API Key.
 *
 * Updated to support:
 *  - Batch keyword embeddings (embedTextsBatch)
 *  - Safer JSON extraction
 */

const GENERATION_MODEL = "gemini-2.5-flash-lite";
const EMBEDDING_MODEL = "text-embedding-004";

/**
 * Exponential-backoff wrapper for Rate Limits (429).
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 3,
  delay = 2000
): Promise<Response> {
  try {
    const res = await fetch(url, options);

    if (res.status === 429 && retries > 0) {
      console.warn(`Rate limit hit. Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return fetchWithRetry(url, options, retries - 1, delay * 2);
    }

    return res;
  } catch (error) {
    if (retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return fetchWithRetry(url, options, retries - 1, delay * 2);
    }
    throw error;
  }
}

/**
 * Generate JSON-only output (Chat Completion with hard JSON extraction).
 */
export async function generateJSON(
  apiKey: string,
  prompt: string,
  opts?: {
    temperature?: number;
    topK?: number;
    topP?: number;
    maxOutputTokens?: number;
  }
): Promise<any> {
  if (!apiKey) throw new Error("Missing Gemini API key");
  if (!prompt?.trim()) throw new Error("Missing prompt");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GENERATION_MODEL}:generateContent?key=${encodeURIComponent(
    apiKey
  )}`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: opts?.temperature ?? 0.3,
      topK: opts?.topK ?? 40,
      topP: opts?.topP ?? 0.95,
      maxOutputTokens: opts?.maxOutputTokens ?? 2048,
      responseMimeType: "application/json",
    },
  };

  const res = await fetchWithRetry(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gemini HTTP ${res.status}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

  const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match) throw new Error("Model did not return valid JSON.");

  return JSON.parse(match[0]);
}

/**
 * Embed a single text string.
 */
export async function embedText(
  apiKey: string,
  text: string
): Promise<number[]> {
  if (!apiKey) throw new Error("Missing Gemini API key");
  const trimmed = (text || "").slice(0, 5000);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${encodeURIComponent(
    apiKey
  )}`;

  const res = await fetchWithRetry(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text: trimmed }] },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Embedding HTTP ${res.status}`);
  }

  const data = await res.json();
  const v = data?.embedding?.values;

  if (!Array.isArray(v) || v.length === 0) {
    throw new Error("Empty embedding.");
  }

  return v;
}

/**
 * NEW — Batch embedding for keyword lists.
 * Uses Gemini’s batchEmbedText endpoint.
 *
 * @returns number[][] — embedding vector for each input keyword
 */
export async function embedTextsBatch(
  apiKey: string,
  texts: string[]
): Promise<number[][]> {
  if (!apiKey) throw new Error("Missing Gemini API key");
  if (!Array.isArray(texts) || !texts.length)
    throw new Error("No texts provided for batch embedding");

  const trimmed = texts.map((t) => (t || "").slice(0, 5000));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedText?key=${encodeURIComponent(
    apiKey
  )}`;

  const body = { texts: trimmed };

  const res = await fetchWithRetry(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error("Batch embed error:", err);
    throw new Error(err?.error?.message || `Batch embed HTTP ${res.status}`);
  }

  const data = await res.json();

  const vectors: number[][] = data?.embeddings?.map((e: any) => e.values) ?? [];

  if (!vectors.length || vectors.some((v) => !Array.isArray(v))) {
    throw new Error("Invalid or empty batch embeddings");
  }

  return vectors;
}
