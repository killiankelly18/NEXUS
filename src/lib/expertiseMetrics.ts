// src/lib/expertiseMetrics.ts

// --- Math Helpers ---

function dot(a: number[], b: number[]): number {
  let sum = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) sum += a[i] * b[i];
  return sum;
}

function l2(a: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * a[i];
  return Math.sqrt(sum) || 1;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const m = l2(a) * l2(b);
  return m ? dot(a, b) / m : 0;
}

// --- Page Expertise Logic ---

export type EmbeddingRow = {
  url: string;
  embedding: number[];
  wordCount?: number;
  title?: string;
};

export type ScoredEmbeddingRow = EmbeddingRow & {
  score: number;
  segment?: string;
};

export type ExpertiseReport = {
  centroid: number[];
  focusScore: number;
  datasetSize: number;
  radiusMetrics: {
    min: number;
    max: number;
    p10: number;
  };
  outliers: Array<{ url: string; score: number; reason: string }>;
  segments: Record<string, { score: number; count: number }>;
  // Full dataset for CSV export
  allScoredPages: ScoredEmbeddingRow[];
};

// 1. Calculate Global Centroid
export function calculateGlobalCentroid(rows: EmbeddingRow[]): number[] {
  if (!rows.length) return [];
  const dim = rows[0].embedding.length;
  const sum = new Array(dim).fill(0);

  for (const r of rows) {
    for (let i = 0; i < dim; i++) {
      sum[i] += r.embedding[i];
    }
  }

  const count = rows.length || 1;
  const avg = sum.map((val) => val / count);

  const mag = Math.sqrt(avg.reduce((a, b) => a + b * b, 0)) || 1;
  return avg.map((v) => v / mag);
}

// 2. Run the Full Page Expertise Audit
export function generateExpertiseReport(rows: EmbeddingRow[]): ExpertiseReport {
  if (!rows || rows.length === 0) {
    return {
      centroid: [],
      focusScore: 0,
      datasetSize: 0,
      radiusMetrics: { min: 0, max: 0, p10: 0 },
      outliers: [],
      segments: {},
      allScoredPages: [],
    };
  }

  const centroid = calculateGlobalCentroid(rows);

  // Score every page and attach segment info
  const scored: ScoredEmbeddingRow[] = rows.map((r) => {
    const sim = cosineSimilarity(r.embedding, centroid);

    // Extract segment (folder) for better reporting
    let segment = "root";
    try {
      const path = new URL(r.url).pathname.split("/")[1];
      if (path && path.length > 0) segment = path;
    } catch {
      // ignore invalid URLs
    }

    return { ...r, score: sim, segment };
  });

  // Sort by score (ascending: outliers first)
  scored.sort((a, b) => a.score - b.score);

  const totalScore = scored.reduce((sum, r) => sum + r.score, 0);
  const focusScore = totalScore / (scored.length || 1);

  const total = scored.length;
  const cutOffCount = Math.min(100, Math.max(5, Math.ceil(total * 0.05)));
  const safeCount = total < 10 ? 1 : cutOffCount;

  const outliers = scored.slice(0, safeCount).map((r) => {
    const isSevere = r.score < 0.65;
    return {
      url: r.url,
      score: r.score,
      reason: isSevere ? "High Drift (Risk)" : "Peripheral Topic",
    };
  });

  // Segment Stats
  const segments: Record<string, { sum: number; count: number }> = {};
  for (const r of scored) {
    const k = r.segment || "root";
    if (!segments[k]) segments[k] = { sum: 0, count: 0 };
    segments[k].sum += r.score;
    segments[k].count++;
  }

  const segmentStats: Record<string, { score: number; count: number }> = {};
  Object.keys(segments).forEach((k) => {
    if (segments[k].count > 2) {
      segmentStats[k] = {
        score: segments[k].sum / segments[k].count,
        count: segments[k].count,
      };
    }
  });

  return {
    centroid,
    focusScore,
    datasetSize: total,
    radiusMetrics: {
      min: scored[0]?.score || 0,
      max: scored[scored.length - 1]?.score || 0,
      p10: scored[Math.floor(total * 0.1)]?.score || 0,
    },
    outliers,
    segments: segmentStats,
    allScoredPages: scored,
  };
}

// --- Keyword Expertise / Cannibalisation Types ---

export type KeywordEmbeddingRow = {
  keyword: string;
  embedding: number[];
  group?: string; // optional: allow grouping (e.g., list name, intent bucket)
};

export type ScoredKeywordRow = KeywordEmbeddingRow & {
  score: number; // similarity to corpus centroid
};

export type KeywordOverlapPair = {
  keywordA: string;
  keywordB: string;
  similarity: number;
};

export type KeywordCluster = {
  id: number;
  keywords: string[];
  representative: string; // chosen "canonical" keyword for the cluster
  avgSimilarity: number;
};

export type KeywordCorpusReport = {
  centroid: number[];
  focusScore: number;
  datasetSize: number;
  radiusMetrics: {
    min: number;
    max: number;
    p10: number;
  };
  outliers: Array<{ keyword: string; score: number; reason: string }>;
  overlaps: KeywordOverlapPair[];
  clusters: KeywordCluster[];
  allScoredKeywords: ScoredKeywordRow[];
};

