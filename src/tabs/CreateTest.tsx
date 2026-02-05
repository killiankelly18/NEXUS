// src/tabs/CreateTest.tsx
import React, { useMemo, useState } from "react";
import {
  Upload,
  Target,
  Database,
  CheckCircle,
  Sparkles,
  Download,
  Clock,
  TrendingUp,
  TrendingDown,
  Activity,
  ClipboardList,
} from "lucide-react";
import { readCsv, DEFAULT_ALIASES, CsvRow, getOne, getNum } from "../lib/csv";
import { useWorkspace } from "../context/WorkspaceContext";

/** ----------------------------- Styling ----------------------------- */
const styles: Record<string, React.CSSProperties> = {
  tabContent: { display: "flex", flexDirection: "column", gap: 24 },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    fontSize: 22,
    fontWeight: 800,
    color: "#111827",
    margin: 0,
  },
  infoPanel: {
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
    padding: 16,
    borderRadius: 12,
  },
  successPanel: {
    background: "#ecfdf5",
    border: "1px solid #a7f3d0",
    padding: 16,
    borderRadius: 12,
  },
  warnPanel: {
    background: "#fffbeb",
    border: "1px solid #fde68a",
    padding: 16,
    borderRadius: 12,
  },
  inputGroupOrange: {
    background: "#fff",
    border: "1px solid #fdba74",
    borderRadius: 12,
    padding: 16,
  },
  inputGroupPurple: {
    background: "#fff",
    border: "1px solid #c4b5fd",
    borderRadius: 12,
    padding: 16,
  },
  uploadArea: {
    border: "1px dashed #d1d5db",
    padding: 16,
    borderRadius: 10,
    textAlign: "center",
    background: "#fafafa",
  },
  label: {
    fontWeight: 700,
    color: "#111827",
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  generateButton: {
    background: "linear-gradient(90deg, #3b82f6, #6366f1)",
    color: "#fff",
    padding: "12px 20px",
    border: "none",
    borderRadius: 12,
    fontSize: 14,
    fontWeight: 700,
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    cursor: "pointer",
    boxShadow: "0 6px 18px rgba(59,130,246,0.25)",
  },
  generateButtonDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
    filter: "grayscale(0.2)",
  },
  metricCard: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 16,
  },
  dataTable: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
  },
  tableHeader: {
    background: "#f9fafb",
    borderBottom: "1px solid #e5e7eb",
    padding: 12,
    fontSize: 12,
    fontWeight: 700,
    color: "#6b7280",
  },
  tableRow: {
    borderBottom: "1px solid #f3f4f6",
    padding: 12,
    fontSize: 13,
  },
};

/** ----------------------- CSV helpers ----------------------- */
const BOM = "\uFEFF";
const NBSP = String.fromCharCode(160);
const clean = (v: unknown) =>
  String(v ?? "")
    .replace(new RegExp(BOM, "g"), "")
    .replace(new RegExp(NBSP, "g"), " ")
    .trim();

type Vec = Float32Array;

const parseEmbedding = (row: CsvRow): number[] | null => {
  // Try JSON array in common vector columns first
  const vecField = (getOne(row, ["vector", "embedding", "embeddings", "vec"]) ??
    "") as string;
  const txt = clean(vecField);
  if (txt) {
    try {
      const arr = JSON.parse(txt);
      if (Array.isArray(arr) && arr.every((x) => typeof x === "number")) {
        return arr as number[];
      }
    } catch {
      /* fall through to v1..vd */
    }
  }
  // Try v1..vd numeric columns
  const keys = Object.keys(row);
  const vKeys = keys
    .filter((k) => /^v\d+$/i.test(clean(k)))
    .sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10));
  if (vKeys.length > 2) {
    const arr: number[] = [];
    for (const k of vKeys) {
      const n = Number((row as any)[k]);
      if (!Number.isFinite(n)) return null;
      arr.push(n);
    }
    return arr;
  }
  return null;
};

const pickUrl = (row: CsvRow): string =>
  clean(
    getOne(row, [
      "url",
      "address",
      "page",
      "page_url",
      "canonical",
      "loc",
      "target",
    ]) ?? ""
  );

const pickQuery = (row: CsvRow): string =>
  clean(getOne(row, ["query", "topic", "q", "prompt"]) ?? "");

/** ------------------------------ Types ------------------------------ */
type QueryItem = {
  query: string;
  vec?: Vec | null;
};

type PageItem = {
  url: string;
  vec: Vec;
  authority?: number;
};

type XRow = {
  query: string;
  topic_visibility?: number; // 0..1
  avg_rank?: number; // lower is better
  sentiment?: number; // -1..1
  sov?: number; // 0..1
  citation_rank?: number; // higher is better
};

type KPIBlock = {
  coveragePct: number;
  clarityIndex: number;
  connectivityIndex: number;
  xfunnel: {
    topicVisibility: number;
    avgRank: number;
    sentiment: number;
    sov: number;
    citationRank: number;
  };
};

type ChangeLog = {
  type: "url" | "merge" | "link" | "passage";
  detail: string;
  date: string; // yyyy-mm-dd
};

/** ------------------------------ Math ------------------------------ */
const l2 = (v: Float32Array): Float32Array => {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
};

const dot = (a: Float32Array, b: Float32Array): number => {
  const len = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < len; i++) s += a[i] * b[i];
  return s;
};

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const fmt = (x: number) =>
  Number.isFinite(x) ? x.toFixed(3).replace(/\.000$/, "") : "—";

