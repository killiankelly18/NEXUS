import React from "react";

/* ---------------- soft imports (Workspace + CSV utils) ---------------- */
let useWorkspace: undefined | (() => any);
let readCsv:
  | undefined
  | ((file: File) => Promise<{ rows: Record<string, string>[] }>);

try {
  const ws = require("../context/WorkspaceContext");
  if (ws?.useWorkspace) useWorkspace = ws.useWorkspace;
} catch {}
try {
  const csv = require("../lib/csv");
  if (csv?.readCsv) readCsv = csv.readCsv;
} catch {}

// Fallbacks to keep the file self-contained in dev
if (!useWorkspace) {
  useWorkspace = () => ({
    apiKey: "",
    state: { queriesCsv: [], embeddingsCsv: [], authorityCsv: [] },
    siteEmbeddings: [], // preferred store (if your app exposes it)
  });
}
if (!readCsv) {
  readCsv = async (file: File) => {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (!lines.length) return { rows: [] };
    const header = lines[0].split(",").map((s) => s.trim());
    const rows = lines.slice(1).map((ln) => {
      const vals = ln.split(",").map((s) => s.trim());
      const obj: Record<string, string> = {};
      header.forEach((h, i) => (obj[h] = vals[i] ?? ""));
      return obj;
    });
    return { rows };
  };
}

/* ------------------------ small helpers & types ------------------------ */
type EmbRow = {
  url: string;
  vector: number[];
  title?: string;
  relCanonical?: string | null;
  [k: string]: any;
};
type CanonGroup = {
  key: string;
  primaryUrl: string;
  members: EmbRow[];
  vector: number[];
};

const NBSP = String.fromCharCode(160);
const BOM = "\uFEFF";
const clean = (v: unknown) =>
  String(v ?? "")
    .replace(new RegExp(BOM, "g"), "")
    .replace(new RegExp(NBSP, "g"), " ")
    .trim();

const normalizeKey = (k: unknown) =>
  String(k ?? "")
    .replace(new RegExp(BOM, "g"), "")
    .replace(new RegExp(NBSP, "g"), " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 _-]/g, "");

const cosine = (a: number[], b: number[]) => {
  let dot = 0,
    na = 0,
    nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
};

function parseEmbeddingFlexible(r: Record<string, string>): number[] | null {
  // Try single JSON column first
  const candidates = [
    "vector",
    "embedding",
    "embeddings",
    "page embedding",
    "page embeddings",
    "semantic embedding",
    "semantic embeddings",
  ];
  for (const k of Object.keys(r)) {
    const nk = normalizeKey(k);
    if (candidates.includes(nk)) {
      const raw = clean(r[k]);
      if (raw.startsWith("[") && raw.endsWith("]")) {
        try {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr) && arr.every((x) => typeof x === "number"))
            return arr;
        } catch {}
      }
      // Tolerant numeric list
      const safe = raw
        .replace(/[^0-9eE+\-.,;\s|\[\]]+/g, " ")
        .trim()
        .replace(/^\[|\]$/g, "");
      const parts = safe.split(/[ ,;|\t\n\r]+/).filter(Boolean);
      const nums = parts.map(Number).filter(Number.isFinite);
      if (nums.length) return nums;
    }
  }
  // Then try v1..vd columns
  const vCols = Object.keys(r).filter((k) => /^v\d+$/i.test(k));
  if (vCols.length) {
    const sorted = vCols.sort(
      (a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1))
    );
    const nums = sorted.map((k) => Number(r[k])).filter(Number.isFinite);
    if (nums.length === sorted.length) return nums;
  }
  return null;
}

function canonicalKey(raw: string): string {
  try {
    const u = new URL(raw.trim());
    const scheme = u.protocol.replace(":", "").toLowerCase();
    const host = u.hostname.toLowerCase();
    const decodedPath = decodeURIComponent(u.pathname || "/")
      .replace(/\/{2,}/g, "/")
      .replace(/\/$/g, "");
    const pathLower = decodedPath.toLowerCase() || "/";
    const sp = new URLSearchParams(u.search);
    const entries = Array.from(sp.entries())
      .filter(([k, v]) => k.trim() && v !== null && v !== undefined)
      .map(([k, v]) => [k.toLowerCase(), v] as const)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const q = entries.length
      ? "?" + entries.map(([k, v]) => `${k}=${v}`).join("&")
      : "";
    return `${scheme}://${host}${pathLower}${q}`;
  } catch {
    return (raw || "").trim().toLowerCase();
  }
}