// Calculate centroid for a set of keyword embeddings
export function calculateKeywordCentroid(
  rows: KeywordEmbeddingRow[]
): number[] {
  if (!rows.length) return [];
  const dim = rows[0].embedding.length;
  const sum = new Array(dim).fill(0);

  for (const r of rows) {
    const emb = r.embedding;
    for (let i = 0; i < dim; i++) {
      sum[i] += emb[i];
    }
  }

  const count = rows.length || 1;
  const avg = sum.map((val) => val / count);

  const mag = Math.sqrt(avg.reduce((a, b) => a + b * b, 0)) || 1;
  return avg.map((v) => v / mag);
}

/**
 * Generate a corpus / cannibalisation report for a set of keyword embeddings.
 */
export function generateKeywordCorpusReport(
  rows: KeywordEmbeddingRow[],
  overlapThreshold: number = 0.88
): KeywordCorpusReport {
  if (!rows || rows.length === 0) {
    return {
      centroid: [],
      focusScore: 0,
      datasetSize: 0,
      radiusMetrics: { min: 0, max: 0, p10: 0 },
      outliers: [],
      overlaps: [],
      clusters: [],
      allScoredKeywords: [],
    };
  }

  const centroid = calculateKeywordCentroid(rows);

  // Score each keyword by similarity to centroid
  const scored: ScoredKeywordRow[] = rows.map((r) => ({
    ...r,
    score: cosineSimilarity(r.embedding, centroid),
  }));

  // Sort ascending: lowest score = furthest from core topic
  scored.sort((a, b) => a.score - b.score);

  const total = scored.length;
  const totalScore = scored.reduce((sum, r) => sum + r.score, 0);
  const focusScore = totalScore / (total || 1);

  // Radius metrics (similar to page expertise)
  const p10Index = Math.floor(total * 0.1);
  const radiusMetrics = {
    min: scored[0]?.score || 0,
    max: scored[total - 1]?.score || 0,
    p10: scored[p10Index]?.score ?? scored[0]?.score ?? 0,
  };

  // Outliers: bottom N% of keywords by similarity to the centroid
  const cutOffCount = Math.min(100, Math.max(5, Math.ceil(total * 0.05)));
  const safeCount = total < 10 ? 1 : cutOffCount;

  const outliers = scored.slice(0, safeCount).map((k) => {
    const isSevere = k.score < 0.65;
    return {
      keyword: k.keyword,
      score: k.score,
      reason: isSevere ? "High Drift (Off-topic)" : "Peripheral Theme",
    };
  });

  // --- Cannibalisation / Overlap ---
  const overlaps: KeywordOverlapPair[] = [];
  const n = scored.length;

  for (let i = 0; i < n; i++) {
    const ki = scored[i];
    for (let j = i + 1; j < n; j++) {
      const kj = scored[j];
      const sim = cosineSimilarity(ki.embedding, kj.embedding);
      if (sim >= overlapThreshold) {
        overlaps.push({
          keywordA: ki.keyword,
          keywordB: kj.keyword,
          similarity: sim,
        });
      }
    }
  }

  // --- Build clusters (connected components on overlap graph) ---
  const clusters: KeywordCluster[] = [];
  if (overlaps.length > 0) {
    const adjacency = new Map<string, Set<string>>();

    const ensureNode = (kw: string) => {
      if (!adjacency.has(kw)) adjacency.set(kw, new Set());
    };

    for (const pair of overlaps) {
      ensureNode(pair.keywordA);
      ensureNode(pair.keywordB);
      adjacency.get(pair.keywordA)!.add(pair.keywordB);
      adjacency.get(pair.keywordB)!.add(pair.keywordA);
    }

    const visited = new Set<string>();
    let clusterId = 1;

    for (const kw of adjacency.keys()) {
      if (visited.has(kw)) continue;

      const stack = [kw];
      const members: string[] = [];

      while (stack.length) {
        const current = stack.pop()!;
        if (visited.has(current)) continue;
        visited.add(current);
        members.push(current);

        const neighbors = adjacency.get(current);
        if (neighbors) {
          for (const nb of neighbors) {
            if (!visited.has(nb)) {
              stack.push(nb);
            }
          }
        }
      }

      if (members.length === 0) continue;

      // Pick a representative keyword: highest average similarity to others in cluster
      let bestKeyword = members[0];
      let bestAvgSim = -1;

      for (const candidate of members) {
        let sumSim = 0;
        let countSim = 0;

        for (const other of members) {
          if (other === candidate) continue;
          const kCand = scored.find((s) => s.keyword === candidate);
          const kOther = scored.find((s) => s.keyword === other);
          if (!kCand || !kOther) continue;
          sumSim += cosineSimilarity(kCand.embedding, kOther.embedding);
          countSim++;
        }

        const avgSim = countSim ? sumSim / countSim : 0;
        if (avgSim > bestAvgSim) {
          bestAvgSim = avgSim;
          bestKeyword = candidate;
        }
      }

      clusters.push({
        id: clusterId++,
        keywords: members.sort(),
        representative: bestKeyword,
        avgSimilarity: bestAvgSim < 0 ? 0 : bestAvgSim,
      });
    }
  }

  return {
    centroid,
    focusScore,
    datasetSize: total,
    radiusMetrics,
    outliers,
    overlaps,
    clusters,
    allScoredKeywords: scored,
  };
}
