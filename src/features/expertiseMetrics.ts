// src/features/expertise/metrics.ts

// --- Math Helpers (Self-contained) ---

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

// --- Expertise Logic ---

export type EmbeddingRow = {
  url: string;
  embedding: number[];
  wordCount?: number;
  title?: string;
};

export type ExpertiseReport = {
  centroid: number[];
  focusScore: number; // Average similarity
  datasetSize: number;
  radiusMetrics: {
    min: number;
    max: number;
    p10: number; // The score at the 10th percentile mark
  };
  // The "Drift" list: strictly the bottom N%
  outliers: Array<{ url: string; score: number; reason: string }>;
  segments: Record<string, { score: number; count: number }>;
};

// 1. Calculate Global Centroid (The "Site Vector")
export function calculateGlobalCentroid(rows: EmbeddingRow[]): number[] {
  if (!rows.length) return [];
  const dim = rows[0].embedding.length;
  const sum = new Array(dim).fill(0);

  for (const r of rows) {
    for (let i = 0; i < dim; i++) {
      sum[i] += r.embedding[i];
    }
  }

  // Average
  const count = rows.length || 1;
  const avg = sum.map((val) => val / count);

  // Normalize
  const mag = Math.sqrt(avg.reduce((a, b) => a + b * b, 0)) || 1;
  return avg.map((v) => v / mag);
}

// 2. Run the Full Audit
export function generateExpertiseReport(rows: EmbeddingRow[]): ExpertiseReport {
  const centroid = calculateGlobalCentroid(rows);

  // Score every page against the center
  const scored = rows.map((r) => {
    const sim = cosineSimilarity(r.embedding, centroid);
    return { ...r, score: sim };
  });

  // Sort Ascending (Lowest score first = Furthest from center)
  scored.sort((a, b) => a.score - b.score);

  // Calc Average (siteFocusScore)
  const totalScore = scored.reduce((sum, r) => sum + r.score, 0);
  const focusScore = totalScore / (scored.length || 1);

  // Dynamic Outlier Sizing
  // Use Bottom 5%, but ensure at least 5 pages if available, max 100 pages.
  const total = scored.length;
  const cutOffCount = Math.min(100, Math.max(5, Math.ceil(total * 0.05)));

  // If the dataset is tiny (e.g. 3 pages), just show the worst 1.
  const safeCount = total < 10 ? 1 : cutOffCount;

  const outliers = scored.slice(0, safeCount).map((r) => {
    // Contextualize the reason based on the 0.65 threshold
    const isSevere = r.score < 0.65;
    return {
      url: r.url,
      score: r.score,
      reason: isSevere ? "High Drift (Risk)" : "Peripheral Topic",
    };
  });

  // Segment Analysis (Group by first path segment)
  const segments: Record<string, { sum: number; count: number }> = {};
  for (const r of scored) {
    try {
      // e.g. hubspot.com/marketing/post -> 'marketing'
      const path = new URL(r.url).pathname.split("/")[1];
      if (path && path.length > 1) {
        // filter out empty or root
        if (!segments[path]) segments[path] = { sum: 0, count: 0 };
        segments[path].sum += r.score;
        segments[path].count++;
      }
    } catch (e) {
      /* ignore bad urls */
    }
  }

  const segmentStats: Record<string, { score: number; count: number }> = {};
  Object.keys(segments).forEach((k) => {
    // Only report segments with enough data to be statistically relevant
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
  };
}