function choosePrimary(urls: string[]): string {
  const lowerSet = new Set(urls.map((u) => u.toLowerCase()));
  return Array.from(lowerSet).sort()[0];
}

/* ----------------- gather embeddings from Workspace ----------------- */
function getWorkspaceEmbeddings(ws: any): EmbRow[] {
  // Preferred: a dedicated embeddings array (set via setSiteEmbeddings in Workspace tab)
  const direct =
    ws?.siteEmbeddings ||
    ws?.state?.siteEmbeddings ||
    ws?.state?.embeddingsVectors;
  if (
    Array.isArray(direct) &&
    direct.length &&
    direct[0]?.url &&
    Array.isArray(direct[0]?.embedding)
  ) {
    return direct.map((r: any) => ({
      url: r.url,
      vector: r.embedding,
      relCanonical: r.relCanonical ?? null,
    }));
  }

  // Fallback: parse from raw CSV rows stored in state.embeddingsCsv
  const rows: Record<string, string>[] = ws?.state?.embeddingsCsv || [];
  const out: EmbRow[] = [];
  for (const r of rows) {
    const url = clean(
      r.url ?? r.address ?? r.page ?? r["page url"] ?? r["canonical url"]
    );
    const vec = parseEmbeddingFlexible(r);
    if (!url || !vec) continue;
    out.push({
      url,
      vector: vec,
      relCanonical: r.canonical ?? r.rel_canonical ?? null,
    });
  }
  return out;
}

/* -------------------- canonical grouping + redirects -------------------- */
function groupByCanonical(rows: EmbRow[]) {
  const groupsMap = new Map<string, EmbRow[]>();
  for (const r of rows) {
    const key = canonicalKey(r.url);
    if (!groupsMap.has(key)) groupsMap.set(key, []);
    groupsMap.get(key)!.push(r);
  }
  const groups: CanonGroup[] = [];
  for (const [key, members] of groupsMap.entries()) {
    const primaryUrl = choosePrimary(members.map((m) => m.url));
    const primary =
      members.find((m) => m.url.toLowerCase() === primaryUrl.toLowerCase()) ??
      members[0];
    groups.push({ key, primaryUrl, members, vector: primary.vector });
  }
  return groups;
}

type RedirectSuggestion = {
  from: string;
  to: string;
  reason:
    | "case-variant"
    | "canonical-to-lowercase"
    | "canonical-to-different"
    | "missing-canonical";
  details: string;
  safeToRedirect: boolean;
};

