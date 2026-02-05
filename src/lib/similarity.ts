// src/lib/similarity.ts
// Centralized similarity + scoring helpers.

export function dot(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

export function l2(a: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * a[i];
  return Math.sqrt(s) || 1;
}

export function normalize(a: number[]): number[] {
  const norm = l2(a);
  if (!norm || !isFinite(norm)) return a.slice();
  return a.map((v) => v / norm);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  // Guard against zero vectors
  const denom = l2(a) * l2(b);
  if (!denom || !isFinite(denom)) return 0;
  // Clamp to [-1, 1] for numeric stability
  const v = dot(a, b) / denom;
  return Math.max(-1, Math.min(1, v));
}

/** Simple banding for a 0..100 score scale */
export function band(score: number): {
  label: "Strong" | "Moderate" | "Weak" | "Gap";
  color: string;
  bg: string;
} {
  const s = Number(score) || 0;
  if (s >= 85) return { label: "Strong", color: "#059669", bg: "#dcfce7" };
  if (s >= 70) return { label: "Moderate", color: "#d97706", bg: "#fef3c7" };
  if (s >= 50) return { label: "Weak", color: "#1e40af", bg: "#eff6ff" };
  return { label: "Gap", color: "#dc2626", bg: "#fee2e2" };
}

/** Opinionated recommendations based on a 0..100 score */
export function recommendFromScore(score: number): string {
  const s = Number(score) || 0;
  if (s >= 85)
    return "Maintain and build internal links; consolidate near-duplicates.";
  if (s >= 70)
    return "Improve on-page depth and internal linking; add FAQs/examples.";
  if (s >= 50)
    return "Create/expand a focused page; target long-tail subtopics first.";
  return "Create a net-new page targeting the topic head and key subtopics.";
}

/** Cosine similarities between one vector and many (uses this module's cosineSimilarity). */
export function similaritiesToMany(
  query: number[],
  candidates: number[][]
): number[] {
  return candidates.map((v) => cosineSimilarity(query, v));
}

/** Return indices of the top-N scores (descending). */
export function topNIndices(scores: number[], n: number): number[] {
  if (n <= 0) return [];
  return scores
    .map((s, i) => [s, i] as const)
    .sort((a, b) => b[0] - a[0])
    .slice(0, n)
    .map(([, i]) => i);
}