/** ------------------------------ Component ------------------------------ */
const TestingTab: React.FC = () => {
  const ws: any = useWorkspace();
  const { state } = ws;

  /** -------------------- Setup state -------------------- */
  const [queryItems, setQueryItems] = useState<QueryItem[]>([]);
  const [externalEmbeddings, setExternalEmbeddings] = useState<PageItem[]>([]);
  const [includeWorkspaceEmbeddings, setIncludeWorkspaceEmbeddings] =
    useState(true);

  // Hypothesis + levers + window
  const [hypothesis, setHypothesis] = useState(
    "Improving Clarity for <topic> will increase Average Rank by ≥15% within 28 days."
  );
  const [levers, setLevers] = useState({
    coverage: false,
    clarity: true,
    connectivity: false,
    passage: true,
    freshness: false,
  });
  const [windowDays, setWindowDays] = useState(28);
  const [minMatchSim, setMinMatchSim] = useState(0.7);

  // Paste queries + vectorization
  const [pasteText, setPasteText] = useState("");
  const [isVectorizing, setIsVectorizing] = useState(false);

  const vectorizeMissingQueries = async () => {
    const missing = queryItems.filter((q) => !q.vec).map((q) => q.query);
    if (!missing.length) return;

    setIsVectorizing(true);
    try {
      // Prefer embedder from Workspace, else global
      const embedBatch =
        ws?.embedQueries ||
        ws?.embedTextBatch ||
        ws?.embedText ||
        (window as any).nexusEmbedText;

      if (!embedBatch) {
        console.warn(
          "No embedder found. Provide one via WorkspaceContext (embedTextBatch) or window.nexusEmbedText(texts)."
        );
        return;
      }

      const vectors: number[][] = await embedBatch(missing);
      if (!Array.isArray(vectors)) {
        console.warn(
          "Embedder returned unexpected shape. Expected number[][]."
        );
        return;
      }

      let i = 0;
      setQueryItems((prev) =>
        prev.map((q) => {
          if (q.vec) return q;
          const v = vectors[i++];
          return v && Array.isArray(v) ? { ...q, vec: new Float32Array(v) } : q;
        })
      );
    } catch (err) {
      console.error("Vectorize failed:", err);
    } finally {
      setIsVectorizing(false);
    }
  };

  // Implementation tracking
  const [changes, setChanges] = useState<ChangeLog[]>([]);

  // XFunnel snapshots
  const [baselineXfunnel, setBaselineXfunnel] = useState<XRow[] | null>(null);
  const [postXfunnel, setPostXfunnel] = useState<XRow[] | null>(null);

  // Outputs
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [baseline, setBaseline] = useState<KPIBlock | null>(null);
  const [post, setPost] = useState<KPIBlock | null>(null);

  /** -------------------- Workspace data -------------------- */
  const workspacePages: PageItem[] = useMemo(() => {
    const rows = state.embeddingsCsv ?? [];
    const out: PageItem[] = [];
    for (const r of rows) {
      const url = pickUrl(r);
      const vec = parseEmbedding(r);
      if (!url || !vec) continue;
      const authority = getNum(r, ["authority", "dr", "score", "clicks"], NaN);
      out.push({
        url,
        vec: new Float32Array(vec),
        authority: Number.isFinite(authority) ? authority : undefined,
      });
    }
    return out;
  }, [state.embeddingsCsv]);

  // If your context already has XFunnel, wire them here:
  const workspaceXfunnelBaseline: XRow[] | null = null; // state.xfunnelBaseline ?? null
  const workspaceXfunnelPost: XRow[] | null = null; // state.xfunnelPost ?? null

  const allPages = useMemo(() => {
    const merged = includeWorkspaceEmbeddings
      ? [...workspacePages, ...externalEmbeddings]
      : [...externalEmbeddings];
    const seen = new Map<string, PageItem>();
    for (const p of merged) seen.set(p.url.toLowerCase(), p);
    return Array.from(seen.values());
  }, [workspacePages, externalEmbeddings, includeWorkspaceEmbeddings]);

  /** -------------------- Upload handlers -------------------- */
  const handleQueriesUpload = async (
    ev: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    const parsed = await readCsv(file, { aliases: DEFAULT_ALIASES });
    const out: QueryItem[] = [];
    for (const r of parsed.rows) {
      const q = pickQuery(r);
      if (!q) continue;
      const ve = parseEmbedding(r);
      out.push({ query: q, vec: ve ? new Float32Array(ve) : null });
    }
    setQueryItems(out);
    ev.target.value = "";
  };

  // Paste queries support
  const parsePastedQueries = (text: string): string[] =>
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const firstCell = line.split(",")[0] ?? "";
        return firstCell.replace(/^"(.*)"$/, "$1").trim();
      })
      .filter(Boolean);

  const addPastedQueries = () => {
    const qs = parsePastedQueries(pasteText);
    if (!qs.length) return;

    setQueryItems((prev) => {
      const existing = new Set(prev.map((q) => q.query.toLowerCase()));
      const newOnes = qs
        .filter((q) => !existing.has(q.toLowerCase()))
        .map((q) => ({ query: q, vec: null as Vec | null }));
      return [...prev, ...newOnes];
    });

    setPasteText("");
  };

  const handleEmbeddingsUpload = async (
    ev: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    const parsed = await readCsv(file, { aliases: DEFAULT_ALIASES });
    const out: PageItem[] = [];
    for (const r of parsed.rows) {
      const url = pickUrl(r);
      const ve = parseEmbedding(r);
      if (!url || !ve) continue;
      const authority = getNum(r, ["authority", "dr", "score", "clicks"], NaN);
      out.push({
        url,
        vec: new Float32Array(ve),
        authority: Number.isFinite(authority) ? authority : undefined,
      });
    }
    setExternalEmbeddings(out);
    ev.target.value = "";
  };

  const readXfunnelCsv = (rows: CsvRow[]): XRow[] => {
    const out: XRow[] = [];
    for (const r of rows) {
      const q = pickQuery(r);
      if (!q) continue;
      let tv = getNum(r, ["topic_visibility", "visibility", "mentions"], NaN);
      if (tv > 1 && tv <= 100) tv = tv / 100;
      let sv = getNum(r, ["sov", "share_of_voice"], NaN);
      if (sv > 1 && sv <= 100) sv = sv / 100;
      let sent = getNum(r, ["sentiment", "sent"], NaN);
      if (sent > 1 && sent <= 100) sent = (sent - 50) / 50; // 0..100 -> -1..1
      out.push({
        query: q,
        topic_visibility: Number.isFinite(tv) ? tv : undefined,
        avg_rank: getNum(r, ["avg_rank", "rank", "position"], NaN),
        sentiment: Number.isFinite(sent) ? sent : undefined,
        sov: Number.isFinite(sv) ? sv : undefined,
        citation_rank: getNum(r, ["citation_rank", "cit_rank", "cr"], NaN),
      });
    }
    return out;
  };

  const handleBaselineXUpload = async (
    ev: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    const parsed = await readCsv(file, { aliases: DEFAULT_ALIASES });
    setBaselineXfunnel(readXfunnelCsv(parsed.rows));
    ev.target.value = "";
  };

  const handlePostXUpload = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    const parsed = await readCsv(file, { aliases: DEFAULT_ALIASES });
    setPostXfunnel(readXfunnelCsv(parsed.rows));
    ev.target.value = "";
  };

  /** -------------------- KPI calculations -------------------- */
  const computeInternalKPIs = (
    queries: QueryItem[],
    pages: PageItem[],
    minSim: number
  ) => {
    const pagesU = pages.map((p) => l2(p.vec));
    const coverageHits: number[] = [];
    const top1List: number[] = [];
    const top2List: number[] = [];
    const connList: number[] = [];

    for (const qi of queries) {
      if (!qi.vec) {
        coverageHits.push(0);
        continue;
      }
      const uQ = l2(qi.vec);
      let best = -1,
        second = -1,
        bestIdx = -1;
      for (let i = 0; i < pagesU.length; i++) {
        const s = dot(uQ, pagesU[i]);
        if (s > best) {
          second = best;
          best = s;
          bestIdx = i;
        } else if (s > second) {
          second = s;
        }
      }
      coverageHits.push(best >= minSim ? 1 : 0);
      if (best >= 0) top1List.push(best);
      if (second >= 0) top2List.push(second);
      if (bestIdx >= 0) {
        const auth = pages[bestIdx].authority ?? 0;
        connList.push(auth);
      }
    }

    const coveragePct =
      coverageHits.length > 0
        ? coverageHits.reduce((a, b) => a + b, 0) / coverageHits.length
        : 0;

    // Clarity Index: 1 - avg(top2/top1)
    let clarityIndex = 0.0;
    if (top1List.length && top2List.length) {
      const ratio =
        top1List
          .map((t1, i) => {
            const t2 = top2List[i] ?? 0;
            if (t1 <= 0) return 0;
            return Math.min(1, Math.max(0, t2 / t1));
          })
          .reduce((a, b) => a + b, 0) / top1List.length;
      clarityIndex = 1 - ratio;
    }

    // Connectivity Index: simple normalization of authority (0..100 → 0..1)
    let connectivityIndex = 0.0;
    if (connList.length) {
      const meanAuth = connList.reduce((a, b) => a + b, 0) / connList.length;
      connectivityIndex = Math.max(0, Math.min(1, meanAuth / 100));
    }

    return { coveragePct, clarityIndex, connectivityIndex };
  };

  const aggregateX = (rows: XRow[], subset?: Set<string>) => {
    const sel = subset ? rows.filter((r) => subset.has(r.query)) : rows.slice();
    if (!sel.length) {
      return {
        topicVisibility: NaN,
        avgRank: NaN,
        sentiment: NaN,
        sov: NaN,
        citationRank: NaN,
      };
    }
    const safeMean = (arr: number[]) =>
      arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : NaN;

    return {
      topicVisibility: safeMean(
        sel
          .map((r) => r.topic_visibility)
          .filter((x): x is number => Number.isFinite(x as number))
      ),
      avgRank: safeMean(
        sel
          .map((r) => r.avg_rank)
          .filter((x): x is number => Number.isFinite(x as number))
      ),
      sentiment: safeMean(
        sel
          .map((r) => r.sentiment)
          .filter((x): x is number => Number.isFinite(x as number))
      ),
      sov: safeMean(
        sel
          .map((r) => r.sov)
          .filter((x): x is number => Number.isFinite(x as number))
      ),
      citationRank: safeMean(
        sel
          .map((r) => r.citation_rank)
          .filter((x): x is number => Number.isFinite(x as number))
      ),
    };
  };

  const computeBlock = (
    xfunnelRows: XRow[] | null,
    queries: QueryItem[],
    pages: PageItem[],
    minSim: number
  ): KPIBlock => {
    const internal = computeInternalKPIs(queries, pages, minSim);
    const qSet = new Set(queries.map((q) => q.query));
    const xf = xfunnelRows ? aggregateX(xfunnelRows, qSet) : aggregateX([]);
    return {
      coveragePct: internal.coveragePct,
      clarityIndex: internal.clarityIndex,
      connectivityIndex: internal.connectivityIndex,
      xfunnel: {
        topicVisibility: xf.topicVisibility,
        avgRank: xf.avgRank,
        sentiment: xf.sentiment,
        sov: xf.sov,
        citationRank: xf.citationRank,
      },
    };
  };

  /** -------------------- Run baseline / post -------------------- */
  const runBaseline = async () => {
    if (!queryItems.length) return;
    setIsAnalyzing(true);
    const x = workspaceXfunnelBaseline ?? baselineXfunnel;
    const block = computeBlock(x, queryItems, allPages, minMatchSim);
    setBaseline(block);
    setIsAnalyzing(false);
  };

  const runPost = async () => {
    if (!queryItems.length) return;
    setIsAnalyzing(true);
    const x = workspaceXfunnelPost ?? postXfunnel;
    const block = computeBlock(x, queryItems, allPages, minMatchSim);
    setPost(block);
    setIsAnalyzing(false);
  };

  /** -------------------- Hypothesis pass/fail -------------------- */
  const delta = (b: number, a: number) =>
    Number.isFinite(b) && Number.isFinite(a) ? a - b : NaN;

  const passFail = (b: KPIBlock | null, a: KPIBlock | null) => {
    if (!b || !a) return { pass: null, reason: "Awaiting results" };
    // Default: Avg Rank improves by ≥15% (i.e., decreases by 15%)
    const r0 = b.xfunnel.avgRank;
    const r1 = a.xfunnel.avgRank;
    if (!Number.isFinite(r0) || !Number.isFinite(r1))
      return { pass: null, reason: "Insufficient rank data" };
    if (r0 <= 0) return { pass: null, reason: "Invalid baseline rank" };
    const improvement = (r0 - r1) / r0; // positive is good
    const pass = improvement >= 0.15;
    return {
      pass,
      reason: pass
        ? `Avg Rank improved by ${(improvement * 100).toFixed(1)}%`
        : `Avg Rank improved by ${(improvement * 100).toFixed(
            1
          )}% (< 15% target)`,
    };
  };

  /** -------------------- Change logging -------------------- */
  const addChange = (type: ChangeLog["type"], detail: string, date: string) => {
    if (!detail || !date) return;
    setChanges((c) => [...c, { type, detail, date }]);
  };

  const removeChange = (i: number) =>
    setChanges((c) => c.filter((_, idx) => idx !== i));

  /** -------------------- Export report -------------------- */
  const exportReport = () => {
    const header = [
      "hypothesis",
      "window_days",
      "levers",
      "coverage_baseline",
      "clarity_baseline",
      "connectivity_baseline",
      "tv_baseline",
      "rank_baseline",
      "sent_baseline",
      "sov_baseline",
      "cr_baseline",
      "coverage_post",
      "clarity_post",
      "connectivity_post",
      "tv_post",
      "rank_post",
      "sent_post",
      "sov_post",
      "cr_post",
      "delta_tv",
      "delta_rank",
      "delta_sent",
      "delta_sov",
      "delta_cr",
      "pass_fail",
      "reason",
      "changes_json",
    ];
    const b = baseline;
    const p = post;
    const pf = passFail(b, p);
    const line = [
      JSON.stringify(hypothesis),
      windowDays,
      JSON.stringify(
        Object.keys(levers)
          .filter((k) => (levers as any)[k])
          .join("|")
      ),
      b ? fmt(b.coveragePct) : "",
      b ? fmt(b.clarityIndex) : "",
      b ? fmt(b.connectivityIndex) : "",
      b ? fmt(b.xfunnel.topicVisibility) : "",
      b ? fmt(b.xfunnel.avgRank) : "",
      b ? fmt(b.xfunnel.sentiment) : "",
      b ? fmt(b.xfunnel.sov) : "",
      b ? fmt(b.xfunnel.citationRank) : "",
      p ? fmt(p.coveragePct) : "",
      p ? fmt(p.clarityIndex) : "",
      p ? fmt(p.connectivityIndex) : "",
      p ? fmt(p.xfunnel.topicVisibility) : "",
      p ? fmt(p.xfunnel.avgRank) : "",
      p ? fmt(p.xfunnel.sentiment) : "",
      p ? fmt(p.xfunnel.sov) : "",
      p ? fmt(p.xfunnel.citationRank) : "",
      b && p
        ? fmt(delta(b.xfunnel.topicVisibility, p.xfunnel.topicVisibility))
        : "",
      b && p ? fmt(delta(b.xfunnel.avgRank, p.xfunnel.avgRank)) : "",
      b && p ? fmt(delta(b.xfunnel.sentiment, p.xfunnel.sentiment)) : "",
      b && p ? fmt(delta(b.xfunnel.sov, p.xfunnel.sov)) : "",
      b && p ? fmt(delta(b.xfunnel.citationRank, p.xfunnel.citationRank)) : "",
      pf.pass === null ? "pending" : pf.pass ? "pass" : "fail",
      JSON.stringify(pf.reason),
      JSON.stringify(changes),
    ];

    const blob = new Blob([[header.join(","), line.join(",")].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nexus_testing_report.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  /** -------------------- Render -------------------- */
  const totalPages = allPages.length;
  const pf = passFail(baseline, post);

  return (
    <div style={styles.tabContent}>
      <h2 style={styles.sectionHeader}>
        <Activity size={28} />
        Testing & Experiments
      </h2>

      <div style={styles.infoPanel}>
        <h4 style={{ fontWeight: "bold", color: "#1e40af", marginBottom: 8 }}>
          🧪 Controlled AI Search Testing
        </h4>
        <p style={{ color: "#1e40af", margin: 0 }}>
          Select queries, compute a baseline (Coverage / Clarity / Connectivity
          + XFunnel), log your implementations, then re-evaluate and export a
          Test Report.
        </p>
      </div>

      {state.embeddingsCsv?.length ? (
        <div style={styles.successPanel}>
          <h4 style={{ fontWeight: "bold", color: "#047857", marginBottom: 8 }}>
            ✅ Workspace Embeddings Available
          </h4>
          <p style={{ color: "#047857", margin: 0 }}>
            Found {state.embeddingsCsv.length.toLocaleString()} pages in
            Workspace. You can include these automatically in analysis.
          </p>
        </div>
      ) : (
        <div style={styles.warnPanel}>
          <strong style={{ color: "#92400e" }}>Heads up:</strong> No Workspace
          embeddings detected. Upload embeddings to improve baseline quality.
        </div>
      )}

      {/* -------------------- Setup Panel -------------------- */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 32,
          marginBottom: 8,
        }}
      >
        {/* Left column: Queries Upload + Paste + Actions */}
        <div style={styles.inputGroupOrange}>
          <label style={styles.label}>
            <Target size={16} color="#f97316" />
            Test Queries/Topics
          </label>

          {/* Upload */}
          <div style={styles.uploadArea}>
            <input
              type="file"
              accept=".csv"
              onChange={handleQueriesUpload}
              style={{ display: "none" }}
              id="testing-queries-upload"
            />
            <label
              htmlFor="testing-queries-upload"
              style={{ cursor: "pointer" }}
            >
              <Upload
                size={24}
                color="#6b7280"
                style={{ margin: "0 auto 8px", display: "block" }}
              />
              <p
                style={{ color: "#6b7280", fontSize: 14, margin: "0 0 8px 0" }}
              >
                Upload CSV with <strong>query</strong> column (optional
                embedding columns)
              </p>
              <div
                style={{
                  background: "#f97316",
                  color: "white",
                  padding: "6px 12px",
                  borderRadius: 6,
                  display: "inline-block",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                Choose Queries
              </div>
            </label>
          </div>

          {queryItems.length ? (
            <div
              style={{
                marginTop: 12,
                padding: "8px 12px",
                background: "#fff7ed",
                border: "1px solid #fdba74",
                borderRadius: 6,
                fontSize: 12,
                color: "#c2410c",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <CheckCircle size={14} />
              <span>{queryItems.length.toLocaleString()} queries loaded</span>
            </div>
          ) : null}

          {/* Paste queries */}
          <div style={{ marginTop: 12 }}>
            <label style={{ ...styles.label, marginBottom: 6 }}>
              Or Paste Queries
            </label>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={5}
              placeholder={`One query per line\nOR a simple CSV — the first column will be used`}
              style={{
                width: "100%",
                border: "1px solid #d1d5db",
                borderRadius: 8,
                padding: 10,
                fontSize: 13,
                background: "#fff",
              }}
            />
            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 8,
                alignItems: "center",
              }}
            >
              <button
                onClick={addPastedQueries}
                disabled={!pasteText.trim()}
                style={{
                  border: "1px solid #d1d5db",
                  background: "#fff",
                  color: "#374151",
                  padding: "10px 14px",
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: pasteText.trim() ? "pointer" : "not-allowed",
                }}
              >
                Add from Paste
              </button>

              <button
                onClick={vectorizeMissingQueries}
                disabled={isVectorizing || !queryItems.some((q) => !q.vec)}
                style={{
                  ...styles.generateButton,
                  ...(isVectorizing || !queryItems.some((q) => !q.vec)
                    ? styles.generateButtonDisabled
                    : {}),
                }}
              >
                {isVectorizing ? (
                  <>
                    <Clock size={16} />
                    <span>Embedding…</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    <span>Vectorize Missing</span>
                  </>
                )}
              </button>

              <span style={{ fontSize: 12, color: "#6b7280" }}>
                {queryItems.filter((q) => !q.vec).length} without vectors
              </span>
            </div>
          </div>
        </div>

        {/* Right column: Embeddings Upload */}
        <div style={styles.inputGroupPurple}>
          <label style={styles.label}>
            <Database size={16} color="#7c3aed" />
            Embeddings (Optional Crawl)
          </label>
          <div style={styles.uploadArea}>
            <input
              type="file"
              accept=".csv"
              onChange={handleEmbeddingsUpload}
              style={{ display: "none" }}
              id="testing-embeddings-upload"
            />
            <label
              htmlFor="testing-embeddings-upload"
              style={{ cursor: "pointer" }}
            >
              <Upload
                size={24}
                color="#6b7280"
                style={{ margin: "0 auto 8px", display: "block" }}
              />
              <p
                style={{ color: "#6b7280", fontSize: 14, margin: "0 0 8px 0" }}
              >
                Upload CSV with URL + embedding (JSON array or v1..vd)
              </p>
              <div
                style={{
                  background: "#7c3aed",
                  color: "white",
                  padding: "6px 12px",
                  borderRadius: 6,
                  display: "inline-block",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                Choose Embeddings
              </div>
            </label>
          </div>

          <div
            style={{
              marginTop: 12,
              padding: "8px 12px",
              background: "#faf5ff",
              border: "1px solid #c4b5fd",
              borderRadius: 6,
              fontSize: 12,
              color: "#7c3aed",
            }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <CheckCircle size={14} />
              <span>
                {totalPages.toLocaleString()} pages ready (Workspace{" "}
                {includeWorkspaceEmbeddings ? "included" : "excluded"}
                {externalEmbeddings.length
                  ? `, + ${externalEmbeddings.length.toLocaleString()} from upload`
                  : ""}
                )
              </span>
            </div>
            {state.embeddingsCsv?.length ? (
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 8,
                  color: "#6b21a8",
                }}
              >
                <input
                  type="checkbox"
                  checked={includeWorkspaceEmbeddings}
                  onChange={(e) =>
                    setIncludeWorkspaceEmbeddings(e.target.checked)
                  }
                />
                Include Workspace embeddings
              </label>
            ) : null}
          </div>
        </div>
      </div>

      {/* Hypothesis + Levers + Window */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr",
          gap: 16,
          marginTop: -8,
        }}
      >
        <div style={{ ...styles.metricCard, borderLeft: "4px solid #3b82f6" }}>
          <label className="hypothesis" style={styles.label}>
            <ClipboardList size={16} color="#3b82f6" />
            Hypothesis
          </label>
          <textarea
            value={hypothesis}
            onChange={(e) => setHypothesis(e.target.value)}
            rows={3}
            style={{
              width: "100%",
              border: "1px solid #d1d5db",
              borderRadius: 8,
              padding: 10,
              fontSize: 13,
            }}
            placeholder='e.g., "Improving Clarity for X will increase Average Rank by ≥15% within 30 days."'
          />
        </div>
        <div style={styles.metricCard}>
          <div style={styles.label}>Levers</div>
          {[
            ["coverage", "Coverage"],
            ["clarity", "Clarity"],
            ["connectivity", "Connectivity"],
            ["passage", "Passage Fit"],
            ["freshness", "Freshness"],
          ].map(([k, label]) => (
            <label
              key={k}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: "#374151",
              }}
            >
              <input
                type="checkbox"
                checked={(levers as any)[k]}
                onChange={(e) =>
                  setLevers((o) => ({ ...o, [k]: e.target.checked }))
                }
              />
              {label}
            </label>
          ))}
        </div>
        <div style={styles.metricCard}>
          <div style={styles.label}>Evaluation Window</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              value={windowDays}
              onChange={(e) => setWindowDays(parseInt(e.target.value) || 28)}
              style={{
                border: "1px solid #d1d5db",
                borderRadius: 8,
                padding: "6px 10px",
                fontSize: 13,
              }}
            >
              {[14, 28, 56].map((d) => (
                <option key={d} value={d}>
                  {d}-day pre/post
                </option>
              ))}
            </select>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "#6b7280", fontSize: 12 }}>
                Min Match Sim
              </span>
              <input
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={minMatchSim}
                onChange={(e) =>
                  setMinMatchSim(
                    Math.min(1, Math.max(0, parseFloat(e.target.value) || 0.7))
                  )
                }
                style={{
                  width: 72,
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                }}
              />
            </label>
          </div>
        </div>
      </div>

      {/* -------------------- Baseline / Post Controls -------------------- */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 32,
          marginTop: 8,
        }}
      >
        {/* Baseline block */}
        <div style={styles.inputGroupOrange}>
          <label style={styles.label}>
            <Target size={16} color="#f97316" />
            Baseline Snapshot (XFunnel)
          </label>
          <div style={styles.uploadArea}>
            <input
              type="file"
              accept=".csv"
              onChange={handleBaselineXUpload}
              style={{ display: "none" }}
              id="testing-baseline-x"
            />
            <label htmlFor="testing-baseline-x" style={{ cursor: "pointer" }}>
              <Upload
                size={24}
                color="#6b7280"
                style={{ margin: "0 auto 8px", display: "block" }}
              />
              <p
                style={{ color: "#6b7280", fontSize: 14, margin: "0 0 8px 0" }}
              >
                Optional: Upload XFunnel <strong>baseline</strong> CSV (query +
                metrics)
              </p>
              <div
                style={{
                  background: "#f97316",
                  color: "white",
                  padding: "6px 12px",
                  borderRadius: 6,
                  display: "inline-block",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                Choose Baseline CSV
              </div>
            </label>
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
            <button
              onClick={runBaseline}
              disabled={!queryItems.length || isAnalyzing}
              style={{
                ...styles.generateButton,
                ...(!queryItems.length || isAnalyzing
                  ? styles.generateButtonDisabled
                  : {}),
              }}
            >
              {isAnalyzing ? (
                <>
                  <Clock size={18} />
                  <span>Computing Baseline…</span>
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  <span>Compute Baseline</span>
                </>
              )}
            </button>
          </div>

          {baseline && (
            <div style={{ marginTop: 14 }}>
              <div style={styles.successPanel}>
                <strong style={{ color: "#047857" }}>Baseline stored.</strong>{" "}
                Coverage {pct(baseline.coveragePct)} · Clarity{" "}
                {fmt(baseline.clarityIndex)} · Connectivity{" "}
                {fmt(baseline.connectivityIndex)} · Rank{" "}
                {fmt(baseline.xfunnel.avgRank)}
              </div>
            </div>
          )}
        </div>

        {/* Post block */}
        <div style={styles.inputGroupPurple}>
          <label style={styles.label}>
            <Database size={16} color="#7c3aed" />
            Post Snapshot (XFunnel)
          </label>
          <div style={styles.uploadArea}>
            <input
              type="file"
              accept=".csv"
              onChange={handlePostXUpload}
              style={{ display: "none" }}
              id="testing-post-x"
            />
            <label htmlFor="testing-post-x" style={{ cursor: "pointer" }}>
              <Upload
                size={24}
                color="#6b7280"
                style={{ margin: "0 auto 8px", display: "block" }}
              />
              <p
                style={{ color: "#6b7280", fontSize: 14, margin: "0 0 8px 0" }}
              >
                Optional: Upload XFunnel <strong>post</strong> CSV (same
                queries)
              </p>
              <div
                style={{
                  background: "#7c3aed",
                  color: "white",
                  padding: "6px 12px",
                  borderRadius: 6,
                  display: "inline-block",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                Choose Post CSV
              </div>
            </label>
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
            <button
              onClick={runPost}
              disabled={!queryItems.length || isAnalyzing}
              style={{
                ...styles.generateButton,
                ...(!queryItems.length || isAnalyzing
                  ? styles.generateButtonDisabled
                  : {}),
              }}
            >
              {isAnalyzing ? (
                <>
                  <Clock size={18} />
                  <span>Re-evaluating…</span>
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  <span>Compute Post</span>
                </>
              )}
            </button>
          </div>

          {post && (
            <div style={{ marginTop: 14 }}>
              <div style={styles.successPanel}>
                <strong style={{ color: "#047857" }}>
                  Post snapshot ready.
                </strong>{" "}
                Coverage {pct(post.coveragePct)} · Clarity{" "}
                {fmt(post.clarityIndex)} · Connectivity{" "}
                {fmt(post.connectivityIndex)} · Rank {fmt(post.xfunnel.avgRank)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* -------------------- Implementation Tracking -------------------- */}
      <div>
        <h3
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: "#1f2937",
            marginBottom: 12,
          }}
        >
          Implementation Tracking
        </h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 100px",
            gap: 8,
            marginBottom: 8,
          }}
        >
          <input
            id="impl-detail"
            placeholder="Describe change (URL edited, pages merged: A -> B, links added, passage updated…) "
            style={{
              border: "1px solid #d1d5db",
              borderRadius: 8,
              padding: "8px 10px",
              fontSize: 13,
            }}
          />
          <select
            id="impl-type"
            style={{
              border: "1px solid #d1d5db",
              borderRadius: 8,
              padding: "8px 10px",
              fontSize: 13,
            }}
            defaultValue="url"
          >
            <option value="url">URL</option>
            <option value="merge">Merge</option>
            <option value="link">Link</option>
            <option value="passage">Passage</option>
          </select>
          <input
            id="impl-date"
            type="date"
            style={{
              border: "1px solid #d1d5db",
              borderRadius: 8,
              padding: "8px 10px",
              fontSize: 13,
            }}
          />
        </div>
        <div>
          <button
            onClick={() => {
              const d = (
                document.getElementById("impl-detail") as HTMLInputElement
              )?.value;
              const t = (
                document.getElementById("impl-type") as HTMLSelectElement
              )?.value as ChangeLog["type"];
              const dt = (
                document.getElementById("impl-date") as HTMLInputElement
              )?.value;
              addChange(t, d, dt);
              const input = document.getElementById(
                "impl-detail"
              ) as HTMLInputElement;
              if (input) input.value = "";
            }}
            style={{
              background: "#10b981",
              color: "#fff",
              padding: "10px 16px",
              borderRadius: 10,
              border: "none",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Add Change
          </button>
        </div>

        {changes.length > 0 && (
          <div style={{ ...styles.dataTable, marginTop: 12 }}>
            <div style={styles.tableHeader}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "120px 1fr 140px 60px",
                  gap: 12,
                }}
              >
                <div>Type</div>
                <div>Detail</div>
                <div>Date</div>
                <div></div>
              </div>
            </div>
            <div style={{ maxHeight: 320, overflowY: "auto" }}>
              {changes.map((c, idx) => (
                <div
                  key={idx}
                  style={{
                    ...styles.tableRow,
                    display: "grid",
                    gridTemplateColumns: "120px 1fr 140px 60px",
                    gap: 12,
                    alignItems: "start",
                  }}
                >
                  <div>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 6,
                        fontSize: 12,
                        background:
                          c.type === "merge"
                            ? "#fde68a"
                            : c.type === "link"
                            ? "#dbeafe"
                            : c.type === "passage"
                            ? "#dcfce7"
                            : "#f3e8ff",
                        color:
                          c.type === "merge"
                            ? "#92400e"
                            : c.type === "link"
                            ? "#1e40af"
                            : c.type === "passage"
                            ? "#065f46"
                            : "#6b21a8",
                        fontWeight: 700,
                      }}
                    >
                      {c.type.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ wordBreak: "break-word" }}>{c.detail}</div>
                  <div>{c.date || "—"}</div>
                  <div>
                    <button
                      onClick={() => removeChange(idx)}
                      style={{
                        border: "1px solid #e5e7eb",
                        background: "#fff",
                        borderRadius: 8,
                        padding: "6px 10px",
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* -------------------- Results View -------------------- */}
      {baseline && post && (
        <div style={{ marginTop: 8 }}>
          <h3
            style={{
              fontSize: 18,
              fontWeight: "bold",
              color: "#1f2937",
              marginBottom: 12,
            }}
          >
            Results & Deltas
          </h3>

          {/* Summary traffic lights */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: 16,
              marginBottom: 16,
            }}
          >
            {[
              {
                key: "topicVisibility",
                label: "Topic Visibility",
                delta: delta(
                  baseline.xfunnel.topicVisibility,
                  post.xfunnel.topicVisibility
                ),
                higherIsBetter: true,
              },
              {
                key: "avgRank",
                label: "Average Rank",
                delta:
                  delta(baseline.xfunnel.avgRank, post.xfunnel.avgRank) * -1, // invert
                higherIsBetter: true,
              },
              {
                key: "sentiment",
                label: "Sentiment",
                delta: delta(
                  baseline.xfunnel.sentiment,
                  post.xfunnel.sentiment
                ),
                higherIsBetter: true,
              },
              {
                key: "sov",
                label: "Share of Voice",
                delta: delta(baseline.xfunnel.sov, post.xfunnel.sov),
                higherIsBetter: true,
              },
              {
                key: "citationRank",
                label: "Citation Rank",
                delta: delta(
                  baseline.xfunnel.citationRank,
                  post.xfunnel.citationRank
                ),
                higherIsBetter: true,
              },
            ].map((m) => {
              const good = Number.isFinite(m.delta) && m.delta > 0;
              const bad = Number.isFinite(m.delta) && m.delta < 0;
              return (
                <div
                  key={m.key}
                  style={{
                    ...styles.metricCard,
                    borderLeft: `4px solid ${
                      good ? "#10b981" : bad ? "#ef4444" : "#e5e7eb"
                    }`,
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    {good ? (
                      <TrendingUp size={16} color="#10b981" />
                    ) : bad ? (
                      <TrendingDown size={16} color="#ef4444" />
                    ) : (
                      <Clock size={16} color="#6b7280" />
                    )}
                    <h4
                      style={{
                        fontSize: 14,
                        fontWeight: "bold",
                        color: "#1f2937",
                        margin: 0,
                      }}
                    >
                      {m.label}
                    </h4>
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>
                    {Number.isFinite(m.delta) ? fmt(m.delta) : "—"}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    {m.higherIsBetter ? "Higher is better" : "Lower is better"}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Internal KPI cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 16,
              marginBottom: 8,
            }}
          >
            {[
              {
                label: "Coverage",
                b: baseline.coveragePct,
                p: post.coveragePct,
                fmtv: (x: number) => pct(x),
              },
              {
                label: "Clarity",
                b: baseline.clarityIndex,
                p: post.clarityIndex,
                fmtv: fmt,
              },
              {
                label: "Connectivity",
                b: baseline.connectivityIndex,
                p: post.connectivityIndex,
                fmtv: fmt,
              },
            ].map((m, i) => {
              const d =
                Number.isFinite(m.b) && Number.isFinite(m.p) ? m.p - m.b : NaN;
              const good = Number.isFinite(d) && d > 0;
              const bad = Number.isFinite(d) && d < 0;
              return (
                <div
                  key={i}
                  style={{
                    ...styles.metricCard,
                    borderLeft: `4px solid ${
                      good ? "#10b981" : bad ? "#ef4444" : "#e5e7eb"
                    }`,
                  }}
                >
                  <h4 style={{ fontSize: 14, fontWeight: "bold", margin: 0 }}>
                    {m.label}
                  </h4>
                  <div style={{ fontSize: 13, color: "#6b7280" }}>
                    Baseline <strong>{m.fmtv(m.b)}</strong> → Post{" "}
                    <strong>{m.fmtv(m.p)}</strong>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>
                    {Number.isFinite(d) ? (d >= 0 ? "+" : "") + fmt(d) : "—"}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Hypothesis evaluation */}
          <div
            style={{
              ...styles.metricCard,
              borderLeft:
                pf.pass === null
                  ? "4px solid #f59e0b"
                  : pf.pass
                  ? "4px solid #10b981"
                  : "4px solid #ef4444",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {pf.pass === null ? (
                <Clock size={18} color="#f59e0b" />
              ) : pf.pass ? (
                <CheckCircle size={18} color="#10b981" />
              ) : (
                <TrendingDown size={18} color="#ef4444" />
              )}
              <div style={{ fontWeight: 800, fontSize: 14 }}>
                Hypothesis Evaluation
              </div>
            </div>
            <div style={{ marginTop: 8, color: "#374151" }}>{pf.reason}</div>
            <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280" }}>
              Rule: Avg Rank improvement ≥ 15% (lower is better). Adjust in code
              or future UI.
            </div>
          </div>
        </div>
      )}

      {/* -------------------- Export / Share -------------------- */}
      <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
        <button
          onClick={exportReport}
          disabled={!baseline || !post}
          style={{
            ...styles.generateButton,
            ...(!baseline || !post ? styles.generateButtonDisabled : {}),
          }}
        >
          <Download size={16} />
          Export Test Report (CSV)
        </button>
      </div>
    </div>
  );
};

export default TestingTab;