function buildRedirects(
  groups: CanonGroup[],
  canonicalMap: Record<string, string>,
  exactDupCosine = 0.995
): RedirectSuggestion[] {
  const normalizeForMap = (u: string) => {
    try {
      return new URL(u).toString();
    } catch {
      return u.trim();
    }
  };
  const out: RedirectSuggestion[] = [];

  for (const g of groups) {
    const primary = g.members.find(
      (m) => m.url.toLowerCase() === g.primaryUrl.toLowerCase()
    )!;
    const primaryLower = g.primaryUrl;

    for (const m of g.members) {
      if (m === primary) continue;
      const sim = cosine(primary.vector, m.vector);
      if (sim >= exactDupCosine) {
        out.push({
          from: m.url,
          to: primaryLower,
          reason: "case-variant",
          details: `Mixed-case twin with near-identical content (cosine ≥ ${exactDupCosine}).`,
          safeToRedirect: true,
        });
      }
    }

    for (const m of g.members) {
      const raw = m.relCanonical ?? canonicalMap[normalizeForMap(m.url)];
      if (!raw) {
        out.push({
          from: m.url,
          to: primaryLower,
          reason: "missing-canonical",
          details:
            "No rel=canonical detected. Recommend canonical to lowercase and 301.",
          safeToRedirect: false,
        });
        continue;
      }
      let c: URL | null = null;
      try {
        c = new URL(raw, m.url);
      } catch {
        c = null;
      }
      if (!c) {
        out.push({
          from: m.url,
          to: primaryLower,
          reason: "missing-canonical",
          details:
            "Malformed rel=canonical. Fix canonical to lowercase and add 301.",
          safeToRedirect: false,
        });
        continue;
      }
      const canonicalStr = c.toString();
      if (canonicalKey(canonicalStr) === canonicalKey(primaryLower)) {
        if (m.url !== primaryLower) {
          out.push({
            from: m.url,
            to: primaryLower,
            reason: "canonical-to-lowercase",
            details:
              "rel=canonical already points at lowercase. Upgrade to 301.",
            safeToRedirect: true,
          });
        }
      } else {
        out.push({
          from: m.url,
          to: canonicalStr,
          reason: "canonical-to-different",
          details:
            "rel=canonical points elsewhere. Confirm intent; consolidate if content is same.",
          safeToRedirect: false,
        });
      }
    }
  }

  // dedupe by from→to (prefer safer reasons)
  const pr = (r: RedirectSuggestion["reason"]) =>
    r === "canonical-to-lowercase"
      ? 3
      : r === "case-variant"
      ? 2
      : r === "canonical-to-different"
      ? 1
      : 0;
  const seen = new Map<string, RedirectSuggestion>();
  for (const s of out) {
    const k = `${s.from}→${s.to}`;
    const ex = seen.get(k);
    if (!ex || pr(s.reason) > pr(ex.reason)) seen.set(k, s);
    else if (ex && pr(s.reason) === pr(ex.reason))
      ex.safeToRedirect = ex.safeToRedirect || s.safeToRedirect;
  }
  return Array.from(seen.values());
}

/* -------------------- queries/authority helpers (optional) -------------------- */
function mapTopQueryByUrl(rows: Record<string, string>[]) {
  // very forgiving
  const urlKeys = ["url", "address", "page", "page url"];
  const qKeys = ["query", "keyword", "phrase", "search term"];
  const out: Record<string, string> = {};
  for (const r of rows) {
    const url = clean(r[urlKeys.find((k) => r[k] !== undefined) as string]);
    const q = clean(r[qKeys.find((k) => r[k] !== undefined) as string]);
    if (!url || !q) continue;
    if (!out[url]) out[url] = q; // first wins
  }
  return out;
}
function mapAuthorityByUrl(rows: Record<string, string>[]) {
  const urlKeys = ["url", "address", "page", "page url"];
  const authKeys = ["authority", "dr", "links", "score", "clicks"];
  const out: Record<string, number> = {};
  for (const r of rows) {
    const url = clean(r[urlKeys.find((k) => r[k] !== undefined) as string]);
    const k = authKeys.find((k) => r[k] !== undefined);
    if (!url || !k) continue;
    const val = Number(r[k]);
    if (Number.isFinite(val)) out[url] = val;
  }
  return out;
}

/* --------------------- pair finding (top-K + tiers) --------------------- */
type Pair = {
  a: string;
  b: string;
  sim: number;
  tier: "Near-duplicate" | "Cannibalizing" | "High" | "Moderate";
  intentA?: string;
  intentB?: string;
  action: string;
  winner?: string;
};

function tierFor(
  sim: number,
  t: { nd: number; can: number; hi: number; mod: number }
): Pair["tier"] | null {
  if (sim >= t.nd) return "Near-duplicate";
  if (sim >= t.can) return "Cannibalizing";
  if (sim >= t.hi) return "High";
  if (sim >= t.mod) return "Moderate";
  return null;
}

