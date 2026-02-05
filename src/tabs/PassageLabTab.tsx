// src/tabs/PassageLabTab.tsx
// ---------------------------------------------------------------------------
// Passage Lab — Paste HTML for one page and analyse passages vs. keywords.
// - API key auto from Workspace
// - Imports keywords from Query Generator (state.generatorKeywords) with filters
// - Batched + cached embeddings; heuristic passage-level suggestions
// ---------------------------------------------------------------------------

import React, { useMemo, useRef, useState } from "react";

/* ------------------------------- Workspace ------------------------------- */
let useWorkspaceAny:
  | undefined
  | (() => {
      apiKey?: string;
      state?: {
        generatorKeywords?: any[]; // ← will be filled by Query Generator
      };
    });
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ws = require("../context/WorkspaceContext");
  if (ws?.useWorkspace) useWorkspaceAny = ws.useWorkspace;
} catch {}
if (!useWorkspaceAny) {
  useWorkspaceAny = () => ({ apiKey: "", state: { generatorKeywords: [] } });
}

/* -------------------------------- Utilities ------------------------------ */
const enc = new TextEncoder();
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
function tokenizeWords(txt: string) {
  return (txt || "").trim().split(/\s+/).filter(Boolean);
}
function cosine(a: number[], b: number[]) {
  let dot = 0,
    na = 0,
    nb = 0;
  const L = Math.min(a.length, b.length);
  for (let i = 0; i < L; i++) {
    const x = a[i],
      y = b[i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}
async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* ------------------------------- Caching --------------------------------- */
const CACHE_NS = "nexus.passageLab.v1";
function cacheGet<T = any>(k: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(CACHE_NS + ":" + k) || "null");
  } catch {
    return null;
  }
}
function cacheSet(k: string, v: any) {
  try {
    localStorage.setItem(CACHE_NS + ":" + k, JSON.stringify(v));
  } catch {}
}

/* --------------------------- HTML → plain text --------------------------- */
function textFromHTML(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc
    .querySelectorAll("script,style,noscript,svg,nav,footer,aside,iframe")
    .forEach((n) => n.remove());
  return doc.body && doc.body.textContent
    ? doc.body.textContent
    : doc.documentElement.textContent || "";
}

/* -------------------------------- Chunking ------------------------------- */
function chunkPassages(
  text: string,
  wordsPer = 180,
  overlap = 40,
  maxPassages = 60
) {
  text = text.replace(/\s+/g, " ").trim();
  if (!text) return [];
  const headingBlocks = text.split(/(?=(?:^|\n)\s*(?:[A-Z][^\n]{0,80}\n))/g);
  let chunks: string[] = [];
  const pushWindow = (words: string[]) => {
    for (let i = 0; i < words.length; i += Math.max(1, wordsPer - overlap)) {
      const slice = words.slice(i, i + wordsPer);
      if (slice.length >= Math.min(40, Math.floor(wordsPer / 3)))
        chunks.push(slice.join(" "));
      if (chunks.length >= maxPassages) break;
    }
  };
  if (headingBlocks.length > 4) {
    for (const blk of headingBlocks) {
      const words = tokenizeWords(blk);
      if (words.length <= 20) continue;
      pushWindow(words);
      if (chunks.length >= maxPassages) break;
    }
  } else {
    pushWindow(tokenizeWords(text));
  }
  return chunks.slice(0, maxPassages);
}

/* ---------------------------- Gemini Embeddings -------------------------- */
type TaskType = "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT";
async function embedBatchTextEmbedding004(
  apiKey: string,
  texts: string[],
  taskType: TaskType
): Promise<number[][]> {
  const model = "models/text-embedding-004";
  const reqs: any[] = [],
    mapIdx: Array<{ i: number; key: string }> = [];
  const out: number[][] = new Array(texts.length);
  for (let i = 0; i < texts.length; i++) {
    const t = texts[i];
    const key = await sha256Hex(`${model}:${taskType}:${t}`);
    const hit = cacheGet<{ v: number[] }>(key);
    if (hit?.v) {
      out[i] = hit.v;
      continue;
    }
    reqs.push({ model, content: { parts: [{ text: t }] }, taskType });
    mapIdx.push({ i, key });
  }
  if (reqs.length) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents?key=${encodeURIComponent(
      apiKey
    )}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requests: reqs }),
    });
    if (!res.ok) {
      throw new Error("Embedding error: " + (await res.text()));
    }
    const data = await res.json();
    (data?.responses || []).forEach((r: any, j: number) => {
      const vec: number[] = r?.embedding?.values || [];
      const { i, key } = mapIdx[j];
      out[i] = vec;
      cacheSet(key, { v: vec });
    });
  }
  for (let i = 0; i < out.length; i++) if (!out[i]) out[i] = [];
  return out;
}

