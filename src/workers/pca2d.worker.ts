/* eslint-disable no-restricted-globals */
// src/workers/pca2d.worker.ts

type Vec = Float32Array;

type MsgIn = {
  vectors: number[][]; // embeddings (n x d)
  maxIter?: number; // default 12
  reportEvery?: number; // progress cadence (iterations)
};

type MsgOut =
  | { type: "progress"; value: number }
  | { type: "done"; coords: { x: number; y: number }[] };

const f32 = (n: number) => new Float32Array(n);

// y = A * v  (A is n x d), centered by mean mu
function Av(rows: number[][], v: Vec, mu: Vec): Vec {
  const n = rows.length;
  const out = f32(n);
  for (let i = 0; i < n; i++) {
    const row = rows[i];
    let s = 0;
    for (let j = 0; j < v.length; j++) s += (row[j] - mu[j]) * v[j];
    out[i] = s;
  }
  return out;
}

// w = A^T * u
function ATu(rows: number[][], u: Vec, mu: Vec): Vec {
  const d = mu.length;
  const out = f32(d);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const ui = u[i];
    for (let j = 0; j < d; j++) out[j] += ui * (row[j] - mu[j]);
  }
  return out;
}

function norm(v: Vec) {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  return Math.sqrt(s) || 1e-12;
}
function normalize(v: Vec) {
  const n = norm(v);
  for (let i = 0; i < v.length; i++) v[i] /= n;
}

function dot(v: Vec, w: Vec) {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * w[i];
  return s;
}
function sub(v: Vec, a: Vec, b: Vec, scale = 1) {
  // v = a - scale*b
  for (let i = 0; i < v.length; i++) v[i] = a[i] - scale * b[i];
}

self.onmessage = async (e: MessageEvent<MsgIn>) => {
  const { vectors, maxIter = 12, reportEvery = 1 } = e.data;
  const n = vectors.length;
  const d = vectors[0]?.length || 0;
  if (!n || !d) {
    (self as any).postMessage({ type: "done", coords: [] } satisfies MsgOut);
    return;
  }

  // Compute mean
  const mu = f32(d);
  for (let i = 0; i < n; i++) {
    const row = vectors[i];
    for (let j = 0; j < d; j++) mu[j] += row[j];
  }
  for (let j = 0; j < d; j++) mu[j] /= n;

  // Power iteration for PC1
  let v1 = f32(d);
  for (let j = 0; j < d; j++) v1[j] = Math.random() - 0.5;
  normalize(v1);
  for (let it = 1; it <= maxIter; it++) {
    const u = Av(vectors, v1, mu);
    const w = ATu(vectors, u, mu);
    normalize(w);
    v1 = w;
    if (it % reportEvery === 0) {
      (self as any).postMessage({
        type: "progress",
        value: it / (2 * maxIter),
      } as MsgOut);
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // Power iteration for PC2 with Gram–Schmidt against v1
  let v2 = f32(d);
  for (let j = 0; j < d; j++) v2[j] = Math.random() - 0.5;
  // orthogonalize initial
  let proj = dot(v2, v1);
  sub(v2, v2, v1, proj);
  normalize(v2);

  for (let it = 1; it <= maxIter; it++) {
    const u = Av(vectors, v2, mu);
    let w = ATu(vectors, u, mu);
    // orthogonalize against v1
    proj = dot(w, v1);
    sub(w, w, v1, proj);
    normalize(w);
    v2 = w;
    if (it % reportEvery === 0) {
      (self as any).postMessage({
        type: "progress",
        value: 0.5 + it / (2 * maxIter),
      } as MsgOut);
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // Project to 2D
  const coords = new Array(n);
  for (let i = 0; i < n; i++) {
    const row = vectors[i];
    let x = 0,
      y = 0;
    for (let j = 0; j < d; j++) {
      const c = row[j] - mu[j];
      x += c * v1[j];
      y += c * v2[j];
    }
    coords[i] = { x, y };
  }

  (self as any).postMessage({ type: "done", coords } satisfies MsgOut);
};
