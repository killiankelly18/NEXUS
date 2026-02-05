// src/features/topic-mapper/compute.ts
import { cosineSimilarity } from "../../lib/similarity";
import { parseEmbedding } from "../../lib/csv";
import { embedText } from "../../lib/gemini";

export type TMTopic = { label: string; url?: string; score: number };
export type TMNode = { label: string; url?: string; score: number };
export type TMQuery = TMNode & {
  type?: string;
  userJourneyStage?: string;
  commercialIntent?: string;
  priority?: string;
  reasoning?: string;
  contentOpportunity?: string;
  subtopic?: string;
};
export type TMResult = {
  topic: TMTopic;
  subtopics: TMNode[];
  queries: TMQuery[];
  finalScore?: number;
  analyzedPages?: number;
};

/** Case-insensitive dedupe helper */
export function dedupeCaseInsensitive(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of (arr || []).map((s) => (s || "").trim()).filter(Boolean)) {
    const k = raw.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(raw);
    }
  }
  return out;
}

/** Parse crawl CSV rows into embeddings */
export function extractContentEmbeddings(crawlRows: any[]) {
  return (crawlRows || [])
    .map((row: any, i: number) => {
      const url = row.Address || row.URL || row.url || `Page ${i + 1}`;
      const text =
        row["Extract semantic embeddings from page"] ||
        row["Extract semantic embeddings"] ||
        row.embeddings ||
        row.embedding ||
        row.Embeddings;
      const embedding = parseEmbedding(text);
      return embedding ? { url, embedding } : null;
    })
    .filter(Boolean) as Array<{ url: string; embedding: number[] }>;
}

/** Map labels (subtopics/queries) to closest content page */
export async function tmMapNodesToContent(
  labels: string[],
  contentEmbeds: { url: string; embedding: number[] }[],
  apiKey: string
) {
  const out: TMNode[] = [];
  for (const label of labels) {
    const v = await embedText(apiKey, label);
    if (!v) {
      out.push({ label, score: 0 });
      continue;
    }
    let best = { url: undefined as string | undefined, sim: 0 };
    for (const c of contentEmbeds) {
      const s = cosineSimilarity(v, c.embedding);
      if (s > best.sim) best = { url: c.url, sim: s };
    }
    out.push({ label, url: best.url, score: Math.round(best.sim * 100) });
  }
  return out;
}

/** Weighted blend for final topic score */
export function tmComputeFinalScore(
  topicRow: TMTopic,
  subRows: TMNode[],
  queryRows: TMQuery[]
): number {
  const avg = (xs: number[]) =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  const t = topicRow?.score || 0;
  const s = avg(subRows.map((x) => x.score || 0));
  const q = avg(queryRows.map((x) => x.score || 0));
  return Math.round(t * 0.4 + s * 0.35 + q * 0.25);
}

/** Adapter: normalizes legacy shapes into TMResult shape */
export function adaptTopicMapForPanel(tm: any): TMResult | null {
  if (!tm) return null;

  // New shape already in place
  if (
    tm.topic?.label &&
    Array.isArray(tm.subtopics) &&
    Array.isArray(tm.queries)
  ) {
    return tm as TMResult;
  }

  // Legacy shape adapter
  const pct = (x?: number) => (typeof x === "number" ? Math.round(x * 100) : 0);
  const topic: TMTopic = {
    label: tm.topic ?? "",
    url: tm.topicBest?.url ?? "",
    score: tm.topicScore ?? pct(tm.topicBest?.similarity),
  };
  const subtopics = (tm.subtopicBest || []).map((s: any) => ({
    label: s.subtopic ?? "",
    url: s.url ?? "",
    score: s.score ?? pct(s.similarity),
  }));
  const queries = (tm.queryRows || []).map((q: any) => ({
    label: q.query ?? "",
    url: q.url ?? "",
    score: pct(q.similarity),
    subtopic: q.subtopic ?? "",
  }));
  return { topic, subtopics, queries };
}