/* --------------------------------- Styles -------------------------------- */
const wrap: React.CSSProperties = {
  background: "linear-gradient(135deg,#fafbff 0%,#ffffff 100%)",
  borderRadius: 16,
  padding: 24,
  color: "#111",
  lineHeight: 1.6,
  maxWidth: 1000,
  margin: "0 auto",
};
const headCard: React.CSSProperties = {
  background: "linear-gradient(135deg,#667eea 0%,#764ba2 100%)",
  color: "#fff",
  borderRadius: 12,
  padding: 20,
  marginBottom: 16,
  boxShadow: "0 8px 20px rgba(118,75,162,.22)",
};
const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 16,
  marginTop: 12,
};
const row: React.CSSProperties = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
  alignItems: "flex-start",
};
const col: React.CSSProperties = { flex: "1 1 320px", minWidth: 260 };
const pill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid #e5e7eb",
  background: "#f8fafc",
  fontSize: 12,
  fontWeight: 700,
};
const btn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  background: "linear-gradient(135deg,#2563eb 0%,#1e40af 100%)",
  color: "#fff",
  border: "none",
  borderRadius: 10,
  padding: "10px 14px",
  fontWeight: 700,
  cursor: "pointer",
  boxShadow: "0 6px 12px rgba(37,99,235,.18)",
};
const btnGhost: React.CSSProperties = {
  ...btn,
  background: "#f8fafc",
  color: "#111",
  border: "1px solid #e5e7eb",
  boxShadow: "none",
};
const tableHead: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "36px 1.3fr 3fr 100px",
  gap: 12,
  alignItems: "center",
  borderBottom: "1px solid #eef2f7",
  padding: "8px 4px",
  color: "#6b7280",
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: 0.3,
};
const summaryRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "36px 1.3fr 3fr 100px",
  gap: 12,
  alignItems: "center",
  padding: "12px 4px",
  cursor: "pointer",
  listStyle: "none",
};
const numBox: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 8,
  background: "#eef2ff",
  color: "#3730a3",
  display: "grid",
  placeItems: "center",
  fontWeight: 800,
  fontSize: 12,
};

/* --------------------------------- Types --------------------------------- */
type MatchRow = {
  query: string;
  best_score: number;
  status: "OK" | "GAP";
  best_passage: string;
  top: Array<{ score: number; text: string; suggestions: string[] }>;
};

/* ---------------------- Heuristic optimisation engine -------------------- */
function optimiseHints(query: string, passage: string): string[] {
  const p = passage;
  const hints: string[] = [];
  if (
    /( vs | versus | compare|comparison|best|alternatives|vs\.)/i.test(query) &&
    !/( vs | versus | than | compare|better)/i.test(p)
  ) {
    hints.push(
      "Add an explicit comparison sentence or mini-table (criteria + why it matters)."
    );
  }
  if (!/\d/.test(p))
    hints.push(
      "Add at least one concrete stat, range, or timeframe to anchor claims."
    );
  if (!/[-•*]|\d\./.test(p))
    hints.push(
      "Refactor into short bullets or a 2–4 row table for easy extraction."
    );
  if (
    /\b(what is|how to|guide|definition|meaning)\b/i.test(query) &&
    !/^\s*(what is|in short|tl;dr|definition)/i.test(p.trim())
  ) {
    hints.push(
      "Prepend a one-sentence definition/TL;DR answer before elaboration."
    );
  }
  const properEntities = (p.match(/\b[A-Z][A-Za-z0-9\-]{2,}\b/g) || []).length;
  if (properEntities < 2)
    hints.push(
      "Name key entities/brands/concepts explicitly to strengthen entity signals."
    );
  if (p.length > 280)
    hints.push(
      "Add a short in-page anchor heading (H3/H4) with the exact facet wording."
    );
  if (!/(we|our|study|dataset|example|case|benchmarked|tested)/i.test(p))
    hints.push(
      "Add a tiny original insight or example (mini case, dataset, or test condition)."
    );
  if (!/(pros|cons|limitations|alternatives|next steps)/i.test(p))
    hints.push(
      "Add a 'Next steps / alternatives' line to anticipate follow-ups."
    );
  return hints;
}

