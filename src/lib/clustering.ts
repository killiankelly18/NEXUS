// src/lib/clustering.ts
// Density-style clustering using a cosine-similarity threshold (DBSCAN-like).
// Produces clusters + simple labels from keyword frequencies.

import { cosineSimilarity } from "./similarity";

export type Item = {
  id: string; // e.g., URL
  embedding: number[];
  keywords?: string[];
};

export type Cluster = {
  id: number;
  members: Item[];
  label: string;
  centroid?: number[];
};

export type ClusteringResult = {
  clusters: Cluster[];
  noise: Item[];
  params: { minSimilarity: number; minPoints: number };
};

function normalizeKeywords(keywords?: string[]): string[] {
  if (!keywords) return [];
  const out: string[] = [];
  for (const k of keywords) {
    if (!k) continue;
    for (const part of k.split(/[|,;/]+/g)) {
      const t = part.trim().toLowerCase();
      if (t) out.push(t);
    }
  }
  return out;
}

function topLabelFromKeywords(items: Item[], limit = 3): string {
  const freq: Record<string, number> = {};
  for (const it of items) {
    for (const kw of normalizeKeywords(it.keywords)) {
      freq[kw] = (freq[kw] || 0) + 1;
    }
  }
  const ranked = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return `Cluster (${items.length})`;
  return ranked
    .slice(0, limit)
    .map(([k]) => k)
    .join(" • ");
}

function centroid(items: Item[]): number[] | undefined {
  if (!items.length) return undefined;
  const dim = items[0].embedding.length;
  const acc = new Array(dim).fill(0);
  for (const it of items) {
    const v = it.embedding;
    for (let i = 0; i < dim; i++) acc[i] += v[i];
  }
  const n = items.length || 1;
  for (let i = 0; i < dim; i++) acc[i] /= n;
  // L2 normalize
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += acc[i] * acc[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dim; i++) acc[i] /= norm;
  return acc;
}

/**
 * A point is a "core" if it has >= minPoints neighbors (including itself)
 * with cosineSimilarity >= minSimilarity. Cores expand clusters; others attach
 * as border points if connected; remaining are noise.
 */
export function runClustering(
  items: Item[],
  params: { minSimilarity: number; minPoints: number }
): ClusteringResult {
  const { minSimilarity, minPoints } = params;
  if (!items.length) return { clusters: [], noise: [], params };

  const n = items.length;
  const visited = new Array<boolean>(n).fill(false);
  const assigned = new Array<number>(n).fill(-1);

  // neighbor lists under the similarity threshold
  const neighbors: number[][] = new Array(n);
  for (let i = 0; i < n; i++) {
    const nbrs: number[] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const sim = cosineSimilarity(items[i].embedding, items[j].embedding);
      if (sim >= minSimilarity) nbrs.push(j);
    }
    neighbors[i] = nbrs;
  }

  const clusters: Cluster[] = [];
  let cid = 0;

  for (let i = 0; i < n; i++) {
    if (visited[i]) continue;
    visited[i] = true;

    const nbrs = neighbors[i];
    if (nbrs.length + 1 < minPoints) continue; // not a core; may become border

    // start new cluster
    const memberIdxs: number[] = [];
    clusters.push({ id: cid, members: [], label: "" });
    const queue: number[] = [i, ...nbrs];
    assigned[i] = cid;

    while (queue.length) {
      const q = queue.pop()!;
      if (!visited[q]) {
        visited[q] = true;
        const qnbrs = neighbors[q];
        if (qnbrs.length + 1 >= minPoints) {
          for (const nb of qnbrs) if (assigned[nb] === -1) queue.push(nb);
        }
      }
      if (assigned[q] === -1) assigned[q] = cid;
      memberIdxs.push(q);
    }

    const members = Array.from(new Set(memberIdxs)).map((idx) => items[idx]);
    clusters[cid].members = members;
    clusters[cid].label = topLabelFromKeywords(members);
    clusters[cid].centroid = centroid(members);

    cid++;
  }

  const noise: Item[] = [];
  for (let i = 0; i < n; i++) if (assigned[i] === -1) noise.push(items[i]);

  return { clusters, noise, params };
}