function buildPairs(
  primaries: CanonGroup[],
  opts: {
    thresholds: {
      nd: number;
      can: number;
      hi: number;
      mod: number;
      floor: number;
    };
    topK: number;
    mutualOnly: boolean;
    intentMap?: Record<string, string>;
    authorityMap?: Record<string, number>;
    useIntentGate?: boolean;
    useAuthority?: boolean;
  }
): Pair[] {
  const {
    thresholds,
    topK,
    mutualOnly,
    intentMap,
    authorityMap,
    useIntentGate,
    useAuthority,
  } = opts;
  const P = primaries;
  const byIdx = P.map((p) => ({ url: p.primaryUrl, vec: p.vector }));
  // build naive topK (N is usually manageable; replace with ANN later if needed)
  const neigh: Record<number, Array<{ j: number; sim: number }>> = {};
  for (let i = 0; i < byIdx.length; i++) {
    const arr: Array<{ j: number; sim: number }> = [];
    for (let j = 0; j < byIdx.length; j++) {
      if (i === j) continue;
      arr.push({ j, sim: cosine(byIdx[i].vec, byIdx[j].vec) });
    }
    arr.sort((a, b) => b.sim - a.sim);
    neigh[i] = arr.slice(0, topK);
  }

  const keep: Pair[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < byIdx.length; i++) {
    for (const { j, sim } of neigh[i]) {
      if (sim < thresholds.floor) continue;
      if (mutualOnly && !neigh[j].some((o) => o.j === i)) continue;
      const u = byIdx[i].url,
        v = byIdx[j].url;
      const id = u < v ? `${u}||${v}` : `${v}||${u}`;
      if (seen.has(id)) continue;
      const tier = tierFor(sim, thresholds);
      if (!tier) continue;

      let intentA = intentMap?.[u];
      let intentB = intentMap?.[v];

      // intent gate: if both have intents and they look different, downgrade one tier
      let gatedTier = tier;
      if (useIntentGate && intentA && intentB) {
        const a = normalizeKey(intentA),
          b = normalizeKey(intentB);
        if (a && b && a !== b) {
          if (gatedTier === "Near-duplicate") gatedTier = "Cannibalizing";
          else if (gatedTier === "Cannibalizing") gatedTier = "High";
          else if (gatedTier === "High") gatedTier = "Moderate";
          else gatedTier = "Moderate";
        }
      }

      let action =
        gatedTier === "Near-duplicate"
          ? "Merge/canonicalize or 301"
          : gatedTier === "Cannibalizing"
          ? "Consolidate into a single canonical"
          : gatedTier === "High"
          ? "Keep both only if intents differ; else consolidate"
          : "Tighten scopes or interlink with clear anchors";

      let winner: string | undefined = undefined;
      if (useAuthority && authorityMap) {
        const Au = authorityMap[u] ?? -Infinity;
        const Av = authorityMap[v] ?? -Infinity;
        if (Number.isFinite(Au) || Number.isFinite(Av)) {
          winner = Au >= Av ? u : v;
        }
      }

      keep.push({
        a: u,
        b: v,
        sim,
        tier: gatedTier,
        intentA,
        intentB,
        action,
        winner,
      });
      seen.add(id);
    }
  }
  // sort by severity then similarity
  const rank = (t: Pair["tier"]) =>
    t === "Near-duplicate"
      ? 4
      : t === "Cannibalizing"
      ? 3
      : t === "High"
      ? 2
      : 1;
  keep.sort((x, y) => rank(y.tier) - rank(x.tier) || y.sim - x.sim);
  return keep;
}

/* --------------------------------- UI --------------------------------- */

const Card: React.FC<{
  title: string;
  right?: React.ReactNode;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ title, right, children, style }) => (
  <div
    style={{
      background: "#fff",
      border: "1px solid #e5e7eb",
      borderRadius: 12,
      padding: 16,
      ...style,
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 8,
      }}
    >
      <div style={{ fontWeight: 700 }}>{title}</div>
      {right}
    </div>
    {children}
  </div>
);