/* ----------------------- Pickers for generator data ---------------------- */
function pickKeywordText(row: any): string {
  // Prefer structured fields; fall back gracefully
  return (row?.query ?? row?.keyword ?? row?.text ?? row?.seed ?? "")
    .toString()
    .trim();
}
function pickType(row: any): string {
  return (row?.type ?? row?.category ?? row?.kind ?? "").toString().trim();
}
function pickStage(row: any): string {
  return (row?.stage ?? row?.intent ?? row?.funnel ?? "").toString().trim();
}

/* -------------------------------- Component ------------------------------ */
const PassageLabTab: React.FC = () => {
  const { apiKey: apiKeyFromWs, state } = useWorkspaceAny!() || {};
  const apiKey = apiKeyFromWs || ""; // auto from Workspace

  const generatorRows: any[] = Array.isArray(state?.generatorKeywords)
    ? state!.generatorKeywords
    : [];

  // Build filter options
  const allTypes = useMemo(
    () => Array.from(new Set(generatorRows.map(pickType).filter(Boolean))),
    [generatorRows]
  );
  const allStages = useMemo(
    () => Array.from(new Set(generatorRows.map(pickStage).filter(Boolean))),
    [generatorRows]
  );

  const [typeFilter, setTypeFilter] = useState<string>("");
  const [stageFilter, setStageFilter] = useState<string>("");

  const filteredGeneratorKeywords = useMemo(() => {
    return generatorRows
      .filter((r) => (typeFilter ? pickType(r) === typeFilter : true))
      .filter((r) => (stageFilter ? pickStage(r) === stageFilter : true))
      .map(pickKeywordText)
      .filter(Boolean);
  }, [generatorRows, typeFilter, stageFilter]);

  const [html, setHtml] = useState<string>("");
  const [queriesText, setQueriesText] = useState<string>("");

  // Settings
  const [wordsPer, setWordsPer] = useState<number>(180);
  const [overlap, setOverlap] = useState<number>(40);
  const [maxPassages, setMaxPassages] = useState<number>(60);
  const [topK, setTopK] = useState<number>(3);
  const [minScore, setMinScore] = useState<number>(0.8);
  const [ceiling, setCeiling] = useState<number>(10); // € estimated cap

  const [status, setStatus] = useState<string>("Ready");
  const [running, setRunning] = useState<boolean>(false);
  const [rows, setRows] = useState<MatchRow[]>([]);
  const resultsRef = useRef<HTMLDivElement>(null);

  const queries = useMemo(
    () =>
      queriesText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    [queriesText]
  );

  const estCost = useMemo(() => {
    const text = textFromHTML(html || "");
    const passages = chunkPassages(text, wordsPer, overlap, maxPassages);
    const q = queries.length,
      p = passages.length;
    const emb = (q + p) * 0.0001; // € placeholder per embed call
    return Math.round((emb + 0.2) * 100) / 100;
  }, [html, queries, wordsPer, overlap, maxPassages]);

  function importFromGenerator() {
    if (!generatorRows.length) {
      alert("No keywords found from Query Generator. Generate them first.");
      return;
    }
    const current = queries;
    const add = filteredGeneratorKeywords.length
      ? filteredGeneratorKeywords
      : generatorRows.map(pickKeywordText).filter(Boolean);
    const merged = Array.from(new Set([...current, ...add]));
    setQueriesText(merged.join("\n"));
    setStatus(`Imported ${add.length} keywords from Query Generator`);
  }

  async function run() {
    try {
      if (!apiKey.trim())
        return alert("Your Gemini API key is missing in Workspace.");
      if (!queries.length)
        return alert(
          "Add at least one keyword (or import from Query Generator)."
        );
      setRunning(true);
      setStatus("Preparing…");

      const text = textFromHTML(html || "");
      if (!text) {
        setRunning(false);
        return alert("No textual content found in the pasted HTML.");
      }

      // Chunk
      const W = clamp(wordsPer, 60, 400);
      const O = clamp(overlap, 0, W - 10);
      const M = clamp(maxPassages, 10, 500);
      const K = clamp(topK, 1, 10);
      const T = clamp(minScore, 0, 0.99);

      const passages = chunkPassages(text, W, O, M);

      // Ceiling check
      if (estCost > ceiling) {
        setRunning(false);
        setStatus(
          `Ceiling exceeded (est. €${estCost} > €${ceiling}). Adjust limits.`
        );
        return;
      }

      setStatus(
        `Embedding ${queries.length} keywords + ${passages.length} passages…`
      );

      // Batch embeddings with caching
      const qVecs = await embedBatchTextEmbedding004(
        apiKey,
        queries,
        "RETRIEVAL_QUERY"
      );
      const pVecs = await embedBatchTextEmbedding004(
        apiKey,
        passages,
        "RETRIEVAL_DOCUMENT"
      );

      // Compute matches + suggestions
      const out: MatchRow[] = queries.map((q, qi) => {
        const qv = qVecs[qi] || [];
        let ranked = pVecs.map((pv, pi) => ({ i: pi, score: cosine(qv, pv) }));
        ranked.sort((a, b) => b.score - a.score);
        const top = ranked.slice(0, K).map((t) => ({
          score: t.score,
          text: passages[t.i],
          suggestions: optimiseHints(q, passages[t.i]),
        }));
        const best = top[0];
        const status: "OK" | "GAP" = best && best.score >= T ? "OK" : "GAP";
        return {
          query: q,
          best_score: best?.score ?? 0,
          status,
          best_passage: best?.text ?? "",
          top,
        };
      });

      setRows(out);
      setStatus("Done.");
      setTimeout(
        () =>
          resultsRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          }),
        60
      );
    } catch (e: any) {
      console.error(e);
      setStatus("Error: " + (e?.message || String(e)));
    } finally {
      setRunning(false);
    }
  }

  function exportCsv() {
    const lines = [
      ["keyword", "best_score", "status", "best_passage", "suggestions"],
    ];
    rows.forEach((r) =>
      lines.push([
        r.query,
        r.best_score,
        r.status,
        r.best_passage,
        r.top?.[0]?.suggestions?.join(" | ") || "",
      ])
    );
    const csv = lines
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "passage_matches.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={wrap}>
      {/* Header */}
      <div style={headCard}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>
          🧪 Passage Lab (Paste HTML)
        </h1>
        <p style={{ margin: "6px 0 0", opacity: 0.95 }}>
          Paste one page’s HTML. Nexus will chunk it into passages, embed your{" "}
          <strong>Query Generator keywords</strong>
          and the passages with <strong>text-embedding-004</strong> (batched +
          cached), and show the best passage per keyword. API key is pulled from
          Workspace automatically.
        </p>
      </div>

      {/* The NEXUS Formula */}
      <div style={card}>
        <h3 style={{ marginTop: 0, color: "#4a4af8" }}>💡 The NEXUS Formula</h3>
        <p style={{ marginBottom: 8 }}>
          <strong>Topical Authority = Coverage + Connectivity + Clarity</strong>
        </p>
        <ul style={{ margin: "0 0 0 18px" }}>
          <li>
            <strong>Coverage</strong> — Map fan-out keywords to passages; win
            passage-level selection.
          </li>
          <li>
            <strong>Connectivity</strong> — Use results to add in-page anchors
            and internal links.
          </li>
          <li>
            <strong>Clarity</strong> — Prune overlaps; ensure one page owns each
            facet cleanly.
          </li>
        </ul>
      </div>

      {/* Inputs */}
      <div style={card}>
        <div style={row}>
          {/* LEFT: Keywords */}
          <div style={col}>
            <label
              style={{
                fontWeight: 700,
                fontSize: 12,
                textTransform: "uppercase",
              }}
            >
              Keywords (one per line)
            </label>
            <textarea
              placeholder={
                "best crm for startups\ncrm pricing comparison\ncrm vs marketing automation"
              }
              value={queriesText}
              onChange={(e) => setQueriesText(e.target.value)}
              style={{
                width: "100%",
                minHeight: 140,
                padding: 10,
                border: "1px solid #e5e7eb",
                borderRadius: 10,
              }}
            />
            <div
              style={{
                marginTop: 8,
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              {/* Filters (from Generator metadata) */}
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                title="Filter by type from Query Generator"
                style={{
                  padding: 8,
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                }}
              >
                <option value="">All Types</option>
                {allTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
                title="Filter by stage/intent from Query Generator"
                style={{
                  padding: 8,
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                }}
              >
                <option value="">All Stages</option>
                {allStages.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <button style={btnGhost} onClick={importFromGenerator}>
                Import from Query Generator
              </button>
              <span style={pill}>
                {generatorRows.length} available
                {typeFilter || stageFilter
                  ? ` • ${filteredGeneratorKeywords.length} after filters`
                  : ""}
              </span>
            </div>
          </div>

          {/* MIDDLE: HTML */}
          <div style={col}>
            <label
              style={{
                fontWeight: 700,
                fontSize: 12,
                textTransform: "uppercase",
              }}
            >
              Paste HTML (single page)
            </label>
            <textarea
              placeholder={"<!doctype html>\n<html>...\n</html>"}
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              style={{
                width: "100%",
                minHeight: 260,
                padding: 10,
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                fontFamily: "monospace",
              }}
            />
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
              We strip scripts/styles/nav/footers and analyze the main text.
            </div>
          </div>

          {/* RIGHT: Settings */}
          <div style={{ ...col, maxWidth: 360 }}>
            <label
              style={{
                fontWeight: 700,
                fontSize: 12,
                textTransform: "uppercase",
              }}
            >
              Settings
            </label>
            <div style={row}>
              <div style={{ flex: "1 1 120px", minWidth: 120 }}>
                <div
                  style={{ fontSize: 12, color: "#374151", fontWeight: 700 }}
                >
                  Words per passage
                </div>
                <input
                  type="number"
                  value={wordsPer}
                  onChange={(e) => setWordsPer(Number(e.target.value))}
                  style={{
                    width: "100%",
                    padding: 8,
                    border: "1px solid #e5e7eb",
                    borderRadius: 10,
                  }}
                />
              </div>
              <div style={{ flex: "1 1 120px", minWidth: 120 }}>
                <div
                  style={{ fontSize: 12, color: "#374151", fontWeight: 700 }}
                >
                  Overlap (words)
                </div>
                <input
                  type="number"
                  value={overlap}
                  onChange={(e) => setOverlap(Number(e.target.value))}
                  style={{
                    width: "100%",
                    padding: 8,
                    border: "1px solid #e5e7eb",
                    borderRadius: 10,
                  }}
                />
              </div>
            </div>

            <div style={{ ...row, marginTop: 8 }}>
              <div style={{ flex: "1 1 120px", minWidth: 120 }}>
                <div
                  style={{ fontSize: 12, color: "#374151", fontWeight: 700 }}
                >
                  Max passages
                </div>
                <input
                  type="number"
                  value={maxPassages}
                  onChange={(e) => setMaxPassages(Number(e.target.value))}
                  style={{
                    width: "100%",
                    padding: 8,
                    border: "1px solid #e5e7eb",
                    borderRadius: 10,
                  }}
                />
              </div>
              <div style={{ flex: "1 1 120px", minWidth: 120 }}>
                <div
                  style={{ fontSize: 12, color: "#374151", fontWeight: 700 }}
                >
                  Top-K
                </div>
                <input
                  type="number"
                  value={topK}
                  onChange={(e) => setTopK(Number(e.target.value))}
                  style={{
                    width: "100%",
                    padding: 8,
                    border: "1px solid #e5e7eb",
                    borderRadius: 10,
                  }}
                />
              </div>
            </div>

            <div style={{ ...row, marginTop: 8 }}>
              <div style={{ flex: "1 1 120px", minWidth: 120 }}>
                <div
                  style={{ fontSize: 12, color: "#374151", fontWeight: 700 }}
                >
                  Match ≥
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={minScore}
                  onChange={(e) => setMinScore(Number(e.target.value))}
                  style={{
                    width: "100%",
                    padding: 8,
                    border: "1px solid #e5e7eb",
                    borderRadius: 10,
                  }}
                />
              </div>
              <div style={{ flex: "1 1 120px", minWidth: 120 }}>
                <div
                  style={{ fontSize: 12, color: "#374151", fontWeight: 700 }}
                >
                  Ceiling (€ est.)
                </div>
                <input
                  type="number"
                  step="0.5"
                  value={ceiling}
                  onChange={(e) => setCeiling(Number(e.target.value))}
                  style={{
                    width: "100%",
                    padding: 8,
                    border: "1px solid #e5e7eb",
                    borderRadius: 10,
                  }}
                />
              </div>
            </div>

            <div
              style={{
                marginTop: 10,
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <button style={btn} onClick={run} disabled={running}>
                {running ? "Running…" : "Run Analysis"}
              </button>
              <button
                style={btnGhost}
                onClick={exportCsv}
                disabled={!rows.length}
              >
                Export CSV
              </button>
              <span style={pill} title="Rough with buffer">
                Est. cost: €{estCost.toFixed(2)}
              </span>
              <span style={pill}>{status}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      {rows.length > 0 && (
        <div style={card} ref={resultsRef}>
          <div style={tableHead}>
            <div>#</div>
            <div>Keyword</div>
            <div>Best Passage (snippet)</div>
            <div style={{ textAlign: "right" }}>Score</div>
          </div>
          <div>
            {rows.map((r, idx) => {
              const snippet =
                (r.best_passage || "").slice(0, 300) +
                ((r.best_passage || "").length > 300 ? "…" : "");
              const badgeStyle: React.CSSProperties =
                r.best_score >= 0.9
                  ? {
                      background: "#f0fdf4",
                      color: "#14532d",
                      border: "1px solid #bbf7d0",
                    }
                  : r.best_score >= 0.85
                  ? {
                      background: "#ecfdf5",
                      color: "#065f46",
                      border: "1px solid #a7f3d0",
                    }
                  : r.best_score >= minScore
                  ? {
                      background: "#ecfeff",
                      color: "#155e75",
                      border: "1px solid #a5f3fc",
                    }
                  : {
                      background: "#fff7ed",
                      color: "#7c2d12",
                      border: "1px solid #fed7aa",
                    };

              return (
                <details key={idx} style={{ borderTop: "1px solid #eef2f7" }}>
                  <summary style={summaryRow as any}>
                    <div style={numBox}>{idx + 1}</div>
                    <div
                      style={{
                        fontFamily:
                          "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                      }}
                    >
                      {r.query}
                    </div>
                    <div>{snippet}</div>
                    <div style={{ textAlign: "right" }}>
                      <span
                        style={{
                          ...pill,
                          ...badgeStyle,
                          borderRadius: 8,
                          padding: "4px 8px",
                          border: (badgeStyle as any).border,
                        }}
                      >
                        {r.best_score.toFixed(3)}
                      </span>
                    </div>
                  </summary>
                  <div
                    style={{ padding: "10px 6px 14px", background: "#fbfdff" }}
                  >
                    <div style={{ fontWeight: 700, margin: "4px 0 6px" }}>
                      Top {topK} passages:
                    </div>
                    {r.top.map((t, j) => (
                      <div
                        key={j}
                        style={{
                          border: "1px solid #e5e7eb",
                          borderRadius: 10,
                          padding: 10,
                          margin: "8px 0",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            justifyContent: "space-between",
                            alignItems: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          <span style={pill}>Cos: {t.score.toFixed(3)}</span>
                          <span style={{ ...pill, background: "#f8fafc" }}>
                            {t.score >= 0.9
                              ? "Excellent"
                              : t.score >= 0.85
                              ? "Strong"
                              : "Good"}
                          </span>
                        </div>
                        <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                          {t.text}
                        </div>
                        {t.suggestions?.length > 0 && (
                          <div style={{ marginTop: 8 }}>
                            <div style={{ fontWeight: 700, marginBottom: 4 }}>
                              Optimisation suggestions:
                            </div>
                            <ul style={{ margin: "0 0 0 18px" }}>
                              {t.suggestions.map((s, k) => (
                                <li key={k}>{s}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default PassageLabTab;
