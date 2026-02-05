import React, { useMemo, useState, useRef } from "react";
import {
  Link as LinkIcon,
  Upload,
  CheckCircle,
  Sparkles,
  Target,
  Database,
  Download,
  Clock,
} from "lucide-react";
import { readCsv, DEFAULT_ALIASES, CsvRow, getValue } from "../lib/csv";
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

/** ----------------------- Forgiving embedding parser + header lookup ----------------------- */
const BOM = "\uFEFF";
const NBSP = String.fromCharCode(160);
const clean = (v: unknown) =>
  String(v ?? "")
    .replace(new RegExp(BOM, "g"), "")
    .replace(new RegExp(NBSP, "g"), " ")
    .trim();

// Safely try multiple header candidates by calling getValue with one key at a time
const getFirstValue = (row: CsvRow, keys: string[]): string | undefined => {
  for (const k of keys) {
    const v = getValue(row, k as any, DEFAULT_ALIASES) as unknown;
    const sv = v == null ? "" : String(v).trim();
    if (sv) return sv;
  }
  return undefined;
};

const parseEmbedding = (row: CsvRow): number[] | null => {
  const raw =
    getFirstValue(row, ["vector", "embedding", "embeddings", "vec"]) ?? "";
  const txt = clean(raw);

  // Try JSON first
  if (txt) {
    try {
      const parsed = JSON.parse(txt);
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === "number"))
        return parsed as number[];
    } catch {
      // fall through to manual parse
    }
  }

  // Fallback: try manual parsing of comma-separated numbers
  const manual = txt
    .replace(/[[\\]\\s]+/g, "") // remove brackets and spaces
    .split(/[;,]/)
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n));
  if (manual.length > 2) return manual;

  // Fallback: look for v1..vd columns
  const keys = Object.keys(row)
    .filter((k) => /^v\\d+$/i.test(clean(k)))
    .sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
  if (keys.length > 2) {
    const arr: number[] = [];
    for (const k of keys) {
      const n = Number((row as any)[k]);
      if (Number.isFinite(n)) arr.push(n);
    }
    if (arr.length > 2) return arr;
  }

  return null;
};

const pickUrl = (row: CsvRow): string =>
  clean(
    getFirstValue(row, [
      "url",
      "address",
      "page",
      "page_url",
      "canonical",
      "loc",
      "target",
    ]) ?? ""
  );

/** ------------------------------ Types ------------------------------ */
type Candidate = { url: string; vec: Float32Array; authority?: number };
type Target = { url: string; vec: Float32Array };
type Opp = {
  direction: "TO" | "FROM";
  url: string;
  similarityScore: number; // 0..1
  linkValue: "excellent" | "strong" | "good" | "fair";
  recommendation: string;
};