export default function CannibalizationTab() {
  const ws = useWorkspace!();
  const embeddingsWS: EmbRow[] = React.useMemo(
    () => getWorkspaceEmbeddings(ws),
    [ws]
  );

  // derive primaries immediately from workspace embeddings
  const primaries = React.useMemo(
    () => groupByCanonical(embeddingsWS),
    [embeddingsWS]
  );

  // queries / authority maps (optional)
  const intentMap = React.useMemo(
    () => mapTopQueryByUrl(ws?.state?.queriesCsv || []),
    [ws]
  );
  const authorityMap = React.useMemo(
    () => mapAuthorityByUrl(ws?.state?.authorityCsv || []),
    [ws]
  );

  // thresholds & toggles
  const [preset, setPreset] = React.useState<"strict" | "balanced" | "loose">(
    "strict"
  );
  const [t, setT] = React.useState({
    nd: 0.97,
    can: 0.94,
    hi: 0.9,
    mod: 0.85,
    floor: 0.85,
  });
  const [topK, setTopK] = React.useState(10);
  const [mutualOnly, setMutualOnly] = React.useState(true);
  const [useIntentGate, setUseIntentGate] = React.useState(true);
  const [useAuthority, setUseAuthority] = React.useState(true);

  // canonicals upload (optional)
  const [canonMap, setCanonMap] = React.useState<Record<string, string>>({});
  const [canonFile, setCanonFile] = React.useState<File | null>(null);

  // run state
  const [running, setRunning] = React.useState(false);
  const [pairs, setPairs] = React.useState<Pair[]>([]);
  const [redirects, setRedirects] = React.useState<RedirectSuggestion[]>([]);
  const [lastRun, setLastRun] = React.useState<string>("");

  // handle presets
  React.useEffect(() => {
    if (preset === "strict")
      setT({ nd: 0.97, can: 0.94, hi: 0.9, mod: 0.85, floor: 0.85 });
    if (preset === "balanced")
      setT({ nd: 0.965, can: 0.935, hi: 0.895, mod: 0.845, floor: 0.85 });
    if (preset === "loose")
      setT({ nd: 0.96, can: 0.93, hi: 0.89, mod: 0.84, floor: 0.85 });
  }, [preset]);

  // load canonicals CSV
  React.useEffect(() => {
    let ignore = false;
    (async () => {
      if (!canonFile) {
        setCanonMap({});
        return;
      }
      const { rows } = await readCsv!(canonFile);
      const out: Record<string, string> = {};
      for (const r of rows) {
        const u = clean(r.url ?? r.address ?? r.source ?? "");
        const c = clean(
          r.canonical ?? r.canonical_url ?? r.rel_canonical ?? ""
        );
        if (!u || !c) continue;
        try {
          out[new URL(u).toString()] = c;
        } catch {}
      }
      if (!ignore) setCanonMap(out);
    })();
    return () => {
      ignore = true;
    };
  }, [canonFile]);

  const canRun = primaries.length > 0 && !running;

  const handleRun = () => {
    if (!canRun) return;
    setRunning(true);
    // build pairs
    const ps = buildPairs(primaries, {
      thresholds: t,
      topK,
      mutualOnly,
      intentMap,
      authorityMap,
      useIntentGate,
      useAuthority,
    });
    // build redirects (mixed-case, canonicals)
    const reds = buildRedirects(primaries, canonMap, 0.995);
    setPairs(ps);
    setRedirects(reds);
    setRunning(false);
    setLastRun(new Date().toLocaleString());
  };

  const exportPairs = () => {
    if (!pairs.length) return;
    const rows = pairs.map((p) => ({
      url_a: p.a,
      url_b: p.b,
      cosine: p.sim.toFixed(5),
      tier: p.tier,
      intent_a: p.intentA ?? "",
      intent_b: p.intentB ?? "",
      action: p.action,
      winner: p.winner ?? "",
    }));
    const cols = Object.keys(rows[0]);
    const esc = (v: string) =>
      /[,"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    const csv = [
      cols.join(","),
      ...rows.map((r) =>
        cols.map((c) => esc(String((r as any)[c] ?? ""))).join(",")
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cannibalization_pairs.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  const exportRedirects = () => {
    if (!redirects.length) return;
    const rows = redirects.map((s) => ({
      from: s.from,
      to: s.to,
      reason: s.reason,
      safe_to_redirect: s.safeToRedirect ? "yes" : "check",
      details: s.details,
    }));
    const cols = Object.keys(rows[0]);
    const esc = (v: string) =>
      /[,"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    const csv = [
      cols.join(","),
      ...rows.map((r) =>
        cols.map((c) => esc(String((r as any)[c] ?? ""))).join(",")
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "redirects_mixed_case.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ------------------------------ render ------------------------------ */
  const S = {
    row: {
      display: "grid",
      gridTemplateColumns: "1fr",
      gap: 12,
    } as React.CSSProperties,
    grid3: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
      gap: 12,
    } as React.CSSProperties,
    badge: (txt: string) =>
      ({
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        background:
          txt === "Near-duplicate"
            ? "#fee2e2"
            : txt === "Cannibalizing"
            ? "#ffedd5"
            : txt === "High"
            ? "#fef3c7"
            : "#e0f2fe",
        color: "#111827",
        border: "1px solid #e5e7eb",
      } as React.CSSProperties),
    small: { fontSize: 12, color: "#6b7280" } as React.CSSProperties,
    btn: (primary = false, disabled = false) =>
      ({
        padding: "8px 12px",
        borderRadius: 8,
        border: `1px solid ${primary ? "#1e40af" : "#e5e7eb"}`,
        background: disabled
          ? "#f3f4f6"
          : primary
          ? "linear-gradient(135deg,#2563eb 0%,#1e40af 100%)"
          : "#fff",
        color: disabled ? "#9ca3af" : primary ? "#fff" : "#111827",
        cursor: disabled ? "not-allowed" : "pointer",
        fontWeight: 600,
      } as React.CSSProperties),
    inputNum: {
      width: 90,
      padding: "6px 8px",
      border: "1px solid #e5e7eb",
      borderRadius: 8,
    } as React.CSSProperties,
    tableWrap: {
      overflowX: "auto",
      border: "1px solid #e5e7eb",
      borderRadius: 8,
    } as React.CSSProperties,
    th: {
      background: "#f9fafb",
      padding: "10px 12px",
      textAlign: "left",
      fontWeight: 600,
      borderBottom: "1px solid #e5e7eb",
      whiteSpace: "nowrap",
    } as React.CSSProperties,
    td: {
      padding: "10px 12px",
      borderBottom: "1px solid #f3f4f6",
      verticalAlign: "top",
    } as React.CSSProperties,
  };

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gap: 16 }}>
      <Card
        title="Cannibalization Check"
        right={
          <button
            style={S.btn(true, !canRun)}
            onClick={handleRun}
            disabled={!canRun}
            title={
              canRun ? "Run analysis" : "Upload embeddings in Workspace first"
            }
          >
            {running ? "Running…" : "Find Cannibalization"}
          </button>
        }
      >
        <div style={S.grid3}>
          <div>
            Embeddings (from Workspace): <b>{embeddingsWS.length}</b>
          </div>
          <div>
            Primaries (case-collapsed): <b>{primaries.length}</b>
          </div>
          <div>
            Queries available: <b>{Object.keys(intentMap).length}</b>
          </div>
          <div>
            Authority rows: <b>{Object.keys(authorityMap).length}</b>
          </div>
          <div>
            Last run: <span style={S.small}>{lastRun || "—"}</span>
          </div>
        </div>
        {!canRun && (
          <div style={{ marginTop: 10, color: "#b45309", fontSize: 13 }}>
            Tip: Go to <b>Workspace</b> and upload your Embeddings CSV first.
            This tab uses those automatically.
          </div>
        )}
      </Card>

      <Card title="Settings">
        <div style={S.grid3}>
          <div>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
              Preset
            </div>
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value as any)}
              style={{
                padding: "8px 10px",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
              }}
            >
              <option value="strict">Strict (0.97/0.94/0.90/0.85)</option>
              <option value="balanced">
                Balanced (0.965/0.935/0.895/0.845)
              </option>
              <option value="loose">Loose (0.96/0.93/0.89/0.84)</option>
            </select>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
              Floor (report min)
            </div>
            <input
              type="number"
              step="0.001"
              min={0}
              max={1}
              value={t.floor}
              onChange={(e) =>
                setT({ ...t, floor: parseFloat(e.target.value) || 0.85 })
              }
              style={S.inputNum}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
              Top-K neighbors
            </div>
            <input
              type="number"
              min={1}
              max={100}
              value={topK}
              onChange={(e) => setTopK(parseInt(e.target.value || "10", 10))}
              style={S.inputNum}
            />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={mutualOnly}
              onChange={(e) => setMutualOnly(e.target.checked)}
            />{" "}
            Mutual neighbors only
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={useIntentGate}
              onChange={(e) => setUseIntentGate(e.target.checked)}
            />{" "}
            Use intent gate (if queries)
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={useAuthority}
              onChange={(e) => setUseAuthority(e.target.checked)}
            />{" "}
            Use authority tie-breaker
          </label>
        </div>
      </Card>

      <Card
        title={`Cannibalization Pairs (${pairs.length})`}
        right={
          <button
            style={S.btn(false, pairs.length === 0)}
            onClick={exportPairs}
            disabled={pairs.length === 0}
          >
            Export pairs CSV
          </button>
        }
      >
        {pairs.length === 0 ? (
          <div style={{ color: "#6b7280" }}>
            No pairs found above the floor. Adjust thresholds and click{" "}
            <b>Find Cannibalization</b>.
          </div>
        ) : (
          <div style={S.tableWrap}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
              }}
            >
              <thead>
                <tr>
                  <th style={S.th}>Tier</th>
                  <th style={S.th}>Cosine</th>
                  <th style={S.th}>URL A</th>
                  <th style={S.th}>URL B</th>
                  <th style={S.th}>Intent A</th>
                  <th style={S.th}>Intent B</th>
                  <th style={S.th}>Action</th>
                  <th style={S.th}>Winner</th>
                </tr>
              </thead>
              <tbody>
                {pairs.map((p, i) => (
                  <tr key={i}>
                    <td style={S.td}>
                      <span style={S.badge(p.tier)}>{p.tier}</span>
                    </td>
                    <td style={S.td}>{p.sim.toFixed(4)}</td>
                    <td style={S.td}>
                      <a href={p.a} target="_blank" rel="noreferrer">
                        {p.a}
                      </a>
                    </td>
                    <td style={S.td}>
                      <a href={p.b} target="_blank" rel="noreferrer">
                        {p.b}
                      </a>
                    </td>
                    <td style={S.td}>{p.intentA ?? ""}</td>
                    <td style={S.td}>{p.intentB ?? ""}</td>
                    <td style={S.td}>{p.action}</td>
                    <td style={S.td}>
                      {p.winner ? (
                        <a href={p.winner} target="_blank" rel="noreferrer">
                          {p.winner}
                        </a>
                      ) : (
                        ""
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card
        title={`Mixed-Case Redirects (${redirects.length})`}
        right={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <label style={{ fontSize: 12, color: "#6b7280" }}>
              Canonicals CSV &nbsp;
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setCanonFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <button
              style={S.btn(false, redirects.length === 0)}
              onClick={exportRedirects}
              disabled={redirects.length === 0}
            >
              Export redirects CSV
            </button>
          </div>
        }
      >
        {redirects.length === 0 ? (
          <div style={{ color: "#6b7280" }}>
            No mixed-case issues detected (or no canonicals provided).
          </div>
        ) : (
          <div style={S.tableWrap}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
              }}
            >
              <thead>
                <tr>
                  <th style={S.th}>From</th>
                  <th style={S.th}>To</th>
                  <th style={S.th}>Reason</th>
                  <th style={S.th}>Safety</th>
                  <th style={S.th}>Details</th>
                </tr>
              </thead>
              <tbody>
                {redirects.map((s, i) => (
                  <tr key={i}>
                    <td style={S.td}>
                      <a href={s.from} target="_blank" rel="noreferrer">
                        {s.from}
                      </a>
                    </td>
                    <td style={S.td}>
                      <a href={s.to} target="_blank" rel="noreferrer">
                        {s.to}
                      </a>
                    </td>
                    <td style={S.td} className="capitalize">
                      {s.reason.replaceAll("-", " ")}
                    </td>
                    <td style={S.td}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: 999,
                          fontSize: 12,
                          background: s.safeToRedirect ? "#dcfce7" : "#fef9c3",
                          border: "1px solid #e5e7eb",
                        }}
                      >
                        {s.safeToRedirect ? "Safe to 301" : "Needs check"}
                      </span>
                    </td>
                    <td style={S.td}>{s.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