/** ---------------------------- Component ---------------------------- */
const LinkingTab: React.FC = () => {
  const { state } = useWorkspace();
  const [targetPage, setTargetPage] = useState<Target | null>(null);
  const [externalCandidates, setExternalCandidates] = useState<Candidate[]>([]);
  const [linkingOptions, setLinkingOptions] = useState({
    topN: 50,
    minSimilarity: 0.7,
    bidirectional: false,
    includeWorkspaceEmbeddings: true,
  });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [opps, setOpps] = useState<Opp[] | null>(null);

  // Refs for bulletproof file picking (works even if labels are nested or CSS interferes)
  const targetInputRef = useRef<HTMLInputElement>(null);
  const candidateInputRef = useRef<HTMLInputElement>(null);

  const workspaceCandidates: Candidate[] = useMemo(() => {
    const rows = state.embeddingsCsv ?? [];
    const out: Candidate[] = [];
    for (const r of rows) {
      const url = pickUrl(r);
      const vec = parseEmbedding(r);
      if (!url || !vec) continue;
      const authRaw = getFirstValue(r, ["authority", "dr", "score", "clicks"]);
      const authority = Number(authRaw);
      out.push({
        url,
        vec: new Float32Array(vec),
        authority: Number.isFinite(authority) ? authority : undefined,
      });
    }
    return out;
  }, [state.embeddingsCsv]);

  const allCandidates = useMemo(() => {
    const merged = linkingOptions.includeWorkspaceEmbeddings
      ? [...workspaceCandidates, ...externalCandidates]
      : [...externalCandidates];
    const seen = new Map<string, Candidate>();
    for (const c of merged) seen.set(c.url.toLowerCase(), c);
    return Array.from(seen.values());
  }, [
    externalCandidates,
    workspaceCandidates,
    linkingOptions.includeWorkspaceEmbeddings,
  ]);

  /** ------------------------------ Uploads ------------------------------ */
  const handleTargetPageUpload = async (
    ev: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    const parsed = await readCsv(file, { aliases: DEFAULT_ALIASES });
    for (const r of parsed.rows) {
      const url = pickUrl(r);
      const vec = parseEmbedding(r);
      if (url && vec) {
        setTargetPage({ url, vec: new Float32Array(vec) });
        break;
      }
    }
    if (targetInputRef.current) targetInputRef.current.value = "";
  };

  const handleLinkingCandidatesUpload = async (
    ev: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    const parsed = await readCsv(file, { aliases: DEFAULT_ALIASES });
    const out: Candidate[] = [];
    for (const r of parsed.rows) {
      const url = pickUrl(r);
      const vec = parseEmbedding(r);
      if (!url || !vec) continue;
      const authRaw = getFirstValue(r, ["authority", "dr", "score", "clicks"]);
      const authority = Number(authRaw);
      out.push({
        url,
        vec: new Float32Array(vec),
        authority: Number.isFinite(authority) ? authority : undefined,
      });
    }
    setExternalCandidates(out);
    if (candidateInputRef.current) candidateInputRef.current.value = "";
  };

  /** ------------------------------ Analysis ------------------------------ */
  const bucket = (sim: number): Opp["linkValue"] => {
    if (sim >= 0.9) return "excellent";
    if (sim >= 0.8) return "strong";
    if (sim >= 0.7) return "good";
    return "fair";
  };

  const recFor = (dir: Opp["direction"], sim: number): string => {
    if (dir === "TO") {
      if (sim >= 0.9)
        return "Add contextual anchor to target in first scroll-depth.";
      if (sim >= 0.8)
        return "Add in-body anchor with descriptive text to target.";
      if (sim >= 0.7) return "Add link in related-reading section to target.";
      return "Consider a soft link (e.g., ‘learn more’) to target.";
    } else {
      if (sim >= 0.9) return "From target, add a hub link to this page.";
      if (sim >= 0.8) return "From target, add a contextual cross-link.";
      if (sim >= 0.7) return "From target, add link in related-reading.";
      return "Optional mention from target.";
    }
  };

  const analyze = async () => {
    if (!targetPage || allCandidates.length === 0) return;
    setIsAnalyzing(true);
    setOpps(null);
    const results: Opp[] = [];
    const tgt = targetPage;

    const norm = (v: Float32Array) =>
      Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    const l2 = (v: Float32Array) => {
      const n = norm(v) || 1;
      const out = new Float32Array(v.length);
      for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
      return out;
    };

    const uT = l2(tgt.vec);
    const work = allCandidates.filter(
      (c) => c.url.toLowerCase() !== tgt.url.toLowerCase()
    );
    setProgress({ current: 0, total: work.length });

    const chunk = 256;
    for (let i = 0; i < work.length; i += chunk) {
      const slice = work.slice(i, i + chunk);
      for (const c of slice) {
        const uC = l2(c.vec);
        let sim = 0;
        const len = Math.min(uC.length, uT.length);
        for (let k = 0; k < len; k++) sim += uC[k] * uT[k];

        if (sim >= linkingOptions.minSimilarity) {
          results.push({
            direction: "TO",
            url: c.url,
            similarityScore: sim,
            linkValue: bucket(sim),
            recommendation: recFor("TO", sim),
          });
          if (linkingOptions.bidirectional) {
            results.push({
              direction: "FROM",
              url: c.url,
              similarityScore: sim,
              linkValue: bucket(sim),
              recommendation: recFor("FROM", sim),
            });
          }
        }
      }
      setProgress((p) => ({
        ...p,
        current: Math.min(p.current + slice.length, work.length),
      }));
      await new Promise((r) => setTimeout(r, 0));
    }

    const byDir = (d: Opp["direction"]) =>
      results
        .filter((o) => o.direction === d)
        .sort((a, b) => b.similarityScore - a.similarityScore)
        .slice(0, linkingOptions.topN);

    const final = linkingOptions.bidirectional
      ? [...byDir("TO"), ...byDir("FROM")]
      : byDir("TO");
    setOpps(final);
    setIsAnalyzing(false);
  };

  const exportCsv = () => {
    if (!opps || !targetPage) return;
    const header = [
      "target_url",
      "direction",
      "candidate_url",
      "similarity",
      "link_value",
      "recommendation",
    ];
    const lines = [header.join(",")];
    for (const o of opps) {
      lines.push(
        [
          JSON.stringify(targetPage.url),
          o.direction,
          JSON.stringify(o.url),
          o.similarityScore.toFixed(4),
          o.linkValue,
          JSON.stringify(o.recommendation),
        ].join(",")
      );
    }
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "internal_link_opportunities.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  /** ------------------------------ Render ------------------------------ */
  const totalCandidates = allCandidates.length;

  return (
    <div style={styles.tabContent}>
      <h2 style={styles.sectionHeader}>
        <LinkIcon size={28} />
        Internal Link Engineering
      </h2>

      <div style={styles.infoPanel}>
        <h4 style={{ fontWeight: "bold", color: "#1e40af", marginBottom: 12 }}>
          🔗 Semantic Link Opportunity Analysis
        </h4>
        <p style={{ color: "#1e40af", margin: 0 }}>
          Discover internal linking opportunities using vector similarity. Use a
          target page and analyze against Workspace embeddings and/or an
          uploaded crawl to find natural, contextual internal links.
        </p>
      </div>

      {state.embeddingsCsv?.length ? (
        <div style={styles.successPanel}>
          <h4
            style={{ fontWeight: "bold", color: "#047857", marginBottom: 12 }}
          >
            ✅ Workspace Embeddings Available
          </h4>
          <p style={{ color: "#047857", margin: 0 }}>
            Found {state.embeddingsCsv.length.toLocaleString()} pages in
            Workspace. You can include these automatically as candidates.
          </p>
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 32,
          marginBottom: 32,
        }}
      >
        {/* Target Page Upload */}
        <div style={styles.inputGroupOrange}>
          <label style={styles.label}>
            <Target size={16} color="#f97316" />
            Target Page (Needs Links)
          </label>
          <div style={styles.uploadArea}>
            {/* Hidden but clickable via ref */}
            <input
              ref={targetInputRef}
              type="file"
              accept=".csv"
              onChange={handleTargetPageUpload}
              style={{
                position: "absolute",
                left: -9999,
                width: 1,
                height: 1,
                opacity: 0,
              }}
            />
            <Upload
              size={24}
              color="#6b7280"
              style={{ margin: "0 auto 8px", display: "block" }}
            />
            <p style={{ color: "#6b7280", fontSize: 14, margin: "0 0 8px 0" }}>
              Upload CSV with target URL + embedding (first valid row is used)
            </p>
            <div
              onClick={() => targetInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) =>
                (e.key === "Enter" || e.key === " ") &&
                targetInputRef.current?.click()
              }
              style={{
                background: "#f97316",
                color: "white",
                padding: "6px 12px",
                borderRadius: 6,
                display: "inline-block",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Choose Target Page
            </div>
          </div>
          {targetPage && (
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
              <span>
                ✅ Target: {targetPage.url.substring(0, 60)}
                {targetPage.url.length > 60 ? "…" : ""}
              </span>
            </div>
          )}
        </div>

        {/* Linking Candidates Upload */}
        <div style={styles.inputGroupPurple}>
          <label style={styles.label}>
            <Database size={16} color="#7c3aed" />
            Linking Candidates (Optional Crawl)
          </label>
          <div style={styles.uploadArea}>
            <input
              ref={candidateInputRef}
              type="file"
              accept=".csv"
              onChange={handleLinkingCandidatesUpload}
              style={{
                position: "absolute",
                left: -9999,
                width: 1,
                height: 1,
                opacity: 0,
              }}
            />
            <Upload
              size={24}
              color="#6b7280"
              style={{ margin: "0 auto 8px", display: "block" }}
            />
            <p style={{ color: "#6b7280", fontSize: 14, margin: "0 0 8px 0" }}>
              Upload CSV with URLs + pre-calculated embeddings (optional)
            </p>
            <div
              onClick={() => candidateInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) =>
                (e.key === "Enter" || e.key === " ") &&
                candidateInputRef.current?.click()
              }
              style={{
                background: "#7c3aed",
                color: "white",
                padding: "6px 12px",
                borderRadius: 6,
                display: "inline-block",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Choose Candidate Pages
            </div>
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
                {totalCandidates.toLocaleString()} pages ready (Workspace{" "}
                {linkingOptions.includeWorkspaceEmbeddings
                  ? "included"
                  : "excluded"}
                {externalCandidates.length
                  ? `, + ${externalCandidates.length.toLocaleString()} from upload`
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
                  checked={linkingOptions.includeWorkspaceEmbeddings}
                  onChange={(e) =>
                    setLinkingOptions((o) => ({
                      ...o,
                      includeWorkspaceEmbeddings: e.target.checked,
                    }))
                  }
                />
                Include Workspace embeddings as candidates
              </label>
            ) : null}
          </div>
        </div>
      </div>

      {/* Analysis Options */}
      <div style={{ marginBottom: 32 }}>
        <h3
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: "#1f2937",
            marginBottom: 16,
          }}
        >
          Analysis Options
        </h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 16,
          }}
        >
          <div
            style={{
              padding: 16,
              background: "#f9fafb",
              borderRadius: 8,
              border: "1px solid #e5e7eb",
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 14,
                fontWeight: 500,
                color: "#374151",
              }}
            >
              <input
                type="number"
                value={linkingOptions.topN}
                onChange={(e) =>
                  setLinkingOptions((o) => ({
                    ...o,
                    topN: Math.max(1, parseInt(e.target.value) || 50),
                  }))
                }
                style={{
                  width: 72,
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                }}
              />
              Top Results to Show
            </label>
          </div>

          <div
            style={{
              padding: 16,
              background: "#f9fafb",
              borderRadius: 8,
              border: "1px solid #e5e7eb",
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 14,
                fontWeight: 500,
                color: "#374151",
              }}
            >
              <input
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={linkingOptions.minSimilarity}
                onChange={(e) =>
                  setLinkingOptions((o) => ({
                    ...o,
                    minSimilarity: Math.min(
                      1,
                      Math.max(0, parseFloat(e.target.value) || 0.7)
                    ),
                  }))
                }
                style={{
                  width: 72,
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                }}
              />
              Min Similarity (0–1)
            </label>
          </div>

          <div
            style={{
              padding: 16,
              background: "#f9fafb",
              borderRadius: 8,
              border: "1px solid #e5e7eb",
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 14,
                fontWeight: 500,
                color: "#374151",
              }}
            >
              <input
                type="checkbox"
                checked={linkingOptions.bidirectional}
                onChange={(e) =>
                  setLinkingOptions((o) => ({
                    ...o,
                    bidirectional: e.target.checked,
                  }))
                }
              />
              Bidirectional (suggest links TO target and FROM target)
            </label>
          </div>
        </div>
      </div>

      {/* Generate Button */}
      <div
        style={{ display: "flex", justifyContent: "center", marginBottom: 32 }}
      >
        <button
          onClick={analyze}
          disabled={!targetPage || totalCandidates === 0 || isAnalyzing}
          style={{
            ...styles.generateButton,
            ...(!targetPage || totalCandidates === 0 || isAnalyzing
              ? styles.generateButtonDisabled
              : {}),
          }}
        >
          {isAnalyzing ? (
            <>
              <Clock
                size={18}
                style={{ animation: "spin 1s linear infinite" as any }}
              />
              <span>
                Analyzing {progress.current}/{progress.total}…
              </span>
            </>
          ) : (
            <>
              <LinkIcon size={18} />
              <span>Find Link Opportunities</span>
              <Sparkles size={16} />
            </>
          )}
        </button>
      </div>

      {/* Results */}
      {opps && targetPage && (
        <div style={{ marginBottom: 32 }}>
          <h3
            style={{
              fontSize: 18,
              fontWeight: "bold",
              color: "#1f2937",
              margin: "0 0 20px 0",
            }}
          >
            Link Opportunity Analysis
          </h3>

          <div style={styles.successPanel}>
            <h4
              style={{ fontWeight: "bold", color: "#047857", marginBottom: 12 }}
            >
              ✅ Analysis Complete
            </h4>
            <p style={{ color: "#047857", margin: 0 }}>
              Target: <strong>{targetPage.url}</strong>. Showing{" "}
              {opps.length.toLocaleString()} opportunities above{" "}
              {(linkingOptions.minSimilarity * 100).toFixed(0)}% similarity.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr 1fr",
              gap: 20,
              margin: "20px 0 24px",
            }}
          >
            {(["excellent", "strong", "good", "fair"] as const).map((lvl) => {
              const count = opps.filter((o) => o.linkValue === lvl).length;
              const labelMap: Record<typeof lvl, string> = {
                excellent: "Excellent Matches",
                strong: "Strong Matches",
                good: "Good Matches",
                fair: "Fair Matches",
              } as any;
              const colorMap: Record<typeof lvl, string> = {
                excellent: "#10b981",
                strong: "#f59e0b",
                good: "#3b82f6",
                fair: "#8b5cf6",
              } as any;
              const borderMap: Record<typeof lvl, string> = {
                excellent: "#10b981",
                strong: "#f59e0b",
                good: "#3b82f6",
                fair: "#8b5cf6",
              } as any;
              return (
                <div
                  key={lvl}
                  style={{
                    ...styles.metricCard,
                    borderLeft: `4px solid ${borderMap[lvl]}`,
                  }}
                >
                  <h4
                    style={{
                      fontSize: 14,
                      fontWeight: "bold",
                      color: "#1f2937",
                      margin: "0 0 8px 0",
                    }}
                  >
                    {labelMap[lvl]}
                  </h4>
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: "bold",
                      color: colorMap[lvl],
                      margin: "0 0 4px 0",
                    }}
                  >
                    {count}
                  </div>
                  <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>
                    {lvl === "excellent"
                      ? "90%+ similarity"
                      : lvl === "strong"
                      ? "80–90% similarity"
                      : lvl === "good"
                      ? "70–80% similarity"
                      : "50–70% similarity"}
                  </p>
                </div>
              );
            })}
          </div>

          <div style={styles.dataTable}>
            <div style={styles.tableHeader}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: linkingOptions.bidirectional
                    ? "90px 3fr 90px 2fr"
                    : "3fr 90px 2fr",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                {linkingOptions.bidirectional && <div>Direction</div>}
                <div>Page URL</div>
                <div>Similarity</div>
                <div>Recommendation</div>
              </div>
            </div>

            <div style={{ maxHeight: 520, overflowY: "auto" }}>
              {opps.map((opp, idx) => (
                <div
                  key={idx}
                  style={{
                    ...styles.tableRow,
                    display: "grid",
                    gridTemplateColumns: linkingOptions.bidirectional
                      ? "90px 3fr 90px 2fr"
                      : "3fr 90px 2fr",
                    gap: 12,
                    alignItems: "start",
                  }}
                >
                  {linkingOptions.bidirectional && (
                    <div
                      style={{
                        fontSize: 12,
                        padding: "4px 8px",
                        borderRadius: 6,
                        background:
                          opp.direction === "TO" ? "#dbeafe" : "#dcfce7",
                        color: opp.direction === "TO" ? "#1e40af" : "#059669",
                        textAlign: "center",
                        fontWeight: 700,
                      }}
                    >
                      {opp.direction === "TO" ? "→ TO" : "FROM ←"}
                    </div>
                  )}
                  <div
                    style={{
                      fontWeight: 600,
                      color: "#1f2937",
                      fontSize: 13,
                      wordBreak: "break-all",
                    }}
                    title={opp.url}
                  >
                    {opp.url.length > 80 ? opp.url.slice(0, 80) + "…" : opp.url}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color:
                        opp.similarityScore >= 0.9
                          ? "#10b981"
                          : opp.similarityScore >= 0.8
                          ? "#f59e0b"
                          : opp.similarityScore >= 0.7
                          ? "#3b82f6"
                          : "#8b5cf6",
                    }}
                  >
                    {(opp.similarityScore * 100).toFixed(1)}%
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    {opp.recommendation}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{ marginTop: 20, display: "flex", justifyContent: "center" }}
          >
            <button
              onClick={exportCsv}
              style={{
                background: "#3b82f6",
                color: "#fff",
                padding: "12px 24px",
                borderRadius: 10,
                border: "none",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                gap: 8,
                alignItems: "center",
              }}
            >
              <Download size={16} />
              Export Link Opportunities
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LinkingTab;
